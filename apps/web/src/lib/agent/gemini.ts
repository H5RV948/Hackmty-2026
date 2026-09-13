/**
 * Capa de Gemini: cliente compartido y loop de razonamiento con tools MCP.
 *
 * Los tipos del SDK cambian entre versiones menores, asi que aqui declaramos
 * las formas minimas que usamos en vez de importar sus tipos internos. El
 * unico import de valor es GoogleGenAI.
 */
import { GoogleGenAI } from "@google/genai";
import type { McpSession, ToolResult } from "./mcp";

/**
 * Cadena de modelos.
 *
 * La cuota gratuita de Gemini es POR MODELO y por dia (el free tier de
 * gemini-3.6-flash son 20 peticiones diarias, que se acaban en una tarde de
 * pruebas). Cuando uno se agota con 429, o no existe para la cuenta con 404,
 * pasamos al siguiente en vez de tumbar la demo. El primero siempre es el que
 * diga GEMINI_MODEL en el .env.
 *
 * Esto es un paliativo para el hackathon, no una solucion: lo correcto es
 * habilitar facturacion en el proyecto de Google Cloud.
 */
const MODELOS = [
  ...new Set(
    [
      process.env.GEMINI_MODEL,
      "gemini-3.6-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-2.5-flash-lite",
    ].filter((m): m is string => Boolean(m)),
  ),
];

/** Indice del modelo que sabemos que responde. Se recuerda entre requests. */
let modeloActivo = 0;

function textoDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** El modelo no sirve para esta cuenta hoy: cuota agotada o no existe. */
function esCuotaONoExiste(error: unknown): boolean {
  const texto = textoDe(error);
  return (
    texto.includes("RESOURCE_EXHAUSTED") ||
    texto.includes("429") ||
    texto.includes("NOT_FOUND") ||
    texto.includes("no longer available")
  );
}

/**
 * Saturacion pasajera del lado de Google (503 UNAVAILABLE), no un problema de
 * la cuenta. Distinguirlo del 429 importa: aqui el mismo modelo si va a volver
 * a funcionar en unos segundos, asi que conviene reintentarlo antes de irnos a
 * otro que quiza sea peor para la tarea.
 */
function esSaturacionPasajera(error: unknown): boolean {
  const texto = textoDe(error);
  return (
    texto.includes("UNAVAILABLE") ||
    texto.includes("503") ||
    texto.includes("overloaded") ||
    texto.includes("high demand")
  );
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Corre `fn` con el modelo activo y, si se topa con cuota o el modelo no
 * existe, reintenta con el siguiente de la cadena.
 */
async function conModeloDisponible<T>(fn: (modelo: string) => Promise<T>): Promise<T> {
  let ultimoError: unknown = new Error("No hay modelos configurados.");

  for (let i = 0; i < MODELOS.length; i++) {
    const indice = (modeloActivo + i) % MODELOS.length;
    const modelo = MODELOS[indice];

    // Dos intentos con el mismo modelo: el segundo solo ocurre si el primero
    // fallo por saturacion pasajera.
    for (let intento = 0; intento < 2; intento++) {
      try {
        const resultado = await fn(modelo);
        if (indice !== modeloActivo) {
          console.warn(`[gemini] cambiando a ${modelo} (el anterior no estaba disponible)`);
          modeloActivo = indice;
        }
        return resultado;
      } catch (error) {
        ultimoError = error;

        if (esSaturacionPasajera(error) && intento === 0) {
          console.warn(`[gemini] ${modelo} saturado, reintentando en 2s`);
          await esperar(2000);
          continue;
        }
        if (esSaturacionPasajera(error) || esCuotaONoExiste(error)) {
          console.warn(`[gemini] ${modelo} no disponible, probando el siguiente`);
          break;
        }
        throw error;
      }
    }
  }

  throw ultimoError;
}

/** Cuantas veces dejamos que el modelo pida herramientas antes de cortar. */
const MAX_TOOL_TURNS = 3;

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta GEMINI_API_KEY. Ponla en .env y recrea el contenedor: docker compose up -d --force-recreate web",
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

type FunctionCall = { name: string; args: Record<string, unknown> };

/** Normaliza lo que devuelve el SDK sin depender de sus tipos internos. */
function readResponse(response: unknown): { text: string; calls: FunctionCall[] } {
  const r = response as { text?: unknown; functionCalls?: unknown };
  const calls = Array.isArray(r.functionCalls)
    ? r.functionCalls.map((call) => {
        const c = call as { name?: unknown; args?: unknown };
        return {
          name: typeof c.name === "string" ? c.name : "",
          args: (c.args ?? {}) as Record<string, unknown>,
        };
      })
    : [];
  return { text: typeof r.text === "string" ? r.text : "", calls };
}

/** Salida cruda de Gemini para el planner (JSON en texto, sin tools). */
export async function generateJson(prompt: string, systemInstruction: string): Promise<string> {
  return conModeloDisponible(async (modelo) => {
    const response = await ai().models.generateContent({
      model: modelo,
      contents: prompt,
      config: { systemInstruction, temperature: 0.2, responseMimeType: "application/json" },
    });
    return readResponse(response).text;
  });
}

const REASONER_SYSTEM = `Eres el cerebro de un asesor financiero del banco Banorte, dentro de la banca digital.

Tu trabajo en este paso es ENTENDER la situacion, no redactar la respuesta ni
disenar la pantalla. Para eso llamas a las herramientas disponibles.

Reglas que no se negocian:
- Toda cifra en pesos sale de una herramienta. Nunca estimes, nunca calcules de
  cabeza, nunca inventes un saldo, una tasa, un CAT o un pago mensual.
- Si vas a hablar de reestructurar un saldo, llama simulate_restructure y usa
  sus numeros tal cual vienen.
- El perfil del cliente y, si tiene deuda de tarjeta, la simulacion de
  reestructura ya vienen resueltos en el mensaje, bajo "Datos que ya consulte
  por ti". NO vuelvas a llamar esas tools: ya tienes su respuesta, y repetir
  get_financial_profile puede cambiarte de cliente a media pantalla.
- De esos datos sacas el clienteId: GUARDALO y pasalo a todas las demas tools
  que si necesites llamar. Si no lo pasas, cada tool elige otro cliente al azar
  y mezclarias a dos personas distintas en la misma pantalla.
- Ya sabes como se llama: hablale por su nombre de pila, una o dos veces, sin
  abusar. Nada de repetir el nombre completo en cada frase.
- Si el usuario pregunta por tarjetas, cual le conviene o para que califica,
  llama get_eligible_cards con su clienteId. Esa tool ya resuelve elegibilidad,
  orden de conveniencia y alerta de endeudamiento; get_card_catalog es solo para
  consultar un producto suelto. No decidas tu quien califica: son requisitos
  publicados, no criterio tuyo.
- No llames apply_restructure_plan salvo que el evento del usuario sea una
  confirmacion explicita hecha en la UI generada.
- El dominio es reestructura de deuda de tarjeta de credito. No inventes
  productos de seguros ni de inversion.
- Si la consulta resulta ser de otro dominio, NO llames herramientas: no hay
  cifra que traer. Di en una linea que se sale del dominio y de que si trata
  este asesor; el paso que dibuja la pantalla ya sabe que hacer con eso.

Cuando ya tengas los datos suficientes, responde en texto plano con un resumen
breve de la situacion y de las posibilidades reales que ves. Ese resumen lo
consume otro paso, no el usuario.`;

export type Reasoning = {
  summary: string;
  facts: ToolResult[];
};

/**
 * Loop de function calling contra las tools MCP.
 *
 * Usamos `ai.chats` y NO `models.generateContent` con un historial armado a
 * mano, por una razon concreta: Gemini 3 firma cada llamada a herramienta con
 * un `thoughtSignature` (representacion cifrada de su razonamiento) que hay que
 * devolver intacto en el siguiente turno. Reconstruir el turno del modelo a
 * partir de `functionCalls` pierde esa firma y la API responde
 * "Function call is missing a thought_signature". El objeto chat guarda el
 * historial internamente, con firmas y todo, asi que el problema desaparece.
 *
 * Nosotros seguimos despachando las tools a mano — el chat maneja la
 * conversacion, MCP ejecuta.
 */
export async function reason(
  intent: string,
  mcp: McpSession,
  precargados: ToolResult[] = [],
): Promise<Reasoning> {
  /*
   * Los datos precargados entran como parte del primer mensaje, no como un
   * turno de herramienta falso: inventar un turno del modelo lo obliga a
   * firmar un razonamiento que nunca hizo (ver la nota del thoughtSignature).
   *
   * El "no las vuelvas a llamar" no es cosmetico. get_financial_profile con
   * nuevoCaso cambia de cliente: si el modelo la repite, la mitad de la
   * pantalla queda con las cifras de otra persona.
   */
  const contexto =
    precargados.length === 0
      ? ""
      : [
          "",
          "## Datos que ya consulte por ti",
          "Estos son resultados REALES de las herramientas. Usalos tal cual y NO",
          "vuelvas a llamar esas tools: ya tienes su respuesta.",
          ...precargados.map((r) => `\n### ${r.name}\n${r.text}`),
        ].join("\n");

  const primerMensaje = intent + contexto;
  // El chat queda atado a un modelo, asi que si hay que cambiar de modelo se
  // reinicia la conversacion completa. Las tools son idempotentes (todas son
  // `read`), asi que repetirlas no tiene efectos secundarios.
  return conModeloDisponible(async (modelo) => {
    const chat = ai().chats.create({
      model: modelo,
      config: {
        systemInstruction: REASONER_SYSTEM,
        temperature: 0.3,
        tools: [{ functionDeclarations: mcp.declarations }],
      },
    });

    const facts: ToolResult[] = [...precargados];
    let summary = "";
    let response = await chat.sendMessage({ message: primerMensaje });

    // Cada vuelta de este loop es una llamada al modelo MAS, y son
    // secuenciales. Se registran para poder ver si la precarga esta sirviendo:
    // con el perfil y la simulacion servidos, lo normal es cero vueltas.
    const pedidas: string[] = [];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const { text, calls } = readResponse(response);
      if (text) summary = text;
      if (calls.length === 0) break;

      pedidas.push(...calls.map((c) => c.name));
      const executed = await Promise.all(calls.map((call) => mcp.call(call.name, call.args)));
      facts.push(...executed);

      response = await chat.sendMessage({
        message: executed.map((r) => ({
          functionResponse: { name: r.name, response: { result: r.text } },
        })),
      });
    }

    console.info(
      `[gemini] ${modelo} · precargadas ${precargados.length} · turnos de tool ${
        pedidas.length === 0 ? "0" : `${pedidas.length} (${pedidas.join(", ")})`
      }`,
    );

    if (!summary) summary = readResponse(response).text;

    return { summary, facts };
  });
}

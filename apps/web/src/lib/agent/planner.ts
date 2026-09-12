/**
 * Surface planner: traduce lo que el agente entendio a mensajes A2UI.
 *
 * Regla dura (AGENTS.md #2): todo mensaje pasa por validateA2UI. Si falla,
 * ciclo de reparacion con el error del validador, maximo 2 intentos, y luego
 * fallback a la surface `fallback-text`.
 *
 * Nota sobre "salida estructurada": pedimos responseMimeType JSON pero NO un
 * responseSchema. El schema de Gemini no expresa bien la union de seis formas
 * de mensaje ni los props abiertos de un componente A2UI; un schema a medias
 * deja pasar basura igual. La garantia real es validateA2UI, que valida contra
 * el catalogo, y el ciclo de reparacion de abajo.
 */
import {
  A2UI_VERSION,
  CATALOG_ID,
  catalogSummaryForPrompt,
  validateA2UI,
  type A2UIMessage,
} from "@banorte/a2ui";
import { generateJson } from "./gemini";
import type { Reasoning } from "./gemini";

const MAX_REPAIRS = 2;

const PLANNER_SYSTEM = `Disenas la pantalla de un asesor financiero de Banorte emitiendo mensajes A2UI v0.9.1.

Respondes SIEMPRE con un objeto JSON: { "messages": [ ... ] } y nada mas.

Formas de mensaje validas (cada una lleva "version": "${A2UI_VERSION}"):
1. { "version": "...", "createSurface": { "surfaceId": "...", "catalogId": "${CATALOG_ID}", "title": "..." } }
2. { "version": "...", "updateComponents": { "surfaceId": "...", "root": "<id>", "components": [ { "id": "...", "component": "<del catalogo>", ...props } ] } }
3. { "version": "...", "updateDataModel": { "surfaceId": "...", "path": "/algo", "value": <lo que sea> } }
4. { "version": "...", "deleteSurface": { "surfaceId": "..." } }
5. { "version": "...", "updateCanvasLayout": { "items": [ { "surfaceId": "...", "x": 0, "y": 0, "w": 6, "h": 4 } ] } }
6. { "version": "...", "updateGuidance": { "steps": [ { "targetId": "<id de componente>", "title": "...", "body": "...", "side": "right" } ], "trigger": "auto" } }

Reglas duras:
- Un widget del canvas = una surface. Crea la surface ANTES de mandarle componentes.
- El layout (x, y, w, h) va SOLO en updateCanvasLayout, indexado por surfaceId.
  NUNCA metas x/y/w/h dentro de un componente: el validador lo rechaza.
- Solo puedes usar los componentes del catalogo de abajo, con sus props. Si un
  componente que quieres no existe, usa uno que si exista. Prohibido inventar.
- El grid es de 12 columnas. Usa w: 6 para dos widgets lado a lado.
- Un prop "bindable" acepta un literal o un binding { "path": "/ruta" }. Si usas
  binding, manda tambien el updateDataModel con esa ruta.
- targetId de updateGuidance es el id de un componente que ya emitiste.

FORMA EXACTA DE action (el error mas comun, leelo dos veces):
  "action": { "event": { "name": "nombre_del_evento", "payload": { ... } } }
  El envoltorio "event" es OBLIGATORIO. Esto se rechaza siempre:
  "action": { "name": "...", "payload": { ... } }

FORMA DE LAS PROPS DE ARREGLO (los widgets las leen asi, con numeros sin
formato y sin simbolo de peso; el formato lo pone la UI):
- FinancialHealthCard.metricas: [{ "label": "...", "value": "$18,400", "tone": "neutral|positive|warning|critical" }]
- OpportunityGrid.opciones:     [{ "id": "...", "titulo": "...", "porQue": "...", "impactoEstimado": "..." }]
- OptionComparator.opciones:    [{ "id": "...", "nombre": "...", "pagoMensual": 4832, "costoTotal": 115977, "plazoMeses": 24, "ventaja": "...", "desventaja": "..." }]
- ActionPlan.pasos:             [{ "titulo": "...", "detalle": "...", "requiereConfirmacion": true }]
- ExplorationCard.opciones:     [{ "id": "...", "label": "..." }]
- UnderstandingSummary:         objetivoEntendido texto, supuestos arreglo de textos, confianza NUMERO entre 0 y 1
- DebtSimulator:                saldo, plazoSeleccionado, cat y pagoMensual son NUMEROS, plazos es arreglo de numeros
- Copy de la UI en espanol, claro, sin jerga bancaria.

Reglas de producto:
- TODA cifra en pesos viene de los datos de herramienta que te paso. Copiala tal
  cual. Si un numero no esta en esos datos, no lo pongas: es un bug, no un detalle.
- Presenta posibilidades con su costo visible, no recomendaciones cerradas.
  Nunca "te recomendamos contratar X" sin alternativas y sin costos.
- Los datos son sinteticos y de ejemplo.
- ExplorationCard va de una pregunta a la vez, nunca un cuestionario.

Catalogo de componentes permitidos:
`;

function plannerSystem(): string {
  return PLANNER_SYSTEM + catalogSummaryForPrompt();
}

function plannerPrompt(intent: string, reasoning: Reasoning, surfaces: string[]): string {
  const facts = reasoning.facts.length
    ? reasoning.facts
        .map((f) => `### ${f.name}(${JSON.stringify(f.args)})\n${f.text}`)
        .join("\n\n")
    : "(el agente no consulto ninguna herramienta)";

  return `## Lo que pidio el usuario
${intent}

## Lo que entendio el agente
${reasoning.summary || "(sin resumen)"}

## Datos de herramienta — unica fuente de cifras
${facts}

## Surfaces que ya existen en el canvas
${surfaces.length ? surfaces.join(", ") : "(ninguna, el canvas esta vacio)"}

Arma la pantalla. Si una surface ya existe y solo cambian numeros, manda
updateDataModel en vez de regenerar sus componentes.`;
}

export type PlanResult = {
  messages: A2UIMessage[];
  repairs: number;
  fellBack: boolean;
};

function extractMessages(raw: string): unknown[] {
  const trimmed = raw.trim().replace(/^\`\`\`(?:json)?/, "").replace(/\`\`\`$/, "");
  const parsed: unknown = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null && "messages" in parsed) {
    const messages = (parsed as { messages: unknown }).messages;
    if (Array.isArray(messages)) return messages;
  }
  throw new Error('El JSON no trae un arreglo "messages".');
}

/** Claves de mensaje que reconoce la spec, para diagnosticar mejor. */
const CLAVES_VALIDAS = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
  "updateCanvasLayout",
  "updateGuidance",
];

/**
 * El modelo olvida `version` con mucha frecuencia y el validador responde a eso
 * con un "(raiz): Invalid input" que no le dice nada a nadie. Como la version
 * es constante, la ponemos nosotros en vez de gastar un intento de reparacion.
 */
function normalize(candidate: unknown): unknown {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return candidate;
  }
  const obj = candidate as Record<string, unknown>;
  return "version" in obj ? obj : { version: A2UI_VERSION, ...obj };
}

/**
 * `validateA2UI` valida contra una union de Zod, y cuando ningun miembro hace
 * match el mensaje es "(raiz): Invalid input". Con eso el modelo no puede
 * corregir nada. Aqui lo traducimos a algo accionable y, sobre todo, le
 * devolvemos el mensaje que mando para que vea que fue rechazado.
 */
function explicar(candidate: unknown, errors: string[]): string {
  const generico = errors.every((e) => e.includes("Invalid input"));
  if (!generico) return errors.join("; ");

  if (typeof candidate !== "object" || candidate === null) {
    return "no es un objeto JSON.";
  }
  const claves = Object.keys(candidate as Record<string, unknown>).filter((k) => k !== "version");
  const desconocidas = claves.filter((k) => !CLAVES_VALIDAS.includes(k));

  if (desconocidas.length > 0) {
    return `usa la clave "${desconocidas[0]}", que no existe en la spec. Las unicas validas son: ${CLAVES_VALIDAS.join(", ")}.`;
  }
  if (claves.length === 0) {
    return "no trae ninguna clave de mensaje (createSurface, updateComponents, ...).";
  }
  if (claves.length > 1) {
    return `trae ${claves.length} claves de mensaje a la vez (${claves.join(
      ", ",
    )}). Cada mensaje lleva exactamente una: separalos.`;
  }
  return `la clave "${claves[0]}" existe pero su contenido no cumple el esquema (revisa campos obligatorios y tipos).`;
}

/** Surface minima para cuando el planner no logra producir algo valido. */
export function fallbackSurface(texto: string): A2UIMessage[] {
  return [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId: "fallback-text",
        catalogId: CATALOG_ID,
        title: "Respuesta",
      },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: "fallback-text",
        root: "fallback-body",
        components: [{ id: "fallback-body", component: "Text", text: texto, variant: "body" }],
      },
    },
    {
      version: A2UI_VERSION,
      updateCanvasLayout: {
        items: [{ surfaceId: "fallback-text", x: 0, y: 0, w: 12, h: 3 }],
      },
    },
  ];
}

/**
 * Genera y valida. Cada intento le pasa al modelo los errores del intento
 * anterior, que es lo unico que lo hace converger: sin el detalle del
 * validador repite el mismo error.
 */
export async function planSurfaces(
  intent: string,
  reasoning: Reasoning,
  surfaces: string[],
): Promise<PlanResult> {
  const system = plannerSystem();
  let prompt = plannerPrompt(intent, reasoning, surfaces);

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    let candidates: unknown[];
    try {
      candidates = extractMessages(await generateJson(prompt, system));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      prompt = `${prompt}\n\n## El intento anterior no era JSON valido\n${message}\nResponde SOLO con { "messages": [ ... ] }.`;
      continue;
    }

    const valid: A2UIMessage[] = [];
    const errors: string[] = [];

    candidates.forEach((candidate, index) => {
      const normalizado = normalize(candidate);
      const result = validateA2UI(normalizado);
      if (result.ok) {
        valid.push(result.message);
        return;
      }
      // Devolverle el mensaje rechazado es lo que lo hace converger: sin verlo,
      // no sabe cual de los N mensajes era el "mensaje 5".
      errors.push(
        `Mensaje ${index} — ${explicar(normalizado, result.errors)}\nLo que mandaste fue:\n${JSON.stringify(
          normalizado,
        )}`,
      );
    });

    if (errors.length === 0 && valid.length > 0) {
      return { messages: valid, repairs: attempt, fellBack: false };
    }

    console.warn(
      `[planner] intento ${attempt + 1}: ${valid.length} validos, ${errors.length} rechazados\n${errors.join("\n")}`,
    );
    prompt = `${prompt}\n\n## El validador rechazo estos mensajes del intento anterior\n${errors.join(
      "\n\n",
    )}\n\nCorrige SOLO esos y vuelve a mandar el arreglo completo de mensajes, incluyendo los que si pasaron.`;
  }

  return {
    messages: fallbackSurface(
      reasoning.summary ||
        "No pude armar la pantalla esta vez. Intenta describir tu situacion con otras palabras.",
    ),
    repairs: MAX_REPAIRS,
    fellBack: true,
  };
}

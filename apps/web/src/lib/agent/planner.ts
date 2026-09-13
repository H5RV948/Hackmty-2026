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

ANTES DE NADA, DECIDE SI ENTENDISTE:
  Si la consulta admite dos lecturas que llevarian a pantallas distintas, tu
  PRIMERA salida no es el tablero: es una pregunta de desambiguacion. Esta
  explicada abajo en "CUANDO NO TENGAS CLARO QUE QUIERE". Tener el perfil del
  cliente a la mano NO resuelve la ambiguedad: te dice como esta, no que quiere.

Reglas duras:
- Un widget del canvas = una surface. Crea la surface ANTES de mandarle componentes.
- El layout (x, y, w, h) va SOLO en updateCanvasLayout, indexado por surfaceId.
  NUNCA metas x/y/w/h dentro de un componente: el validador lo rechaza.
- Solo puedes usar los componentes del catalogo de abajo, con sus props. Si un
  componente que quieres no existe, usa uno que si exista. Prohibido inventar.
- El grid es de 12 columnas y cada unidad de alto son 72px.

ALTURAS (importante: sobra espacio blanco cuando te pasas):
  Text, Stat                     -> h: 2
  ExplorationCard                -> h: 3
  FinancialHealthCard            -> h: 3
  UnderstandingSummary           -> h: 3
  OutOfScopeCard                 -> h: 4
  DebtSimulator                  -> h: 4
  OpportunityGrid con 2 opciones -> h: 4
  OptionComparator con 2-3       -> h: 4
  Ajusta +1 solo si el texto es largo de verdad. Nunca pongas h mayor a 5.

LAYOUT — una sola regla, pero se rompe seguido:
  updateCanvasLayout reemplaza el layout COMPLETO. Incluye SIEMPRE todas las
  surfaces que existan, no solo las nuevas, o las viejas se descolocan y el
  canvas queda escalonado.
  Usa w: 6 para dos widgets lado a lado (x: 0 y x: 6 con el mismo y), o w: 12
  para uno que ocupe el ancho.
- Un prop "bindable" acepta un literal o un binding { "path": "/ruta" }. Si usas
  binding, manda tambien el updateDataModel con esa ruta.
- targetId de updateGuidance es el id de un componente que ya emitiste.

UN COMPONENTE DE PRIMER NIVEL = UNA SURFACE:
  El renderer dibuja desde "root" y baja por "children". Si metes dos
  componentes sueltos en la misma surface, solo se dibuja el root y el otro
  desaparece sin error.
  Asi que CardRanking y CardShowcase van en DOS surfaces distintas, cada una
  con su createSurface, su updateComponents y su entrada en updateCanvasLayout.

ROOT — el segundo error mas comun:
  "root" tiene que ser el id de un componente que va en ESE MISMO mensaje
  updateComponents. No apunta a otro mensaje, ni a un contenedor que no
  existe, ni a una palabra generica como "root" o "cards".
  Si mandas un solo componente, root es su id:
  { "updateComponents": { "surfaceId": "s1", "root": "mis-tarjetas",
      "components": [ { "id": "mis-tarjetas", "component": "CardShowcase", ... } ] } }

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
- ExplorationCard.opciones:     [{ "id": "...", "label": "..." }]  (y "permiteOtro": true para dejar texto libre)
- UnderstandingSummary:         objetivoEntendido texto, supuestos arreglo de textos, confianza NUMERO entre 0 y 1
- DebtSimulator:                saldo y plazoSeleccionado son NUMEROS. "opciones"
  es el arreglo COMPLETO que devolvio simulate_restructure, copiado tal cual:
  [{ "meses": 12, "cat": 32.4, "pagoMensual": 1819, "costoTotal": 21828, "interesesTotales": 3392 }, ...]
  MANDA SIEMPRE TODOS LOS PLAZOS que devolvio la tool, no solo el elegido. El
  usuario cambia de plazo en el cliente, sin volver a preguntarte: si mandas uno
  solo, los otros chips salen sin numeros. No uses "plazos", "cat" ni
  "pagoMensual" sueltos: quedaron como legado.
- CardShowcase.tarjetas:        [{ "id": "...", "nombre": "Clásica", "imagen": "/tarjetas/clasica.png", "bullets": ["...","..."], "cat": 121.4, "anualidad": 695, "fuente": "https://...", "fechaVerificacion": "2026-09-12" }]
  y ademas "destacadaId": "<id de la que trae recomendada:true>"
- CardRanking.barras:           [{ "id": "...", "nombre": "Clásica", "puntaje": 82, "porQue": "Sin anualidad el primer anio y CAT de 121.4%." }]
  y ademas "destacadaId": el mismo id que en CardShowcase
- RiskAlert:                    "nivel" es "ok" | "precaucion" | "alto", "titulo"
  y "mensaje" son texto, "senales" es un arreglo de textos. Los cuatro se copian
  de alertaDeuda tal cual: es una evaluacion del banco, no tu opinion.
- Copy de la UI en espanol, claro, sin jerga bancaria.
- Los datos de herramienta traen el NOMBRE del cliente. Usalo: dirigete a la
  persona por su nombre de pila al menos una vez, en el titulo o en la lectura
  principal ("Asi se ve tu mes, Beatriz"). Una o dos veces basta; repetirlo en
  cada componente suena a plantilla.

Reglas de producto:
- TODA cifra en pesos viene de los datos de herramienta que te paso. Copiala tal
  cual. Si un numero no esta en esos datos, no lo pongas: es un bug, no un detalle.
- Presenta posibilidades con su costo visible, no recomendaciones cerradas.
  Nunca "te recomendamos contratar X" sin alternativas y sin costos.
- Los datos son sinteticos y de ejemplo.
- ExplorationCard va de una pregunta a la vez, nunca un cuestionario.

CUANDO NO TENGAS CLARO QUE QUIERE — PREGUNTA, NO ADIVINES:
  Si la consulta es ambigua, o caben dos lecturas que llevarian a pantallas
  distintas, o te falta un dato sin el cual cualquier pantalla seria un volado:
  no elijas al azar y no armes el tablero completo.

  Emite UNA sola surface, con un solo ExplorationCard, asi:
    "pregunta":       que necesitas aclarar, en una linea y en su idioma.
    "porQuePregunto": por que cambia la respuesta segun lo que conteste.
    "tipo":           "opcion"
    "opciones":       EXACTAMENTE DOS, las dos lecturas mas probables, dichas
                      en concreto ("Bajar mi pago mensual aunque pague mas al
                      final" / "Pagar menos intereses en total aunque la
                      mensualidad suba"). Nunca "Opcion A" ni "Otra cosa":
                      cada label tiene que ser una interpretacion de verdad.
    "permiteOtro":    true   -> la UI agrega sola un "Otro" con campo de texto.
    "slot":           el slot que buscas llenar ("objetivo", "horizonte", ...).
    "action":         { "event": { "name": "clarificar" } }

  Ese turno NO lleva nada mas: ni tablero, ni guidance, ni otras surfaces. Solo
  la pregunta y su updateCanvasLayout con w: 12, h: 3. En el siguiente turno ya
  llega la respuesta del usuario y ahi si armas la pantalla completa.

  Un ejemplo de cuando SI aplica: "ayudame con mis finanzas" (¿deuda? ¿ahorro?
  ¿una tarjeta?). Uno de cuando NO: "quiero pagar menos intereses de mi
  tarjeta" — eso ya es claro, arma el tablero.

  No abuses: si con una lectura razonable puedes dar una pantalla util, dala.
  Preguntar dos turnos seguidos es peor que asumir bien una vez.

CUANDO LA CONSULTA NO SEA DE ESTE DOMINIO — OutOfScopeCard, Y NADA MAS:
  Un filtro previo ya rechazo los saludos y los temas obvios antes de llegar a
  ti, asi que aqui solo caen los casos raros: la consulta que pasa por
  financiera pero pide algo que este asesor no hace (seguros, inversiones,
  tramites, temas ajenos disfrazados de pregunta larga).

  Si es uno de esos, tu turno completo es UNA surface con UN OutOfScopeCard:
    "titulo":            que no puedes resolverlo, sin reganar y sin disculpas
                         largas.
    "mensaje":           una o dos lineas: por que se sale de lo tuyo (deuda de
                         tarjeta de credito y el credito al que puede acceder).
    "sugerencias":       TRES o CUATRO cosas que si haces, cada una con "id",
                         "texto" (la consulta redactada en primera persona, tal
                         como la teclearia el usuario, porque al picarla se manda
                         literal) y "porQue" (que obtiene, en una linea).
                         Si su consulta se parece a algo que si haces, esa va
                         primero: es el puente entre lo que pidio y lo que hay.
    "consultaOriginal":  lo que escribio, tal cual. La UI le pone con eso el
                         boton de "preguntarlo de todos modos".
    "action":            { "event": { "name": "sugerencia_elegida" } }
  Layout: w: 12, h: 4. Nada mas en ese turno: ni tablero, ni guidance.

  No lo uses para desambiguar. Si entiendes que quiere pero no cual de dos
  lecturas, eso es ExplorationCard (arriba). OutOfScopeCard es "esto no lo
  hago", no "no te entendi".

CUANDO EL USUARIO PREGUNTE POR TARJETAS — USA get_eligible_cards:
  Esa tool ya hizo el trabajo dificil: recibe el clienteId y devuelve las
  tarjetas a las que SI califica (ordenadas, con la mejor marcada
  recomendada:true), las que no le tocan con su motivo, y una alerta de
  endeudamiento. NO uses get_card_catalog para esto y NO decidas tu quien
  califica: elegibilidad y puntaje son calculo del banco, no juicio tuyo.

  Emite estas surfaces, en este orden:

  1. RiskAlert — SIEMPRE, y va primero en el layout (y: 0, w: 12, h: 2; con
     muchas senales, h: 3). Copia nivel, titulo, mensaje y senales TAL CUAL de
     alertaDeuda. No suavices el texto ni le quites senales.

  2. CardRanking con las TRES a CINCO mejores de "elegibles", en el orden en
     que vienen. "puntaje" se copia de la tool. "destacadaId" es el id de la
     que trae recomendada:true. En "porQue" explicas en una linea usando una
     cifra concreta (su CAT, su anualidad, su ingreso minimo) — ahi si
     escribes tu.

  3. CardShowcase con TODAS las elegibles, no solo tres: el usuario pidio ver
     a que puede acceder. Mismo "destacadaId". nombre, imagen, bullets, cat,
     anualidad, fuente y fechaVerificacion se copian TAL CUAL. La imagen nunca
     te la inventes: si la tool no trae ruta, omite esa tarjeta.
     Layout: w: 12 y h: 5 (son varias filas de plasticos).

  4. Si "noElegibles" no viene vacio, un Text (variant "caption") que diga en
     una linea cuantas quedaron fuera y por que — casi siempre es el ingreso
     minimo. Es para que el usuario sepa que le falta, no para taparlo.

  El id de cada tarjeta en CardRanking y CardShowcase es el campo "id" que
  devuelve la tool. Tienen que coincidir con destacadaId o el sello no aparece.

  SI alertaDeuda.desaconsejaNuevoCredito ES TRUE:
    Cambia el tono de toda la pantalla. Sigues mostrando para que califica
    —tiene derecho a saberlo— pero los titulos dejan de vender: algo como
    "Para estas calificas, aunque hoy no te convenga contratar". Nada de "te
    recomendamos", nada de urgencia, ningun boton que empuje a contratar.
    Ademas agrega un DebtSimulator con la reestructura de su saldo: si le vas a
    decir que baje su deuda, muestrale con que numeros.

  Jamas cierres una consulta de tarjetas con puro texto: el producto es un
  tablero.

  (Un ExplorationCard de desambiguacion NO es "puro texto": es un widget y es
  una respuesta valida por si sola. Esta regla habla de cerrar con un parrafo.)

NO USES ActionPlan. El producto es un tablero que explica la situacion y sus
opciones con su costo, no un flujo de contratacion. Nada de "pasos sugeridos"
ni botones de confirmar un plan. Si quieres cerrar, cierra con datos y con las
alternativas a la vista, no con una llamada a la accion.

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
  const conVersion = "version" in obj ? obj : { version: A2UI_VERSION, ...obj };

  /*
   * El modelo pone seguido un `root` que no corresponde a ningun componente
   * del mensaje ("root", "cards", el id de otro mensaje). Cuando el mensaje
   * trae UN solo componente no hay ambiguedad posible: el root es ese. Lo
   * corregimos aqui en vez de gastar un intento de reparacion.
   *
   * Con dos o mas componentes no adivinamos: ahi si que lo resuelva el modelo,
   * porque elegir mal cambiaria la pantalla en silencio.
   */
  const uc = (conVersion as { updateComponents?: unknown }).updateComponents;
  if (uc && typeof uc === "object") {
    const bloque = uc as { root?: unknown; components?: unknown };
    const comps = Array.isArray(bloque.components) ? bloque.components : [];
    const ids = comps
      .map((c) => (typeof c === "object" && c !== null ? (c as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === "string");

    if (comps.length === 1 && typeof bloque.root === "string" && !ids.includes(bloque.root)) {
      return { ...conVersion, updateComponents: { ...bloque, root: ids[0] } };
    }
  }

  return conVersion;
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

/**
 * Reglas de producto que el validador del protocolo no puede ver.
 *
 * `validateA2UI` comprueba que el mensaje cumpla la spec, no que la pantalla
 * tenga sentido. "Si muestras el ranking, muestra tambien las tarjetas" es una
 * decision nuestra, y pedirla en el prompt no basta: el modelo la cumple casi
 * siempre, y "casi" no sirve cuando el jurado ve la pantalla una vez.
 *
 * Devuelve errores en el mismo formato que el validador para que entren al
 * ciclo de reparacion sin tratamiento especial.
 */
/**
 * Distingue "quiero una tarjeta nueva" de "mi tarjeta me esta matando".
 *
 * Antes esto era un `/tarjeta/i.test(intent)` pelon, y rompia el flujo
 * principal del proyecto: la vertical es reestructura de deuda de tarjeta, o
 * sea que casi toda consulta del caso central trae la palabra "tarjeta". La
 * regla exigia entonces un catalogo de productos nuevos en una consulta de
 * deuda, el plan se rechazaba tres veces y el usuario terminaba viendo un
 * parrafo de texto en lugar de su tablero.
 *
 * El orden importa: las seniales de deuda mandan sobre las de catalogo, porque
 * "cual me conviene para pagar menos intereses de mi tarjeta" es deuda, no
 * contratacion.
 */
function pideProductoNuevo(intent: string): boolean {
  const texto = intent.toLowerCase();

  const deuda =
    /interes|deuda|saldo|reestructur|pagar menos|pago minimo|pago mínimo|meses sin|debo|adeudo|liquidar|abonar/;
  if (deuda.test(texto)) return false;

  const mencionaTarjetas = /tarjeta/.test(texto);
  const quiereElegir =
    /cual|cuál|cuales|cuáles|recomienda|recomiend|conviene|mejor|comparar|compara|opciones|sacar|solicitar|contratar|nueva|nuevo|quiero una|muestra|muestrame|muéstrame|ensena|enséña|ver las|dame/;

  return mencionaTarjetas && quiereElegir.test(texto);
}

function revisarReglas(messages: A2UIMessage[], intent: string): string[] {
  const usados = new Set<string>();
  for (const m of messages) {
    if ("updateComponents" in m) {
      for (const c of m.updateComponents.components) usados.add(c.component);
    }
  }

  const errores: string[] = [];

  /*
   * Componentes huerfanos: el renderer dibuja desde `root` y baja por
   * `children`. Un componente que esta en el mensaje pero que nadie alcanza
   * no se dibuja NUNCA — y como el mensaje es valido para la spec, el
   * validador lo deja pasar sin decir nada.
   *
   * Es justo lo que pasaba con las tarjetas: el planner metia CardRanking y
   * CardShowcase en la misma surface, ponia el ranking como root, y el
   * showcase se perdia en silencio. Se veia un plan correcto y media pantalla.
   */
  for (const m of messages) {
    if (!("updateComponents" in m)) continue;
    const { surfaceId, components, root } = m.updateComponents;
    const raiz = root ?? components[0]?.id;
    const alcanzables = new Set<string>(raiz ? [raiz] : []);
    let creció = true;
    while (creció) {
      creció = false;
      for (const c of components) {
        if (!alcanzables.has(c.id)) continue;
        for (const hijo of c.children ?? []) {
          if (!alcanzables.has(hijo)) { alcanzables.add(hijo); creció = true; }
        }
      }
    }
    const huerfanos = components.filter((c) => !alcanzables.has(c.id));
    if (huerfanos.length > 0) {
      errores.push(
        `En la surface "${surfaceId}" estos componentes no se dibujarian nunca porque nadie los alcanza desde root "${raiz}": ${huerfanos
          .map((c) => `${c.id} (${c.component})`)
          .join(", ")}. Cada componente de primer nivel necesita SU PROPIA surface (con su createSurface y su entrada en updateCanvasLayout), o tiene que estar listado en "children" de un componente que si se alcance.`,
      );
    }
  }

  /*
   * Si preguntaron por tarjetas, la pantalla tiene que traerlas. Aunque la
   * conclusion sea "todavia no te conviene ninguna", esa respuesta se dibuja:
   * el producto es un tablero, y cerrar con un parrafo de texto es justo lo
   * que no queremos. El modelo se saltaba esto cuando el cliente venia mal.
   */
  const preguntaronPorTarjetas = pideProductoNuevo(intent);
  if (preguntaronPorTarjetas && !usados.has("CardShowcase") && !usados.has("CardRanking")) {
    errores.push(
      "El usuario pregunto por tarjetas y no emitiste ni CardRanking ni CardShowcase. Aunque tu conclusion sea que no le conviene ninguna todavia, dibujala: CardRanking con las tres menos malas y puntajes bajos que lo digan, y CardShowcase con esas mismas. No cierres una consulta de tarjetas sin ensenar tarjetas.",
    );
  }

  /*
   * Tarjetas sin alerta de riesgo: no se muestra un catalogo de credito sin
   * decir en que situacion esta la persona. `get_eligible_cards` siempre
   * devuelve `alertaDeuda`, asi que omitirla es que el modelo la ignoro, no que
   * no existiera. Es la regla con mas peso etico del planner.
   */
  if ((usados.has("CardShowcase") || usados.has("CardRanking")) && !usados.has("RiskAlert")) {
    errores.push(
      "Mostraste tarjetas sin RiskAlert. get_eligible_cards SIEMPRE devuelve alertaDeuda: emite un RiskAlert con su nivel, titulo, mensaje y senales tal cual, y ponlo primero en el layout. No se le ensena un catalogo de credito a alguien sin decirle como esta parado.",
    );
  }

  if (usados.has("CardRanking") && !usados.has("CardShowcase")) {
    errores.push(
      "Emitiste CardRanking sin CardShowcase. El ranking dice cual conviene pero no ensenia las tarjetas: agrega una surface con CardShowcase de esas mismas tres, copiando imagen, bullets, cat y anualidad de get_card_catalog.",
    );
  }
  if (usados.has("CardShowcase") && !usados.has("CardRanking")) {
    errores.push(
      "Emitiste CardShowcase sin CardRanking. Falta la grafica de barras que ordena las tres por conveniencia para este cliente.",
    );
  }
  if (usados.has("ActionPlan")) {
    errores.push("Usaste ActionPlan y esta prohibido: el producto es un tablero, no un flujo de contratacion. Cambialo por datos y alternativas con su costo.");
  }
  return errores;
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

  /**
   * Mejor plan visto: pasa el protocolo pero incumple alguna regla de producto.
   *
   * Existe porque el modo de falla anterior era absurdamente caro. Las reglas
   * de `revisarReglas` son blandas —"faltan las tarjetas", "sobra un huerfano"—
   * y aun asi invalidaban el plan COMPLETO. Un plan con 5 mensajes validos y
   * cifras reales se tiraba tres veces y el usuario recibia un parrafo de
   * texto: tres llamadas al modelo para terminar peor que con una.
   *
   * Ahora se guarda y, si se acaban los intentos, se emite. Una pantalla a la
   * que le falta un widget es infinitamente mejor que ninguna pantalla.
   */
  let mejorPlan: A2UIMessage[] | null = null;

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

    // El protocolo puede estar bien y la pantalla seguir incompleta.
    if (errors.length === 0 && valid.length > 0) {
      const faltantes = revisarReglas(valid, intent);
      if (faltantes.length === 0) {
        return { messages: valid, repairs: attempt, fellBack: false };
      }
      // Dibujable aunque le falte algo: se guarda por si se acaban los intentos.
      mejorPlan = valid;
      errors.push(...faltantes);
    }

    console.warn(
      `[planner] intento ${attempt + 1}: ${valid.length} validos, ${errors.length} rechazados\n${errors.join("\n")}`,
    );
    prompt = `${prompt}\n\n## El validador rechazo estos mensajes del intento anterior\n${errors.join(
      "\n\n",
    )}\n\nCorrige SOLO esos y vuelve a mandar el arreglo completo de mensajes, incluyendo los que si pasaron.`;
  }

  // Se acabaron los intentos. Si en algun momento hubo algo dibujable, va eso:
  // el fallback de texto es el ultimo recurso, no el castigo por incumplir una
  // regla de producto.
  if (mejorPlan) {
    console.warn("[planner] se agotaron los intentos; va el mejor plan valido aunque incumpla reglas");
    return { messages: mejorPlan, repairs: MAX_REPAIRS, fellBack: false };
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

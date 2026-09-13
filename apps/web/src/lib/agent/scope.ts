/**
 * Filtro de alcance: que consultas atiende este asesor y que hace con el resto.
 *
 * Por que no se lo preguntamos al modelo: "hola" tardaria lo mismo que un
 * tablero completo — sesion MCP, razonamiento, planner — y se comeria una
 * peticion de la cuota gratuita de Gemini para contestar un saludo. Aqui se
 * resuelve en microsegundos y sin red.
 *
 * El filtro es DELIBERADAMENTE conservador: ante la duda deja pasar la consulta
 * al agente. Un falso negativo cuesta una llamada al modelo; un falso positivo
 * le cierra la puerta en la cara a alguien que si tenia un problema de dinero.
 * Y para el falso positivo que igual se cuele, la tarjeta trae el boton de
 * "preguntalo de todos modos" (ver consultaOriginal): el filtro nunca es la
 * ultima palabra.
 *
 * La cola larga —lo raro que pasa el filtro— la atrapa el planner, que tiene su
 * propia instruccion para emitir OutOfScopeCard. Son dos redes, no una.
 */
import { A2UI_VERSION, CATALOG_ID, type A2UIMessage, type GridItem } from "@banorte/a2ui";
import { CAPACIDADES, normalizar } from "@/lib/suggestions";

/** Id fijo: un saludo repetido reemplaza la tarjeta, no apila copias. */
export const SURFACE_FUERA_DE_ALCANCE = "fuera-de-alcance";

/**
 * Vocabulario del dominio. Un solo acierto y la consulta pasa al agente.
 *
 * Incluye la jerga coloquial ("lana", "quincena", "no me alcanza", "quebrado")
 * porque quien esta ahogado en deuda no escribe "requiero una reestructura de
 * mi linea revolvente": escribe "ya no me alcanza". Dejar fuera esas palabras
 * era mandar la tarjeta de rechazo justo a quien mas necesitaba el tablero.
 */
const LEXICO_FINANCIERO =
  /\b(tarjeta|tarjetas|plastico|credito|creditos|debito|deuda|deudas|debo|deber|debiendo|adeudo|adeudos|saldo|saldos|interes|intereses|cat|anualidad|anualidades|pago|pagos|pagar|pague|mensualidad|mensualidades|msi|plazo|plazos|reestructur\w*|refinanci\w*|liquidar|abonar|abono|prestamo|prestamos|financiamiento|hipoteca|nomina|ingreso|ingresos|sueldo|salario|gasto|gastos|gastar|ahorro|ahorrar|ahorros|presupuesto|finanzas|financier\w*|dinero|lana|varo|feria|banco|banorte|cuenta|cuentas|inversion|invertir|seguro|seguros|buro|score|linea de credito|limite|domiciliacion|cargo|cargos|comision|comisiones|cobro|cobros|cobran|endeud\w*|moroso|atraso|atrasos|quincena|alcanza|alcanzo|tasa|tasas|banca|retiro|efectivo|transferencia|spei|cashback|puntos|recompensas|quebrado|quiebra|sobregir\w*|pesos|mxn)\b/;

/**
 * Saludos y charla suelta. Ancladas a la frase COMPLETA, no a "contiene": si
 * no, "hola, quiero pagar mi tarjeta" se iria a la tarjeta de rechazo por
 * empezar con un saludo.
 */
const CHARLA =
  /^(hola|holi|holis|ola|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|que onda|que pedo|que tal|que hay|saludos|hi|hello|good morning|como estas|como te llamas|quien eres|que eres|que haces|que puedes hacer|que sabes hacer|en que me puedes ayudar|ayuda|ayudame|help|gracias|muchas gracias|de nada|adios|bye|hasta luego|nos vemos|ok|okay|va|sale|vale|si|no|test|prueba|probando|hola mundo|xd|lol|jaja+|jeje+|a+|\?+|\.+|,+)[\s!¡?¿.,]*$/;

/**
 * Temas que claramente no son este producto. No pretende ser exhaustivo —
 * imposible enumerar todo lo que no somos— sino cubrir lo que la gente prueba
 * de verdad cuando se topa con un chat.
 */
const OTRO_DOMINIO =
  /\b(clima|temperatura|llover|futbol|partido|mundial|chivas|pelicula|peliculas|serie|series|netflix|receta|recetas|cocinar|chiste|chistes|broma|poema|poesia|cancion|canciones|musica|python|javascript|typescript|codigo|programar|programacion|tarea|examen|matematicas|quimica|capital de|quien invento|quien gano|traduce|traduceme|traducir|novia|novio|amor|horoscopo|signo zodiacal|covid|vacuna|medicina|doctor|sintoma|sintomas|videojuego|videojuegos|minecraft|fortnite|chatgpt|gemini|inteligencia artificial|cuentame algo|dato curioso|adivinanza)\b/;

export type Clasificacion =
  | { dentro: true }
  | { dentro: false; motivo: "charla" | "otro-tema" };

/**
 * El orden de las reglas ES la logica; cambiarlo cambia el comportamiento.
 *
 * En particular, el lexico financiero se evalua ANTES que los otros temas: eso
 * hace que "cuanto tengo que ahorrar para un viaje" se lea como una consulta de
 * ahorro y no como una de turismo. La palabra del dominio manda.
 */
export function clasificarConsulta(texto: string): Clasificacion {
  const limpio = normalizar(texto).trim();

  if (limpio.length < 3) return { dentro: false, motivo: "charla" };
  if (CHARLA.test(limpio)) return { dentro: false, motivo: "charla" };
  if (LEXICO_FINANCIERO.test(limpio)) return { dentro: true };
  if (OTRO_DOMINIO.test(limpio)) return { dentro: false, motivo: "otro-tema" };

  /*
   * Sin una sola palabra del dominio y en cuatro palabras o menos no hay de
   * donde sacar una pantalla: "dime algo", "que hago", "sorprendeme". Pasado
   * ese largo si dejamos correr al agente, porque una frase larga sin jerga
   * bancaria suele ser justo el caso dificil que vale la pena atender
   * ("llevo tres meses sin poder cerrar el mes y ya no se que hacer").
   */
  const palabras = limpio.split(" ").filter(Boolean).length;
  if (palabras <= 4) return { dentro: false, motivo: "otro-tema" };

  return { dentro: true };
}

/** Recorta la consulta para citarla sin romper el renglon de la tarjeta. */
function citar(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  return limpio.length <= 70 ? limpio : `${limpio.slice(0, 69)}…`;
}

function copia(motivo: "charla" | "otro-tema", consulta: string) {
  if (motivo === "charla") {
    return {
      title: "Por donde empezamos",
      titulo: "Hola. Dime que quieres resolver y te armo la pantalla",
      mensaje:
        "Todavia no tengo una pregunta que analizar, y de temas generales no se nada: lo mio es tu tarjeta de credito y lo que debes en ella. Pica una de estas y arranco con tus numeros.",
    };
  }
  return {
    title: "Eso no lo puedo resolver",
    titulo: "Eso se sale de lo que puedo resolver",
    mensaje: `Lamentablemente no puedo responder "${citar(
      consulta,
    )}". Soy el asesor financiero de Banorte y solo trabajo con tu deuda de tarjeta de credito y el credito al que puedes acceder. Esto si lo hago contigo:`,
  };
}

/**
 * Tarjeta de fuera de alcance, ya en A2UI.
 *
 * `layoutPrevio` es el layout que el canvas tiene ahora mismo, tal como lo
 * reporto el cliente. Hace falta porque updateCanvasLayout REEMPLAZA el layout
 * completo (AGENTS.md y surfaceStore): mandar solo esta tarjeta borraria de la
 * pantalla el tablero que el usuario ya tenia, y perder un tablero por escribir
 * "hola" seria un castigo absurdo. Asi que la tarjeta se pone arriba y todo lo
 * demas baja.
 */
export function fueraDeAlcanceMessages(
  motivo: "charla" | "otro-tema",
  consulta: string,
  layoutPrevio: GridItem[] = [],
): A2UIMessage[] {
  const texto = copia(motivo, consulta);
  const alto = 4;

  /*
   * El resto del tablero baja solo lo que la tarjeta ocupa DE MAS respecto a lo
   * que ya ocupaba.
   *
   * El detalle importa: si la tarjeta ya estaba arriba (segundo saludo
   * seguido), el tablero ya esta corrido y volver a sumarle su alto lo empuja
   * otras cuatro filas. A los tres saludos el usuario tendria que hacer scroll
   * para encontrar su propio tablero. Con la diferencia, repetir el saludo
   * deja todo exactamente donde estaba.
   */
  const previa = layoutPrevio.find((item) => item.surfaceId === SURFACE_FUERA_DE_ALCANCE);
  const desplazamiento = Math.max(0, alto - (previa?.h ?? 0));

  const resto = layoutPrevio
    .filter((item) => item.surfaceId !== SURFACE_FUERA_DE_ALCANCE)
    .map((item) => ({ ...item, y: item.y + desplazamiento }));

  return [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId: SURFACE_FUERA_DE_ALCANCE,
        catalogId: CATALOG_ID,
        title: texto.title,
      },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: SURFACE_FUERA_DE_ALCANCE,
        root: "fuera-de-alcance-card",
        components: [
          {
            id: "fuera-de-alcance-card",
            component: "OutOfScopeCard",
            titulo: texto.titulo,
            mensaje: texto.mensaje,
            sugerencias: CAPACIDADES.map((c) => ({ ...c })),
            /*
             * En un saludo no hay nada que reenviar, asi que no se ofrece el
             * boton: "preguntar 'hola' de todos modos" no lleva a ningun lado.
             * En otro-tema si, porque ahi es donde el filtro puede haberse
             * equivocado.
             */
            ...(motivo === "otro-tema" ? { consultaOriginal: consulta.trim() } : {}),
            action: { event: { name: "sugerencia_elegida" } },
          },
        ],
      },
    },
    {
      version: A2UI_VERSION,
      updateCanvasLayout: {
        items: [
          { surfaceId: SURFACE_FUERA_DE_ALCANCE, x: 0, y: 0, w: 12, h: alto },
          ...resto,
        ],
      },
    },
  ];
}

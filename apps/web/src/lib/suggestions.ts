/**
 * Banco de frases del asesor.
 *
 * Un solo archivo para dos consumidores que tienen que decir lo mismo:
 *  - el autocompletado fantasma de la barra del prompt (cliente);
 *  - la tarjeta de fuera de alcance, que ofrece preguntas listas (servidor).
 *
 * Si los dos tuvieran su propia lista, el usuario veria sugerido en gris algo
 * que la tarjeta nunca le ofrece, y al reves. Es la misma promesa de producto:
 * se escribe una vez.
 *
 * No lleva "use client" a proposito: `scope.ts` lo importa desde el servidor.
 */

/**
 * Consultas que el asesor resuelve de verdad hoy.
 *
 * El orden importa: el autocompletado propone la PRIMERA que empate con lo
 * tecleado, asi que arriba van las del flujo principal (reestructura de deuda
 * de tarjeta) y despues las de catalogo de tarjetas.
 *
 * Todas empiezan por un arranque distinto a proposito — quiero, cuanto, como,
 * que, cual, tengo, necesito... — porque el fantasma solo aparece cuando lo
 * tecleado es prefijo de la frase. Con veinte frases que empezaran igual, el
 * usuario tendria que adivinar la unica primera palabra que enciende la ayuda.
 */
export const CONSULTAS_SUGERIDAS: readonly string[] = [
  "Quiero pagar menos intereses de mi tarjeta de credito",
  "Quiero reestructurar el saldo de mi tarjeta a un plazo fijo",
  "Cuanto me ahorro si pago mi tarjeta en 12 meses en vez de 24",
  "Cuanto tiempo tardo en salir de mi deuda si solo pago el minimo",
  "Cuanto pago de intereses al mes por mi tarjeta",
  "Como se ve mi mes: cuanto entra, cuanto sale y cuanto debo",
  "Como esta mi salud financiera hoy",
  "Necesito bajar mi pago mensual aunque termine pagando mas al final",
  "Prefiero pagar menos intereses aunque suba la mensualidad",
  "Tengo un saldo en mi tarjeta y no se por donde empezar",
  "Ayudame a ordenar mi deuda de tarjeta de credito",
  "Compara mis opciones para liquidar mi tarjeta",
  "En que se me va el dinero cada mes",
  "Que pasa con mi deuda si abono mil pesos extra cada mes",
  "Cual es mi nivel de endeudamiento y que tan grave es",
  "Puedo con otra mensualidad o ya estoy al limite",
  "Me conviene sacar otra tarjeta de credito en mi situacion",
  "Que tarjetas de credito puedo pedir con mi ingreso",
  "Cual tarjeta me conviene mas segun mi perfil",
  "Muestrame las tarjetas para las que califico y su CAT",
];

/** Una capacidad del asesor, dicha como la preguntaria el usuario. */
export type Capacidad = {
  id: string;
  /** Se manda TAL CUAL como consulta al picarla: escribela en primera persona. */
  texto: string;
  porQue: string;
};

/**
 * Lo que la tarjeta de fuera de alcance ofrece a cambio.
 *
 * Cuatro y no diez: es una salida de un callejon, no un menu. Cada una abre una
 * de las cuatro cosas distintas que el producto sabe hacer (ordenar la deuda,
 * simular la reestructura, ver el panorama, revisar credito nuevo); poner dos
 * variantes de lo mismo solo hace la eleccion mas lenta.
 */
export const CAPACIDADES: readonly Capacidad[] = [
  {
    id: "deuda",
    texto: "Quiero pagar menos intereses de mi tarjeta de credito",
    porQue: "Reviso tu saldo y te pongo los plazos posibles con su costo real.",
  },
  {
    id: "simular",
    texto: "Cuanto me ahorro si pago mi tarjeta en 12 meses en vez de 24",
    porQue: "Simulo la reestructura con tus numeros, no con estimados.",
  },
  {
    id: "panorama",
    texto: "Como se ve mi mes: cuanto entra, cuanto sale y cuanto debo",
    porQue: "Te armo el panorama de tu situacion en una sola pantalla.",
  },
  {
    id: "tarjetas",
    texto: "Que tarjetas de credito puedo pedir con mi ingreso",
    porQue: "Veo para cuales calificas, su CAT y si hoy te conviene pedirlas.",
  },
];

/**
 * Minusculas y sin acentos.
 *
 * Nadie teclea "cuánto" con acento en una barra de busqueda, y quien si lo
 * hace merece la misma ayuda. Comparar en crudo dejaba el fantasma apagado
 * justo para quien escribe bien.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Frases que continuan lo que el usuario lleva tecleado.
 *
 * Solo prefijo, no "contiene". Un empate a media frase no se puede dibujar
 * como texto fantasma: el gris tendria que ir ANTES de lo tecleado y la
 * alineacion se rompe. Preferimos no sugerir nada a sugerir algo descuadrado.
 *
 * Se ignora el espacio final que deja el usuario al terminar una palabra, para
 * que "quiero pagar " siga empatando en vez de apagarse a media escritura.
 */
export function completaciones(valor: string): string[] {
  const escrito = normalizar(valor).trimStart();
  if (escrito.trim().length < 2) return [];

  return CONSULTAS_SUGERIDAS.filter((frase) => {
    const candidata = normalizar(frase);
    return candidata.startsWith(escrito) && candidata.length > escrito.length;
  });
}

/**
 * El pedazo de `frase` que todavia no esta tecleado: lo que se pinta en gris.
 *
 * Se corta por el largo del texto NORMALIZADO, no por el del campo. Quitar
 * acentos con NFD y borrar las marcas deja el mismo numero de caracteres, asi
 * que "cuánto" y "cuanto" cortan igual; lo que si cambia el largo es el espacio
 * doble o el espacio de mas al inicio, y por eso se colapsan antes de medir.
 *
 * Al aceptar la sugerencia el campo se reemplaza por la frase completa (no se
 * concatena), asi que ese desfase de un caracter nunca llega al texto enviado.
 */
export function restanteDe(valor: string, frase: string): string {
  const escrito = normalizar(valor).trimStart();
  return frase.slice(escrito.length);
}

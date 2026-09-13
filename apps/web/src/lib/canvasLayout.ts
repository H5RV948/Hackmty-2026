/**
 * Acomodo del canvas: quien decide la geometria de los widgets.
 *
 * La respuesta corta es: este archivo, no el modelo.
 *
 * Antes el planner elegia x, y, w y h a mano. Dos problemas que se veian en
 * pantalla y que ningun prompt arregla del todo:
 *
 *  1. Anchos que no empatan. El modelo ponia w: 12 a una tarjeta y w: 8 a la
 *     siguiente, asi que el borde derecho del tablero quedaba dentado y con
 *     huecos de aire a la derecha. Un tablero se lee como un bloque solido o no
 *     se lee: media pantalla vacia parece un error de carga.
 *  2. Alturas adivinadas. `h` iba en unidades de 72px y el modelo tenia que
 *     acertarle al alto del contenido sin haberlo visto nunca. Cuando se pasaba
 *     —lo normal— quedaba un hueco blanco enorme debajo del texto; cuando se
 *     quedaba corto, la tarjeta salia con scroll interno.
 *
 * Ahora el ancho sale del TIPO de componente (una regla de disenio, estable) y
 * el alto se MIDE del contenido ya renderizado (ver ModularCanvas). El modelo
 * solo decide que widgets emitir y en que orden, que es lo que si sabe hacer.
 */
import type { GridItem } from "@banorte/a2ui";

/** El grid de referencia. Los breakpoints angostos escalan contra este. */
export const COLUMNAS = 12;

/**
 * Cuanto quiere ocupar cada componente, en columnas de 12.
 *
 * No es capricho: depende de si el contenido se lee a lo ancho o a lo alto.
 * Una vitrina de plasticos o una alerta necesitan la fila completa; un
 * comparador o un simulador se leen bien a media fila y ganan porque el
 * vecino queda a la vista para compararlo.
 *
 * Un componente que no este aqui ocupa media fila: es el valor que menos
 * estorba: si se queda solo en su fila, el acomodo lo estira a fila completa
 * de todos modos.
 */
const ANCHO_PREFERIDO: Record<string, number> = {
  /*
   * Casi todo ocupa MEDIA fila. El tablero se lee en dos columnas.
   *
   * Antes casi todo era fila completa y el resultado era una tira vertical: en
   * un monitor ancho cada tarjeta se estiraba a 1600px para mostrar tres cifras
   * y el usuario tenia que hacer scroll para ver algo que cabia en una
   * pantalla. Con dos columnas cabe el doble sin encoger nada y el tablero se
   * lee de un vistazo, que es de lo que se trata.
   *
   * Si un widget se queda solo en su fila, `acomodar` lo estira a fila
   * completa: nunca queda media pantalla en blanco.
   */
  HeadlineVerdict: 6,
  RiskAlert: 6,
  ProductPortfolio: 6,
  CardRanking: 6,
  CardShowcase: 6,
  NextSteps: 6,
  DebtSimulator: 6,
  OptionComparator: 6,
  CashflowChart: 6,
  BarChart: 6,
  DonutChart: 6,
  LineChart: 6,
  ProgressBars: 6,
  ExplorationCard: 6,
  UnderstandingSummary: 6,
  ActionPlan: 6,

  /*
   * Fila completa de verdad: la tarjeta de fuera de alcance es lo unico que hay
   * en pantalla cuando aparece, asi que partirla en dos no ahorra nada.
   */
  OutOfScopeCard: 12,

  // Un dato suelto no merece media pantalla.
  Text: 4,
};

export function anchoPreferido(componente: string | undefined): number {
  if (!componente) return 6;
  return ANCHO_PREFERIDO[componente] ?? 6;
}

/**
 * Traduce un ancho de la escala de 12 al grid del breakpoint activo.
 *
 * De 4 columnas para abajo no se escala nada: se apila. En un telefono, dos
 * tarjetas lado a lado a 160px cada una no son dos tarjetas, son dos columnas
 * de palabras cortadas.
 */
export function escalarAncho(ancho: number, columnas: number): number {
  if (columnas <= 4) return columnas;
  return Math.min(columnas, Math.max(2, Math.round((ancho * columnas) / COLUMNAS)));
}

export type Bloque = {
  surfaceId: string;
  /** Ancho deseado en la escala de 12. */
  ancho: number;
  /** Alto ya resuelto, en unidades de fila del grid. */
  alto: number;
};

/**
 * Acomoda los bloques en filas que SIEMPRE suman el ancho completo.
 *
 * Es un empaquetado glotón: se van metiendo en la fila mientras quepan, y al
 * cerrar cada fila el espacio sobrante se REPARTE entre sus miembros. Ese
 * reparto es lo que mata el borde dentado — el caso tipico es una sola tarjeta
 * de media fila que se queda sola y termina ocupando la fila entera, en vez de
 * dejar la mitad derecha en blanco.
 *
 * El sobrante se reparte entre todos y no se le da entero al ultimo, que era lo
 * facil: con dos tarjetas de 4 en una fila de 12, darle todo al ultimo deja una
 * de 4 y otra de 8 —se ve como un error— y repartiendo quedan 6 y 6.
 */
export function acomodar(bloques: Bloque[], columnas: number): GridItem[] {
  const items: GridItem[] = [];
  let fila: Bloque[] = [];
  let usado = 0;
  let y = 0;

  const cerrarFila = () => {
    if (fila.length === 0) return;

    const anchos = fila.map((b) => escalarAncho(b.ancho, columnas));
    const suma = anchos.reduce((a, b) => a + b, 0);

    // El sobrante se reparte parejo; lo que no divide exacto se les da a las
    // primeras, que es donde el ojo cae y donde menos se nota un pixel de mas.
    const sobrante = columnas - suma;
    const parejo = Math.floor(sobrante / fila.length);
    const extra = sobrante % fila.length;

    /*
     * Cada tarjeta mide lo que mide su contenido — mamposteria, no filas
     * parejas.
     *
     * Se probaron las dos. Igualar la altura de la fila deja el tablero como
     * una cuadricula perfecta, pero la tarjeta corta arrastra un hueco enorme
     * abajo para alcanzar a su vecina alta, y con una alerta larga junto a un
     * titular corto eso son 200px de blanco. Con alturas propias mas la
     * compactacion vertical de react-grid-layout, la columna de al lado sube y
     * el hueco desaparece: el tablero queda denso y sin aire muerto, que es lo
     * que se ve en un tablero bancario de verdad.
     */
    let x = 0;
    fila.forEach((bloque, i) => {
      const w = anchos[i] + parejo + (i < extra ? 1 : 0);
      items.push({ surfaceId: bloque.surfaceId, x, y, w, h: bloque.alto, minW: 2, minH: 1 });
      x += w;
    });

    // La siguiente fila arranca debajo de la mas alta de esta; la compactacion
    // se encarga de subir las columnas que quedaron cortas.
    y += Math.max(...fila.map((b) => b.alto));
    fila = [];
    usado = 0;
  };

  for (const bloque of bloques) {
    const ancho = escalarAncho(bloque.ancho, columnas);
    if (usado + ancho > columnas) cerrarFila();
    fila.push(bloque);
    usado += ancho;
  }
  cerrarFila();

  return items;
}

/**
 * Pixeles medidos -> unidades de fila del grid.
 *
 * react-grid-layout calcula el alto de un item como
 * `h * rowHeight + (h - 1) * margenY`, asi que se despeja h y se redondea hacia
 * arriba: quedarse corto seria cortar el contenido, y pasarse solo agrega unos
 * pixeles que la tarjeta absorbe como padding porque se estira a su celda.
 *
 * De ahi que `rowHeight` sea chico (ver ModularCanvas): con la unidad de 88px
 * que habia antes, redondear hacia arriba podia dejar 87px de aire debajo del
 * texto. Ese era, literalmente, el hueco blanco del tablero.
 */
export function filasParaPixeles(pixeles: number, rowHeight: number, margenY: number): number {
  return Math.max(1, Math.ceil((pixeles + margenY) / (rowHeight + margenY)));
}

/**
 * Widgets que se dibujan SIN la tarjeta del canvas alrededor.
 *
 * Es la respuesta a "menos cuadros". Cada surface venia envuelta en su propia
 * caja con borde y barra de titulo, y algunos widgets traen ademas su caja
 * interior: la alerta de riesgo era literalmente un recuadro dentro de otro
 * recuadro. Con cinco widgets eso son cinco a diez rectangulos compitiendo.
 *
 * Estos tres no necesitan marco:
 *  - HeadlineVerdict es el titular: una cifra grande se lee mejor sobre el
 *    fondo que encerrada.
 *  - NextSteps es una tira de botones de cierre.
 *  - RiskAlert ya trae su propia caja de color; esa caja ES la tarjeta.
 *
 * Se siguen pudiendo arrastrar: el asa aparece al pasar el cursor.
 *
 * El planner importa esta lista para contar las tarjetas CON marco de una
 * pantalla (ver revisarReglas): lo que el usuario percibe como "cuadros".
 */
export const SIN_MARCO: ReadonlySet<string> = new Set(["HeadlineVerdict", "NextSteps", "RiskAlert"]);

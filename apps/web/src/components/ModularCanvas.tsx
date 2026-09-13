"use client";

/**
 * Canvas modular. Un widget = una surface A2UI.
 *
 * react-grid-layout no soporta SSR, por eso la carga dinamica.
 *
 * QUIEN DECIDE LA GEOMETRIA (cambio importante): este componente, no el agente.
 *
 * El planner sigue mandando `updateCanvasLayout` porque es parte del protocolo,
 * pero sus x/y/w/h ya no se usan para dibujar. El ancho lo fija el tipo de
 * componente (ver `canvasLayout.ts`) y el alto se MIDE del contenido ya
 * renderizado. Se hizo asi porque el modelo tenia que adivinar el alto de un
 * texto que nunca vio, y cuando fallaba —casi siempre— el tablero salia con
 * huecos blancos y con el borde derecho dentado.
 *
 * Lo que el agente si decide, y es lo que sabe hacer, es QUE widgets emitir y
 * en QUE ORDEN: el orden de creacion de las surfaces es el orden de lectura.
 */
import dynamic from "next/dynamic";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ClientEvent, GridItem, SurfaceState } from "@banorte/a2ui";
import { A2UIRenderer } from "./A2UIRenderer";
import {
  SIN_MARCO,
  acomodar,
  anchoPreferido,
  filasParaPixeles,
  type Bloque,
} from "@/lib/canvasLayout";

/**
 * react-grid-layout@1.5 se publica como CommonJS. Bajo el `import()` de
 * webpack el namespace que regresa envuelve los exports reales en `.default`,
 * asi que `RGL.WidthProvider` sale undefined y truena con
 * "RGL.WidthProvider is not a function". Aceptamos las dos formas: namespace
 * plano (bundle ESM) y namespace con `.default` (interop CJS).
 */
type RGLModule = Pick<
  typeof import("react-grid-layout"),
  "WidthProvider" | "Responsive"
>;

const ResponsiveGridLayout = dynamic(
  async () => {
    const mod = await import("react-grid-layout");
    const RGL: RGLModule =
      "WidthProvider" in mod
        ? mod
        : (mod as unknown as { default: RGLModule }).default;
    return RGL.WidthProvider(RGL.Responsive);
  },
  { ssr: false, loading: () => <CanvasSkeleton /> },
);

/**
 * Unidad de fila deliberadamente pequenia.
 *
 * Antes eran 72px con 16 de margen, o sea saltos de 88px: como el alto se
 * redondea hacia arriba, una tarjeta podia arrastrar hasta 87px de aire
 * debajo del contenido. Con 8px la granularidad es de 24px y el sobrante
 * maximo baja a 23, que la tarjeta absorbe como padding porque se estira a su
 * celda. Deja de leerse como un hueco.
 *
 * El numero de `h` sube (una tarjeta tipica pasa de h: 3 a h: 11), pero eso ya
 * no lo escribe nadie a mano: sale de la medicion.
 */
const ALTO_FILA = 8;
const MARGEN: [number, number] = [16, 16];

const COLUMNAS_POR_BREAKPOINT = { lg: 12, md: 8, sm: 4, xs: 2 };

type Props = {
  surfaces: Record<string, SurfaceState>;
  order: string[];
  layout: GridItem[];
  editable: boolean;
  /** Componente que disparo la consulta en curso; muestra spinner en su boton. */
  busyId?: string | null;
  onEvent: (event: ClientEvent) => void;
  onLayoutChange: (items: GridItem[]) => void;
};

export function ModularCanvas({
  surfaces,
  order,
  editable,
  busyId,
  onEvent,
  onLayoutChange,
}: Props) {
  /**
   * Alto real de cada surface, en pixeles, medido del DOM.
   *
   * Es la pieza que hace que no sobre ni falte espacio. Se llena desde cada
   * tarjeta con un ResizeObserver (ver `Tarjeta`), asi que tambien reacciona a
   * lo que cambia el alto sin que llegue un mensaje del agente: el usuario
   * cambia de plazo en el simulador, se abre el campo de texto de una
   * pregunta, o la ventana se hace angosta y el texto pasa de dos lineas a
   * cuatro.
   */
  const [alturas, setAlturas] = useState<Record<string, number>>({});

  const anotarAltura = useCallback((surfaceId: string, pixeles: number) => {
    setAlturas((previo) => (previo[surfaceId] === pixeles ? previo : { ...previo, [surfaceId]: pixeles }));
  }, []);

  /**
   * Reacomodo manual del usuario.
   *
   * Se guarda SOLO cuando suelta un arrastre o un cambio de ancho, no en cada
   * `onLayoutChange`: ese evento tambien se dispara por nuestras propias
   * remediciones, y guardarlo ahi congelaria el acomodo automatico en la
   * primera medicion.
   *
   * Se descarta en cuanto cambia el conjunto de surfaces: si el agente acaba de
   * armar otra pantalla, respetar el acomodo de la anterior deja huecos donde
   * estaban los widgets que ya no existen.
   */
  const [manual, setManual] = useState<{ firma: string; items: GridItem[] } | null>(null);
  const firma = order.join("|");

  const bloques = useMemo<Bloque[]>(
    () =>
      order.map((surfaceId) => {
        const surface = surfaces[surfaceId];
        const raiz = surface?.root ?? Object.keys(surface?.components ?? {})[0];
        const componente = raiz ? surface?.components[raiz]?.component : undefined;
        const medida = alturas[surfaceId];
        return {
          surfaceId,
          ancho: anchoPreferido(componente),
          // Sin medir todavia (primer render): un alto de arranque discreto.
          // Dura un frame, hasta que el ResizeObserver reporta el real.
          alto: medida ? filasParaPixeles(medida, ALTO_FILA, MARGEN[1]) : 8,
        };
      }),
    [order, surfaces, alturas],
  );

  /**
   * Un layout por breakpoint. No es el mismo escalado: se vuelve a empaquetar
   * con las columnas de cada uno, porque dos tarjetas que caben lado a lado en
   * 12 columnas tienen que apilarse en 4, no encogerse.
   */
  const layouts = useMemo(() => {
    const manualVigente = manual?.firma === firma ? manual.items : null;

    const conAlturaMedida = (items: GridItem[]) =>
      items.map((item) => {
        const bloque = bloques.find((b) => b.surfaceId === item.surfaceId);
        return { ...item, h: bloque?.alto ?? item.h };
      });

    const construir = (columnas: number) => {
      // El acomodo manual solo se respeta en el breakpoint ancho: en angosto
      // todo se apila y no hay nada que respetar. El alto se sigue midiendo
      // aunque el usuario haya movido cosas — el ancho es suyo, el alto no.
      const base =
        manualVigente && columnas === COLUMNAS_POR_BREAKPOINT.lg
          ? conAlturaMedida(manualVigente)
          : acomodar(bloques, columnas);
      return base.map((item) => ({
        i: item.surfaceId,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW ?? 2,
        minH: item.minH ?? 1,
      }));
    };

    return {
      lg: construir(COLUMNAS_POR_BREAKPOINT.lg),
      md: construir(COLUMNAS_POR_BREAKPOINT.md),
      sm: construir(COLUMNAS_POR_BREAKPOINT.sm),
      xs: construir(COLUMNAS_POR_BREAKPOINT.xs),
    };
  }, [bloques, manual, firma]);

  if (order.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center">
        <p className="text-sm text-muted">
          Escribe lo que quieres resolver y Tu rumbo Banorte arma la pantalla.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 900, sm: 640, xs: 0 }}
      cols={COLUMNAS_POR_BREAKPOINT}
      rowHeight={ALTO_FILA}
      margin={MARGEN}
      containerPadding={[0, 0]}
      // Compactacion vertical: cada columna sube hasta topar. Es lo que cierra
      // los huecos cuando dos tarjetas de la misma fila tienen alturas
      // distintas, y lo que hace que el tablero se lea como un bloque y no como
      // una cuadricula con celdas vacias.
      compactType="vertical"
      isDraggable={editable}
      isResizable={editable}
      // Solo el asa lateral: el usuario manda en el ancho, el canvas en el
      // alto. Dejar el asa de esquina invitaba a estirar una tarjeta a lo alto
      // para que la siguiente medicion se lo deshiciera enfrente.
      resizeHandles={["e"]}
      draggableHandle=".drag-handle"
      onDragStop={(actual) => setManual({ firma, items: aGridItems(actual) })}
      onResizeStop={(actual) => setManual({ firma, items: aGridItems(actual) })}
      onLayoutChange={(actual) => {
        const items = aGridItems(actual);
        onLayoutChange(items);
        onEvent({ type: "canvas_layout_changed", items });
      }}
    >
      {order.map((surfaceId) => {
        const surface = surfaces[surfaceId];
        if (!surface) return <div key={surfaceId} />;
        return (
          <Tarjeta
            key={surfaceId}
            surface={surface}
            onEvent={onEvent}
            busyId={busyId}
            onMedida={anotarAltura}
            medida={alturas[surfaceId] !== undefined}
          />
        );
      })}
    </ResponsiveGridLayout>
  );
}

type ItemRGL = { i: string; x: number; y: number; w: number; h: number };

function aGridItems(items: ItemRGL[]): GridItem[] {
  return items.map((l) => ({ surfaceId: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
}

type PropsTarjeta = {
  surface: SurfaceState;
  onEvent: (event: ClientEvent) => void;
  busyId?: string | null;
  onMedida: (surfaceId: string, pixeles: number) => void;
  /** Ya reporto su alto real y el grid ya la coloco donde va. */
  medida: boolean;
  /*
   * Lo que inyecta react-grid-layout al clonar la tarjeta. No son opcionales
   * por gusto: si alguna se queda sin reenviar al <article>, la tarjeta se
   * dibuja fuera de su celda o deja de poder arrastrarse.
   */
  className?: string;
  style?: CSSProperties;
  /** Las asas de redimension que react-resizable agrega como hijos. */
  children?: ReactNode;
};

/**
 * Una surface dibujada como tarjeta del canvas.
 *
 * Es su propio componente por el ResizeObserver: los hooks no pueden vivir
 * dentro del `map` del padre. Y va con `forwardRef` porque react-grid-layout
 * clona a su hijo para ponerle un ref al nodo del DOM: de ahi saca la posicion
 * para el arrastre. Un componente de funcion sin forwardRef recibe ese ref en
 * el vacio y la tarjeta queda inmovil.
 *
 * Por el mismo clonado hay que reenviar `className` y `style` —traen la
 * transformacion que la coloca en su celda— y renderizar `children`, que es
 * donde vienen las asas de redimension.
 *
 * Lo que se mide es el envoltorio interior, no el <article>. El article lo
 * estira el grid a la altura de su celda; el envoltorio conserva la altura
 * natural del contenido, que es justo el numero con el que se calcula la
 * celda. Medir el article seria preguntarle al grid por el alto que el grid
 * mismo acaba de imponer, y el valor nunca cambiaria.
 *
 * No hay bucle de realimentacion: el alto del contenido depende del ancho, y
 * el ancho no cambia cuando cambia la altura de la celda.
 */
const Tarjeta = forwardRef<HTMLElement, PropsTarjeta>(function Tarjeta(
  { surface, onEvent, busyId, onMedida, medida, className = "", style, children, ...resto },
  ref,
) {
  const contenidoRef = useRef<HTMLDivElement>(null);

  // Titular, alerta y siguientes pasos van sin caja: ver SIN_MARCO.
  const raiz = surface.root ?? Object.keys(surface.components)[0];
  const tipo = raiz ? surface.components[raiz]?.component : undefined;
  const sinMarco = tipo !== undefined && SIN_MARCO.has(tipo);

  useEffect(() => {
    const el = contenidoRef.current;
    if (!el) return;
    const reportar = () => onMedida(surface.surfaceId, el.offsetHeight);
    reportar();
    const observador = new ResizeObserver(reportar);
    observador.observe(el);
    return () => observador.disconnect();
  }, [surface.surfaceId, onMedida]);

  return (
    <article
      {...resto}
      ref={ref}
      style={style}
      /*
        Invisible hasta que se mide.

        El primer cuadro se dibuja con un alto de arranque, antes de que el
        ResizeObserver reporte el real; el grid coloca todo con ese alto y
        luego anima cada bloque a su lugar. Con cajas opacas eso se veia como
        tarjetas deslizandose. Sin marco —titular, alerta, siguientes pasos—
        se veia texto encimado sobre texto durante la animacion.

        `opacity` y no `display: none`: el bloque tiene que ocupar su espacio
        y dejarse medir aunque todavia no se vea.
      */
      className={`${className} group/tarjeta transition-opacity duration-300 ${
        medida ? "opacity-100" : "opacity-0"
      } ${
        sinMarco
          ? ""
          : "overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(20,16,15,0.04)]"
      }`}
    >
      {/*
        Sin marco no hay barra de titulo donde agarrar, asi que el asa flota
        en la esquina y aparece al pasar el cursor. Va fuera del envoltorio
        medido: es absoluta y no debe sumar al alto de la tarjeta.
      */}
      {sinMarco && (
        <div
          title="Arrastra para mover"
          className="drag-handle absolute right-1 top-1 z-10 grid h-7 w-7 cursor-grab place-items-center rounded-lg bg-surface/90 text-muted-soft opacity-0 shadow-sm transition-opacity hover:text-brand active:cursor-grabbing group-hover/tarjeta:opacity-100"
        >
          <Asa />
        </div>
      )}

      <div ref={contenidoRef}>
        {/*
          El asa de arrastre tiene que VERSE. Un `cursor: grab` solo aparece
          cuando el cursor ya esta encima, asi que nadie descubria que el
          tablero se puede reacomodar: habia que pasar por ahi de casualidad.
        */}
        {!sinMarco && (
          <header className="drag-handle group/asa flex cursor-grab items-center gap-2 border-b border-line px-4 py-2 active:cursor-grabbing">
            <span className="text-line transition-colors group-hover/asa:text-brand">
              <Asa />
            </span>
            <span className="truncate text-xs text-muted">{surface.title ?? surface.surfaceId}</span>
          </header>
        )}
        <div className={sinMarco ? "px-1 py-2" : "p-4"}>
          <A2UIRenderer surface={surface} onEvent={onEvent} busyId={busyId} />
        </div>
      </div>
      {children}
    </article>
  );
});

/** Seis puntos: la convencion para "esto se agarra". */
function Asa() {
  return (
    <svg aria-hidden viewBox="0 0 10 16" width="10" height="16" className="shrink-0">
      <g fill="currentColor">
        <circle cx="2" cy="3" r="1.3" /><circle cx="8" cy="3" r="1.3" />
        <circle cx="2" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" />
        <circle cx="2" cy="13" r="1.3" /><circle cx="8" cy="13" r="1.3" />
      </g>
    </svg>
  );
}

function CanvasSkeleton() {
  return <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
}

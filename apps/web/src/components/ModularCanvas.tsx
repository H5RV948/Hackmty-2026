"use client";

/**
 * Canvas modular. Un widget = una surface A2UI.
 *
 * react-grid-layout no soporta SSR, por eso la carga dinamica.
 * El layout es estado del cliente: cuando el usuario reacomoda, emitimos
 * `canvas_layout_changed` al agente como contexto (evento ligero, no el JSON
 * completo de la UI).
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ClientEvent, GridItem, SurfaceState } from "@banorte/a2ui";
import { A2UIRenderer } from "./A2UIRenderer";

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

type Props = {
  surfaces: Record<string, SurfaceState>;
  order: string[];
  layout: GridItem[];
  editable: boolean;
  onEvent: (event: ClientEvent) => void;
  onLayoutChange: (items: GridItem[]) => void;
};

export function ModularCanvas({
  surfaces,
  order,
  layout,
  editable,
  onEvent,
  onLayoutChange,
}: Props) {
  // Surfaces sin posicion explicita caen apiladas al final.
  const rglLayout = useMemo(
    () =>
      order.map((surfaceId, index) => {
        const item = layout.find((l) => l.surfaceId === surfaceId);
        return {
          i: surfaceId,
          x: item?.x ?? 0,
          y: item?.y ?? index * 4,
          w: item?.w ?? 6,
          h: item?.h ?? 4,
          minW: item?.minW ?? 3,
          minH: item?.minH ?? 3,
        };
      }),
    [order, layout],
  );

  if (order.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center">
        <p className="text-sm text-muted">
          Escribe lo que quieres resolver y el asesor arma la pantalla.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: rglLayout, md: rglLayout, sm: rglLayout }}
      breakpoints={{ lg: 1200, md: 900, sm: 640, xs: 0 }}
      cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
      rowHeight={72}
      margin={[16, 16]}
      isDraggable={editable}
      isResizable={editable}
      draggableHandle=".drag-handle"
      onLayoutChange={(current) => {
        onLayoutChange(
          current.map((l) => ({ surfaceId: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
        );
        onEvent({
          type: "canvas_layout_changed",
          items: current.map((l) => ({ surfaceId: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
        });
      }}
    >
      {order.map((surfaceId) => {
        const surface = surfaces[surfaceId];
        if (!surface) return <div key={surfaceId} />;
        return (
          <article
            key={surfaceId}
            className="overflow-auto rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(20,16,15,0.04)]"
          >
            <header className="drag-handle flex cursor-grab items-center justify-between border-b border-line px-4 py-2 active:cursor-grabbing">
              <span className="text-xs text-muted">{surface.title ?? surface.surfaceId}</span>
            </header>
            <div className="p-4">
              <A2UIRenderer surface={surface} onEvent={onEvent} />
            </div>
          </article>
        );
      })}
    </ResponsiveGridLayout>
  );
}

function CanvasSkeleton() {
  return <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
}

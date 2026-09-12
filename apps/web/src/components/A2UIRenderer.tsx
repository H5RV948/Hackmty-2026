"use client";

/**
 * Renderizador dinamico de una surface A2UI.
 *
 * Recibe la surface ya normalizada (lista plana de componentes + data model),
 * resuelve bindings y monta el componente React del registro.
 *
 * Cada nodo se envuelve con data-a2ui-id: es lo que driver.js usa para el
 * spotlight. Sin ese atributo la guia agentica no funciona.
 */
import type { SurfaceState, ClientEvent } from "@banorte/a2ui";
import { ComponentRegistry } from "./ComponentRegistry";
import { resolveProps } from "@/lib/binding";

type Props = {
  surface: SurfaceState;
  onEvent: (event: ClientEvent) => void;
};

export function A2UIRenderer({ surface, onEvent }: Props) {
  const rootId = surface.root ?? Object.keys(surface.components)[0];
  if (!rootId) {
    return <p className="text-sm text-muted">Esta seccion aun no tiene contenido.</p>;
  }
  return <Node id={rootId} surface={surface} onEvent={onEvent} />;
}

function Node({ id, surface, onEvent }: Props & { id: string }) {
  const node = surface.components[id];

  if (!node) {
    // Componente referenciado que no llego: no rompemos la pantalla completa.
    return <Fallback message={`Falta el componente "${id}".`} />;
  }

  const Component = ComponentRegistry[node.component];
  if (!Component) {
    return <Fallback message={`"${node.component}" no esta en el registro.`} />;
  }

  const { id: _id, component: _component, children, ...rest } = node;
  const props = resolveProps(rest, surface.dataModel);

  const emit = (name: string, payload?: Record<string, unknown>) =>
    onEvent({
      type: "ui_action",
      surfaceId: surface.surfaceId,
      componentId: node.id,
      name,
      payload,
    });

  return (
    <div data-a2ui-id={node.id}>
      <Component id={node.id} emit={emit} {...props}>
        {children?.map((childId) => (
          <Node key={childId} id={childId} surface={surface} onEvent={onEvent} />
        ))}
      </Component>
    </div>
  );
}

function Fallback({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">
      {message}
    </p>
  );
}

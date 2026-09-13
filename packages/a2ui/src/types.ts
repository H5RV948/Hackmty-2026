/**
 * A2UI v0.9.1 + extensiones del proyecto.
 *
 * Spec: https://a2ui.org/specification/v0.9.1-a2ui/
 *
 * Reglas del proyecto (ver AGENTS.md):
 *  - Un widget del canvas = una surface de A2UI.
 *  - El layout del grid NO vive dentro de un componente: viaja en
 *    `updateCanvasLayout`, indexado por surfaceId.
 */

export const A2UI_VERSION = "v0.9.1" as const;

/** Binding al data model de la surface, por JSON Pointer. */
export type Binding = { path: string };

/** Un valor de prop puede ser literal o un binding. */
export type Bindable<T> = T | Binding;

export function isBinding(value: unknown): value is Binding {
  return typeof value === "object" && value !== null && "path" in value;
}

/** Evento que un componente dispara y que regresa al agente como contexto. */
export type A2UIAction = {
  event: {
    name: string;
    payload?: Record<string, unknown>;
  };
};

/**
 * Componente A2UI: lista plana con referencias por id.
 * `component` debe existir en banorte-catalog.json.
 */
export type A2UIComponent = {
  id: string;
  component: string;
  /** Hijos por id, para contenedores. */
  children?: string[];
  action?: A2UIAction;
  /** Props declaradas por el catalogo. */
  [prop: string]: unknown;
};

/* ------------------------------------------------------------------ */
/* Mensajes de la spec                                                 */
/* ------------------------------------------------------------------ */

export type CreateSurface = {
  version: typeof A2UI_VERSION;
  createSurface: {
    surfaceId: string;
    catalogId: string;
    /** Titulo del widget en el canvas. Extension nuestra, opcional. */
    title?: string;
  };
};

export type UpdateComponents = {
  version: typeof A2UI_VERSION;
  updateComponents: {
    surfaceId: string;
    components: A2UIComponent[];
    /** Id del componente raiz de la surface. */
    root?: string;
  };
};

export type UpdateDataModel = {
  version: typeof A2UI_VERSION;
  updateDataModel: {
    surfaceId: string;
    /** JSON Pointer, p.ej. "/tdc". */
    path: string;
    value: unknown;
  };
};

export type DeleteSurface = {
  version: typeof A2UI_VERSION;
  deleteSurface: { surfaceId: string };
};

/* ------------------------------------------------------------------ */
/* Extensiones del proyecto (no son spec)                              */
/* ------------------------------------------------------------------ */

export type GridItem = {
  surfaceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

/** Posicion de cada surface en el canvas modular. */
export type UpdateCanvasLayout = {
  version: typeof A2UI_VERSION;
  updateCanvasLayout: {
    items: GridItem[];
    /** Si es false, el usuario no puede reacomodar (p.ej. durante un tour). */
    editable?: boolean;
  };
};

/** Pasos de spotlight/coachmark que driver.js consume. */
export type GuidanceStep = {
  /** Id del componente A2UI a resaltar. El renderer expone data-a2ui-id. */
  targetId: string;
  title: string;
  body: string;
  side?: "top" | "right" | "bottom" | "left";
};

export type UpdateGuidance = {
  version: typeof A2UI_VERSION;
  updateGuidance: {
    surfaceId?: string;
    steps: GuidanceStep[];
    /** "auto" arranca solo; "manual" espera a que el usuario lo pida. */
    trigger?: "auto" | "manual";
  };
};

export type A2UIMessage =
  | CreateSurface
  | UpdateComponents
  | UpdateDataModel
  | DeleteSurface
  | UpdateCanvasLayout
  | UpdateGuidance;

/* ------------------------------------------------------------------ */
/* Cliente -> agente                                                   */
/* ------------------------------------------------------------------ */

export type ClientEvent =
  | {
      type: "ui_action";
      surfaceId: string;
      componentId: string;
      name: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "canvas_layout_changed";
      items: GridItem[];
    }
  | {
      type: "user_message";
      text: string;
      /**
       * El usuario insiste despues de que el filtro de alcance rechazo su
       * consulta (ver `scope.ts`). Salta el filtro y va derecho al agente.
       *
       * Existe porque el filtro son expresiones regulares y va a equivocarse
       * alguna vez: sin esta bandera, una consulta legitima mal clasificada no
       * tendria forma de llegar al agente y el usuario se quedaria picando el
       * mismo boton esperando otro resultado.
       */
      forzado?: boolean;
    };

/* ------------------------------------------------------------------ */
/* Estado del cliente                                                  */
/* ------------------------------------------------------------------ */

export type SurfaceState = {
  surfaceId: string;
  catalogId: string;
  title?: string;
  components: Record<string, A2UIComponent>;
  root?: string;
  dataModel: Record<string, unknown>;
};

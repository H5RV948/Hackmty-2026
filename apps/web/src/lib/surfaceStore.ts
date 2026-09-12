"use client";

import { useCallback, useReducer } from "react";
import type { A2UIMessage, GridItem, GuidanceStep, SurfaceState } from "@banorte/a2ui";
import { writePath } from "./binding";

export type CanvasState = {
  surfaces: Record<string, SurfaceState>;
  order: string[];
  layout: GridItem[];
  layoutEditable: boolean;
  guidance: { steps: GuidanceStep[]; trigger: "auto" | "manual" } | null;
};

export const emptyCanvas: CanvasState = {
  surfaces: {},
  order: [],
  layout: [],
  layoutEditable: true,
  guidance: null,
};

type Action =
  | { type: "a2ui"; message: A2UIMessage }
  | { type: "localLayout"; items: GridItem[] }
  | { type: "dismissGuidance" };

/**
 * Aplica mensajes A2UI al estado del canvas.
 * Ojo: updateDataModel NO regenera componentes, por eso las interacciones
 * se sienten instantaneas (ver AGENTS.md, regla 4).
 */
function reducer(state: CanvasState, action: Action): CanvasState {
  if (action.type === "localLayout") return { ...state, layout: action.items };
  if (action.type === "dismissGuidance") return { ...state, guidance: null };

  const message = action.message;

  if ("createSurface" in message) {
    const { surfaceId, catalogId, title } = message.createSurface;
    return {
      ...state,
      surfaces: {
        ...state.surfaces,
        [surfaceId]: { surfaceId, catalogId, title, components: {}, dataModel: {} },
      },
      order: state.order.includes(surfaceId) ? state.order : [...state.order, surfaceId],
    };
  }

  if ("updateComponents" in message) {
    const { surfaceId, components, root } = message.updateComponents;
    const surface = state.surfaces[surfaceId];
    if (!surface) return state;
    const merged = { ...surface.components };
    for (const component of components) merged[component.id] = component;
    return {
      ...state,
      surfaces: {
        ...state.surfaces,
        [surfaceId]: { ...surface, components: merged, root: root ?? surface.root },
      },
    };
  }

  if ("updateDataModel" in message) {
    const { surfaceId, path, value } = message.updateDataModel;
    const surface = state.surfaces[surfaceId];
    if (!surface) return state;
    return {
      ...state,
      surfaces: {
        ...state.surfaces,
        [surfaceId]: { ...surface, dataModel: writePath(surface.dataModel, path, value) },
      },
    };
  }

  if ("deleteSurface" in message) {
    const { surfaceId } = message.deleteSurface;
    const surfaces = { ...state.surfaces };
    delete surfaces[surfaceId];
    return {
      ...state,
      surfaces,
      order: state.order.filter((id) => id !== surfaceId),
      layout: state.layout.filter((item) => item.surfaceId !== surfaceId),
    };
  }

  if ("updateCanvasLayout" in message) {
    const { items, editable } = message.updateCanvasLayout;
    return { ...state, layout: items, layoutEditable: editable ?? state.layoutEditable };
  }

  if ("updateGuidance" in message) {
    const { steps, trigger } = message.updateGuidance;
    return { ...state, guidance: { steps, trigger: trigger ?? "auto" } };
  }

  return state;
}

export function useCanvas(initial: CanvasState = emptyCanvas) {
  const [state, dispatch] = useReducer(reducer, initial);

  const applyMessage = useCallback((message: A2UIMessage) => {
    dispatch({ type: "a2ui", message });
  }, []);

  const setLayout = useCallback((items: GridItem[]) => {
    dispatch({ type: "localLayout", items });
  }, []);

  const dismissGuidance = useCallback(() => dispatch({ type: "dismissGuidance" }), []);

  return { state, applyMessage, setLayout, dismissGuidance };
}

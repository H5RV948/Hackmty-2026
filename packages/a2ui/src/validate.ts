/**
 * Validador de mensajes A2UI contra el catalogo.
 *
 * Regla dura (AGENTS.md #2): todo mensaje que sale del backend pasa por aqui.
 * Si falla, ciclo de reparacion con el error, maximo 2 intentos, luego fallback.
 */
import { z } from "zod";
// `with { type: "json" }` lo exige Node al importar JSON (lo usa `pnpm test`);
// Next lo acepta igual.
import catalog from "@banorte/catalog/banorte-catalog.json" with { type: "json" };
import { A2UI_VERSION, type A2UIMessage } from "./types.ts";

type DefinicionCatalogo = {
  description: string;
  props: Record<string, { required?: boolean }>;
};

const COMPONENTES_CATALOGO = (catalog as { components: Record<string, DefinicionCatalogo> })
  .components;

const CATALOG_COMPONENTS = Object.keys(COMPONENTES_CATALOGO);

/**
 * Props obligatorias por componente, leidas del catalogo.
 *
 * Existe porque el esquema de un componente es `passthrough()`: las props son
 * abiertas a proposito (cada widget declara las suyas en el catalogo, no en
 * Zod), y eso dejaba pasar un componente SIN sus props obligatorias. El mensaje
 * era valido, el canvas lo dibujaba, y el usuario veia una tarjeta en blanco:
 * un fallo sin error en ningun log, que es el peor de todos.
 *
 * `action` se excluye a proposito aunque el catalogo la marque obligatoria:
 * todos los widgets resuelven el nombre del evento con un valor por omision, y
 * exigirla solo gastaria intentos de reparacion sin cambiar un pixel.
 */
const PROPS_OBLIGATORIAS: Record<string, string[]> = Object.fromEntries(
  Object.entries(COMPONENTES_CATALOGO).map(([nombre, def]) => [
    nombre,
    Object.entries(def.props ?? {})
      .filter(([prop, spec]) => spec?.required === true && prop !== "action")
      .map(([prop]) => prop),
  ]),
);

/**
 * Props que SI existen en el catalogo para cada componente, para distinguir
 * "esta clave esta de mas" de "esta clave es la prop obligatoria mal escrita".
 * El componente es `passthrough()` a proposito, asi que una clave inventada
 * (el modelo escribe "verdict" en ingles en vez de "veredicto") pasa el
 * validador en silencio y encima nunca se corrige: el error solo dice que
 * falta la prop, no que sobra una que se le parece.
 */
const PROPS_CONOCIDAS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(COMPONENTES_CATALOGO).map(([nombre, def]) => [
    nombre,
    new Set(Object.keys(def.props ?? {})),
  ]),
);
const CLAVES_BASE_COMPONENTE = new Set(["id", "component", "children", "action"]);

const version = z.literal(A2UI_VERSION);

const binding = z.object({ path: z.string().startsWith("/") });

const action = z.object({
  event: z.object({
    name: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
  }),
});

const component = z
  .object({
    id: z.string().min(1),
    component: z.enum(CATALOG_COMPONENTS as [string, ...string[]]),
    children: z.array(z.string()).optional(),
    action: action.optional(),
  })
  .passthrough()
  .refine(
    (c) => !("x" in c || "y" in c || "w" in c || "h" in c),
    {
      message:
        "El layout del grid no va dentro de un componente A2UI. Usa updateCanvasLayout.",
    },
  );

const gridItem = z.object({
  surfaceId: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  minW: z.number().int().positive().optional(),
  minH: z.number().int().positive().optional(),
});

const messageSchema = z.union([
  z.object({
    version,
    createSurface: z.object({
      surfaceId: z.string().min(1),
      catalogId: z.string().min(1),
      title: z.string().optional(),
    }),
  }),
  z.object({
    version,
    updateComponents: z.object({
      surfaceId: z.string().min(1),
      components: z.array(component).min(1),
      root: z.string().optional(),
    }),
  }),
  z.object({
    version,
    updateDataModel: z.object({
      surfaceId: z.string().min(1),
      path: z.string().startsWith("/"),
      value: z.unknown(),
    }),
  }),
  z.object({
    version,
    deleteSurface: z.object({ surfaceId: z.string().min(1) }),
  }),
  z.object({
    version,
    updateCanvasLayout: z.object({
      items: z.array(gridItem),
      editable: z.boolean().optional(),
    }),
  }),
  z.object({
    version,
    updateGuidance: z.object({
      surfaceId: z.string().optional(),
      steps: z
        .array(
          z.object({
            targetId: z.string().min(1),
            title: z.string().min(1),
            body: z.string().min(1),
            side: z.enum(["top", "right", "bottom", "left"]).optional(),
          }),
        )
        .min(1),
      trigger: z.enum(["auto", "manual"]).optional(),
    }),
  }),
]);

export type ValidationResult =
  | { ok: true; message: A2UIMessage }
  | { ok: false; errors: string[] };

export function validateA2UI(input: unknown): ValidationResult {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`,
      ),
    };
  }

  const message = parsed.data as A2UIMessage;

  // Integridad referencial: children y root deben existir en la misma surface.
  if ("updateComponents" in message) {
    const { components, root } = message.updateComponents;
    const ids = new Set(components.map((c) => c.id));
    const errors: string[] = [];
    for (const c of components) {
      for (const child of c.children ?? []) {
        if (!ids.has(child)) {
          errors.push(`${c.id}: el hijo "${child}" no existe en la surface.`);
        }
      }
    }
    if (root && !ids.has(root)) {
      errors.push(`root: "${root}" no existe en la surface.`);
    }

    // Props obligatorias del catalogo. Una cadena vacia cuenta como ausente:
    // un titulo en blanco es lo mismo que no tener titulo.
    for (const c of components) {
      const faltantes = (PROPS_OBLIGATORIAS[c.component] ?? []).filter((prop) => {
        const valor = (c as Record<string, unknown>)[prop];
        return valor === undefined || valor === null || valor === "";
      });
      if (faltantes.length === 0) continue;

      const conocidas = PROPS_CONOCIDAS[c.component] ?? new Set<string>();
      const desconocidas = Object.keys(c as Record<string, unknown>).filter(
        (k) => !CLAVES_BASE_COMPONENTE.has(k) && !conocidas.has(k),
      );
      const pista = desconocidas.length
        ? ` Ojo: trae esta(s) clave(s) que NO existen en el catalogo para ${c.component}: ${desconocidas
            .map((k) => `"${k}"`)
            .join(", ")}. Si alguna es la misma informacion con otro nombre (ingles, mal escrita), renombrala a la prop del catalogo en vez de agregar una nueva.`
        : "";

      for (const prop of faltantes) {
        errors.push(
          `${c.id} (${c.component}): falta la prop obligatoria "${prop}". El catalogo la exige y el widget la dibuja: sin ella la tarjeta sale incompleta.${pista}`,
        );
      }
    }

    if (errors.length > 0) return { ok: false, errors };
  }

  return { ok: true, message };
}

/** Prompt-friendly: lista de componentes permitidos para el surface planner. */
export function catalogSummaryForPrompt(): string {
  const components = (catalog as {
    components: Record<string, { description: string; props: Record<string, unknown> }>;
  }).components;
  return Object.entries(components)
    .map(([name, def]) => `- ${name}: ${def.description}\n  props: ${Object.keys(def.props).join(", ")}`)
    .join("\n");
}

export const CATALOG_ID = (catalog as { catalogId: string }).catalogId;

import { isBinding } from "@banorte/a2ui";

/** Lee un JSON Pointer simple ("/tdc/saldo") del data model. */
export function readPath(dataModel: Record<string, unknown>, path: string): unknown {
  return path
    .split("/")
    .filter(Boolean)
    .reduce<unknown>((acc, key) => {
      if (acc === null || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, dataModel);
}

/** Escribe un JSON Pointer, creando los objetos intermedios. */
export function writePath(
  dataModel: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split("/").filter(Boolean);
  if (keys.length === 0) return value as Record<string, unknown>;

  const next = { ...dataModel };
  let cursor: Record<string, unknown> = next;
  keys.slice(0, -1).forEach((key) => {
    const current = cursor[key];
    cursor[key] = typeof current === "object" && current !== null ? { ...current } : {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys[keys.length - 1]!] = value;
  return next;
}

/** Resuelve props: los bindings se sustituyen por su valor del data model. */
export function resolveProps(
  props: Record<string, unknown>,
  dataModel: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = isBinding(value) ? readPath(dataModel, value.path) : value;
  }
  return out;
}

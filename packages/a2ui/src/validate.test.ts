import test from "node:test";
import assert from "node:assert/strict";
import { validateA2UI } from "./validate.ts";

test("acepta updateComponents valido", () => {
  const r = validateA2UI({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "deuda-tdc",
      root: "titulo",
      components: [{ id: "titulo", component: "Text", text: "Tu saldo", variant: "h2" }],
    },
  });
  assert.equal(r.ok, true);
});

test("rechaza componentes fuera del catalogo", () => {
  const r = validateA2UI({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "x",
      components: [{ id: "a", component: "SuperWidget3000" }],
    },
  });
  assert.equal(r.ok, false);
});

test("rechaza coordenadas de grid dentro de un componente", () => {
  const r = validateA2UI({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "x",
      components: [{ id: "a", component: "Text", text: "hola", x: 0, y: 0, w: 4, h: 3 }],
    },
  });
  assert.equal(r.ok, false);
});

test("rechaza hijos inexistentes", () => {
  const r = validateA2UI({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "x",
      components: [{ id: "a", component: "Text", text: "hola", children: ["fantasma"] }],
    },
  });
  assert.equal(r.ok, false);
});

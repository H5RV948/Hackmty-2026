/**
 * Galeria de widgets: criterio de aceptacion de la fase 2.
 * Todo componente del catalogo debe poder verse aqui con datos de ejemplo.
 */
"use client";

import { A2UIRenderer } from "@/components/A2UIRenderer";
import type { SurfaceState } from "@banorte/a2ui";

const examples: SurfaceState[] = [
  {
    surfaceId: "g-simulador",
    catalogId: "gallery",
    title: "DebtSimulator",
    root: "sim",
    components: {
      sim: {
        id: "sim",
        component: "DebtSimulator",
        saldo: 18400,
        plazos: [12, 18, 24],
        plazoSeleccionado: 18,
        cat: 34.1,
        pagoMensual: 1215,
        action: { event: { name: "simulate_restructure" } },
      },
    },
    dataModel: {},
  },
  // TODO(fase 2): un ejemplo por cada componente del catalogo.
];

export default function Gallery() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <h1 className="text-2xl font-semibold">Galeria de componentes</h1>
      {examples.map((surface) => (
        <section key={surface.surfaceId} className="rounded-2xl border border-line bg-surface p-6">
          <p className="mb-4 text-xs text-muted">{surface.title}</p>
          <A2UIRenderer surface={surface} onEvent={(e) => console.log(e)} />
        </section>
      ))}
    </main>
  );
}

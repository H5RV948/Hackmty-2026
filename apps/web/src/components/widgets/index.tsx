"use client";

/**
 * Widgets del catalogo Banorte.
 *
 * Cada widget:
 *  - recibe props ya resueltas (los bindings se resolvieron en el renderer);
 *  - recibe `emit` para mandar eventos de vuelta al agente;
 *  - NO conoce el grid ni su posicion.
 *
 * Para agregar uno nuevo, sigue los cinco pasos de AGENTS.md, regla 1.
 */

import type { ReactNode } from "react";

export type EmitFn = (name: string, payload?: Record<string, unknown>) => void;

export type WidgetProps = Record<string, unknown> & {
  id: string;
  emit: EmitFn;
  children?: ReactNode;
};

const money = (n: unknown) =>
  typeof n === "number"
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
    : String(n ?? "");

/* ---------------------------------------------------------------- */
/* Primitivos                                                        */
/* ---------------------------------------------------------------- */

export function Text({ text, variant = "body" }: WidgetProps) {
  const styles: Record<string, string> = {
    h1: "text-2xl font-semibold tracking-tight",
    h2: "text-lg font-semibold",
    h3: "text-base font-semibold",
    body: "text-sm text-ink",
    caption: "text-xs text-muted",
  };
  return <p className={styles[String(variant)] ?? styles.body}>{String(text ?? "")}</p>;
}

export function Button({ label, variant = "primary", emit, action }: WidgetProps) {
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "click";
  const styles: Record<string, string> = {
    primary: "bg-brand text-white hover:bg-brand/90",
    secondary: "border border-line bg-surface hover:bg-brand-soft",
    ghost: "text-brand hover:bg-brand-soft",
  };
  return (
    <button
      type="button"
      onClick={() => emit(name)}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${styles[String(variant)] ?? styles.primary}`}
    >
      {String(label ?? "")}
    </button>
  );
}

export function Stat({ label, value, delta, tone = "neutral" }: WidgetProps) {
  const tones: Record<string, string> = {
    neutral: "text-ink",
    positive: "text-positive",
    warning: "text-warning",
    critical: "text-brand",
  };
  return (
    <div>
      <p className="text-xs text-muted">{String(label ?? "")}</p>
      <p className={`tnum text-xl font-semibold ${tones[String(tone)] ?? tones.neutral}`}>
        {String(value ?? "")}
      </p>
      {delta ? <p className="tnum text-xs text-muted">{String(delta)}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Fase: analizar                                                    */
/* ---------------------------------------------------------------- */

type Metric = { label: string; value: string; delta?: string; tone?: string };

export function FinancialHealthCard({ titulo, lectura, metricas }: WidgetProps) {
  const items = Array.isArray(metricas) ? (metricas as Metric[]) : [];
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      <p className="max-w-[62ch] text-sm leading-relaxed text-muted">{String(lectura ?? "")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((m) => (
          <Stat key={m.label} id={m.label} emit={() => {}} {...m} />
        ))}
      </div>
    </section>
  );
}

// TODO(fase 2): graficar la serie. Contrato en banorte-catalog.json.
export function CashflowChart({ titulo }: WidgetProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      <p className="text-xs text-muted">Pendiente: grafica de ingresos contra gastos.</p>
    </section>
  );
}

// TODO(fase 2): distribucion por categoria.
export function SpendingBreakdown({ titulo }: WidgetProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      <p className="text-xs text-muted">Pendiente: desglose de gasto por categoria.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Fase: posibilidades y exploracion                                 */
/* ---------------------------------------------------------------- */

type Opportunity = { id: string; titulo: string; porQue: string; impactoEstimado: string };

export function OpportunityGrid({ titulo, opciones, emit, action }: WidgetProps) {
  const items = Array.isArray(opciones) ? (opciones as Opportunity[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "opportunity_selected";
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => emit(name, { opportunityId: o.id })}
              className="w-full rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <p className="font-medium">{o.titulo}</p>
              <p className="mt-1 text-sm text-muted">{o.porQue}</p>
              <p className="tnum mt-2 text-sm text-positive">{o.impactoEstimado}</p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExplorationCard({ pregunta, porQuePregunto, tipo, opciones, slot, emit, action }: WidgetProps) {
  const items = Array.isArray(opciones) ? (opciones as { id: string; label: string }[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "exploration_answer";
  return (
    <section className="space-y-3">
      <p className="text-base font-medium">{String(pregunta ?? "")}</p>
      <p className="text-xs text-muted">{String(porQuePregunto ?? "")}</p>
      {String(tipo) === "opcion" ? (
        <div className="flex flex-wrap gap-2">
          {items.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => emit(name, { slot, value: o.id })}
              className="rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-brand hover:bg-brand-soft"
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        // TODO(fase 5): inputs para escala, monto y texto libre.
        <p className="text-xs text-muted">Pendiente: entrada de tipo {String(tipo)}.</p>
      )}
    </section>
  );
}

export function UnderstandingSummary({ objetivoEntendido, supuestos, emit, action }: WidgetProps) {
  const items = Array.isArray(supuestos) ? (supuestos as string[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "understanding_feedback";
  return (
    <section className="space-y-4 rounded-xl bg-brand-soft p-4">
      <div>
        <p className="text-sm text-muted">Esto es lo que entendi</p>
        <p className="mt-1 font-medium">{String(objetivoEntendido ?? "")}</p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => emit(name, { confirmado: true })}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Asi es, continua
        </button>
        <button
          type="button"
          onClick={() => emit(name, { confirmado: false })}
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm"
        >
          Corregir algo
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Fase: resultado                                                   */
/* ---------------------------------------------------------------- */

export function DebtSimulator({ saldo, plazos, plazoSeleccionado, cat, pagoMensual, emit, action }: WidgetProps) {
  const options = Array.isArray(plazos) ? (plazos as number[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "simulate_restructure";
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted">Saldo a reestructurar</p>
        <p className="tnum text-2xl font-semibold">{money(saldo)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === plazoSeleccionado}
            onClick={() => emit(name, { plazoMeses: p })}
            className={`tnum rounded-full border px-4 py-2 text-sm transition-colors ${
              p === plazoSeleccionado ? "border-brand bg-brand-soft font-medium" : "border-line"
            }`}
          >
            {p} meses
          </button>
        ))}
      </div>
      <div className="flex gap-8 border-t border-line pt-3">
        <Stat id="pago" emit={() => {}} label="Pago mensual" value={money(pagoMensual)} />
        <Stat id="cat" emit={() => {}} label="CAT" value={typeof cat === "number" ? `${cat}%` : "—"} />
      </div>
      <p className="text-xs text-muted">Datos de ejemplo. El calculo lo hace la herramienta MCP, no el modelo.</p>
    </section>
  );
}

type Option = {
  id: string; nombre: string; pagoMensual: number; costoTotal: number;
  plazoMeses: number; ventaja: string; desventaja: string;
};

export function OptionComparator({ titulo, opciones, emit, action }: WidgetProps) {
  const items = Array.isArray(opciones) ? (opciones as Option[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "option_selected";
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((o) => (
          <article key={o.id} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-medium">{o.nombre}</p>
            <p className="tnum mt-2 text-xl font-semibold">{money(o.pagoMensual)}</p>
            <p className="tnum text-xs text-muted">al mes · {o.plazoMeses} meses</p>
            <p className="tnum mt-2 text-sm">Costo total {money(o.costoTotal)}</p>
            <p className="mt-3 text-xs text-positive">{o.ventaja}</p>
            <p className="text-xs text-warning">{o.desventaja}</p>
            <button
              type="button"
              onClick={() => emit(name, { optionId: o.id })}
              className="mt-3 text-sm font-medium text-brand"
            >
              Ver esta opcion a detalle
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

type Step = { titulo: string; detalle: string; requiereConfirmacion: boolean };

export function ActionPlan({ titulo, pasos, emit, action }: WidgetProps) {
  const items = Array.isArray(pasos) ? (pasos as Step[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "plan_confirmed";
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      <ol className="space-y-3">
        {items.map((p, index) => (
          <li key={p.titulo} className="flex gap-3">
            <span className="tnum mt-0.5 h-6 w-6 shrink-0 rounded-full bg-brand-soft text-center text-sm leading-6 text-brand">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{p.titulo}</p>
              <p className="text-sm text-muted">{p.detalle}</p>
              {p.requiereConfirmacion ? (
                <button
                  type="button"
                  onClick={() => emit(name, { paso: p.titulo })}
                  className="mt-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
                >
                  Confirmar este paso
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

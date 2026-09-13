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

import { useEffect, useState, type ReactNode } from "react";

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

/**
 * Una sola pregunta progresiva.
 *
 * `permiteOtro` es lo que la vuelve util para desambiguar: el agente propone
 * las dos lecturas que considera mas probables y deja una tercera salida de
 * texto libre. Sin ese "Otro", si el agente entendio mal las dos veces el
 * usuario no tiene como corregirlo y acaba peleandose con los chips.
 */
export function ExplorationCard({
  pregunta,
  porQuePregunto,
  tipo,
  opciones,
  permiteOtro,
  slot,
  emit,
  action,
}: WidgetProps) {
  const items = Array.isArray(opciones) ? (opciones as { id: string; label: string }[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "exploration_answer";

  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState("");

  // Texto libre: o lo pidio el agente con permiteOtro, o el tipo ya lo es.
  const libre = permiteOtro === true || String(tipo) === "texto" || String(tipo) === "monto";
  const soloTexto = String(tipo) === "texto" || String(tipo) === "monto";

  const mandarTexto = () => {
    const valor = texto.trim();
    if (!valor) return;
    emit(name, { slot, value: valor, libre: true });
    setTexto("");
    setEscribiendo(false);
  };

  return (
    <section className="space-y-3">
      <p className="text-base font-medium">{String(pregunta ?? "")}</p>
      <p className="text-xs text-muted">{String(porQuePregunto ?? "")}</p>

      <div className="flex flex-wrap gap-2">
        {!soloTexto &&
          items.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => emit(name, { slot, value: o.id, label: o.label })}
              className="rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-brand hover:bg-brand-soft"
            >
              {o.label}
            </button>
          ))}

        {libre && !escribiendo && (
          <button
            type="button"
            onClick={() => setEscribiendo(true)}
            className="rounded-full border border-dashed border-line px-4 py-2 text-sm text-muted transition-colors hover:border-brand hover:text-brand"
          >
            Otro…
          </button>
        )}
      </div>

      {libre && escribiendo && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") mandarTexto();
              if (e.key === "Escape") setEscribiendo(false);
            }}
            placeholder={soloTexto ? "Escribe tu respuesta" : "Dime con tus palabras que necesitas"}
            aria-label="Respuesta en tus palabras"
            className="flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={mandarTexto}
            disabled={!texto.trim()}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      )}

      {String(tipo) === "escala" && items.length === 0 && (
        // TODO(fase 5): control de escala. Mientras, el texto libre sirve.
        <p className="text-xs text-muted">Responde en tus palabras con el boton de arriba.</p>
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

type PlazoCalculado = {
  meses: number;
  cat: number;
  pagoMensual: number;
  costoTotal?: number;
  interesesTotales?: number;
};

/**
 * Simulador de reestructura.
 *
 * Cambiar de plazo NO vuelve al agente. Antes cada chip emitia un evento que
 * disparaba el ciclo completo —sesion MCP, razonamiento, planner, revalidacion—
 * y tardaba ~20 segundos en contestar algo que la tool ya habia calculado en el
 * primer turno. Ahora `simulate_restructure` manda los tres plazos de una vez
 * en `opciones` y el chip solo cambia cual se esta viendo: cero red.
 *
 * Los numeros siguen sin salir del modelo. Vienen calculados de la tool MCP,
 * que es justo lo que exige el catalogo; lo unico que vive aqui es cual de
 * ellos se muestra, que es estado de vista y no un dato.
 */
export function DebtSimulator({
  saldo,
  opciones,
  plazos,
  plazoSeleccionado,
  cat,
  pagoMensual,
}: WidgetProps) {
  const calculadas: PlazoCalculado[] = Array.isArray(opciones)
    ? (opciones as PlazoCalculado[]).filter((o) => typeof o?.meses === "number")
    : [];

  // Compatibilidad con planes viejos, que mandaban plazos/cat/pagoMensual
  // sueltos y un solo plazo calculado.
  const legado: PlazoCalculado[] =
    calculadas.length === 0 && Array.isArray(plazos)
      ? (plazos as number[]).map((m) => ({
          meses: m,
          cat: typeof cat === "number" && m === plazoSeleccionado ? cat : Number.NaN,
          pagoMensual:
            typeof pagoMensual === "number" && m === plazoSeleccionado ? pagoMensual : Number.NaN,
        }))
      : [];

  const lista = calculadas.length > 0 ? calculadas : legado;
  const inicial = typeof plazoSeleccionado === "number" ? plazoSeleccionado : lista[0]?.meses;

  const [elegido, setElegido] = useState<number | undefined>(inicial);

  // Si el agente regenera el widget con otro plazo, la vista lo sigue.
  useEffect(() => setElegido(inicial), [inicial]);

  const actual = lista.find((o) => o.meses === elegido) ?? lista[0];
  const numero = (n: number | undefined) => (typeof n === "number" && !Number.isNaN(n) ? n : undefined);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted">Saldo a reestructurar</p>
        <p className="tnum text-2xl font-semibold">{money(saldo)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {lista.map((o) => (
          <button
            key={o.meses}
            type="button"
            aria-pressed={o.meses === elegido}
            onClick={() => setElegido(o.meses)}
            className={`tnum rounded-full border px-4 py-2 text-sm transition-colors ${
              o.meses === elegido ? "border-brand bg-brand-soft font-medium" : "border-line"
            }`}
          >
            {o.meses} meses
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-8 border-t border-line pt-3">
        <Stat
          id="pago"
          emit={() => {}}
          label="Pago mensual"
          value={numero(actual?.pagoMensual) !== undefined ? money(actual?.pagoMensual) : "—"}
        />
        <Stat
          id="cat"
          emit={() => {}}
          label="CAT"
          value={numero(actual?.cat) !== undefined ? `${actual?.cat}%` : "—"}
        />
        {numero(actual?.costoTotal) !== undefined ? (
          <Stat id="total" emit={() => {}} label="Costo total" value={money(actual?.costoTotal)} />
        ) : null}
        {numero(actual?.interesesTotales) !== undefined ? (
          <Stat
            id="intereses"
            emit={() => {}}
            label="Intereses"
            value={money(actual?.interesesTotales)}
            tone="warning"
          />
        ) : null}
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

/* ---------------------------------------------------------------- */
/* Tarjetas de credito                                               */
/* ---------------------------------------------------------------- */

type FichaTarjeta = {
  id: string;
  nombre: string;
  imagen: string;
  bullets?: string[];
  cat?: number;
  anualidad?: number;
  fuente?: string;
  fechaVerificacion?: string;
};

/**
 * Vitrina de tarjetas.
 *
 * En reposo solo se ve el plastico. El detalle aparece al pasar el cursor,
 * igual que en el sitio de Banorte: la imagen sola se lee de un vistazo, y los
 * beneficios estorban cuando estas comparando doce productos.
 *
 * El hover es `group-hover` de CSS, no estado de React: sin re-render no hay
 * parpadeo, y en touch —donde no hay hover— el detalle queda visible siempre
 * gracias a la variante `max-lg:opacity-100`.
 */
export function CardShowcase({ titulo, tarjetas, emit, action }: WidgetProps) {
  const lista = Array.isArray(tarjetas) ? (tarjetas as FichaTarjeta[]) : [];
  const name =
    (action as { event?: { name?: string } } | undefined)?.event?.name ?? "card_selected";

  return (
    <section>
      <h3 className="text-base font-semibold text-ink">{String(titulo ?? "")}</h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((t) => (
          <article
            key={t.id}
            className="group relative overflow-hidden rounded-xl border border-line bg-surface p-4"
          >
            <img
              src={t.imagen}
              alt={t.nombre}
              loading="lazy"
              className="mx-auto h-28 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.03]"
            />

            <p className="mt-3 text-center text-sm font-semibold text-ink">{t.nombre}</p>

            {typeof t.cat === "number" && (
              <p className="mt-1 text-center text-xs text-muted">
                CAT promedio <span className="tnum font-medium text-ink">{t.cat}%</span>
                {typeof t.anualidad === "number" && (
                  <> · anualidad <span className="tnum font-medium text-ink">{money(t.anualidad)}</span></>
                )}
              </p>
            )}

            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-surface via-surface/95 to-transparent p-4 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 max-lg:pointer-events-auto max-lg:static max-lg:bg-none max-lg:p-0 max-lg:pt-3 max-lg:opacity-100">
              <ul className="space-y-1">
                {(t.bullets ?? []).map((b) => (
                  <li key={b} className="flex gap-2 text-xs leading-relaxed text-muted">
                    <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {b}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => emit(name, { cardId: t.id, nombre: t.nombre })}
                className="mt-3 self-start rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white"
              >
                Ver mas
              </button>

              {t.fuente && (
                <p className="mt-2 text-[10px] leading-tight text-muted">
                  Fuente oficial{t.fechaVerificacion ? ` · vigente al ${t.fechaVerificacion}` : ""}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Ranking en barras horizontales.
 *
 * Barras y no dona ni radar: la pregunta es "cual me conviene mas", que es una
 * comparacion de magnitudes en una sola dimension, y para eso la longitud es la
 * codificacion que el ojo compara mejor.
 */
export function CardRanking({ titulo, criterio, barras }: WidgetProps) {
  const lista = Array.isArray(barras)
    ? (barras as { id: string; nombre: string; puntaje: number; porQue?: string }[])
    : [];
  const tope = Math.max(100, ...lista.map((b) => Number(b.puntaje) || 0));

  return (
    <section>
      <h3 className="text-base font-semibold text-ink">{String(titulo ?? "")}</h3>
      {criterio ? <p className="mt-1 text-xs text-muted">{String(criterio)}</p> : null}

      <ol className="mt-4 space-y-3">
        {lista.map((b, i) => {
          const pct = Math.max(0, Math.min(100, (Number(b.puntaje) || 0) / tope * 100));
          return (
            <li key={b.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">
                  <span className="text-muted">{i + 1}.</span> {b.nombre}
                </span>
                <span className="tnum text-xs text-muted">{Math.round(Number(b.puntaje) || 0)}</span>
              </div>

              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-line">
                {/* El primer lugar va en rojo pleno; los otros en rojo suave,
                    para que el orden se lea sin tener que comparar longitudes. */}
                <div
                  className={i === 0 ? "h-full rounded-full bg-brand" : "h-full rounded-full bg-brand/40"}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {b.porQue ? <p className="mt-1 text-xs text-muted">{b.porQue}</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

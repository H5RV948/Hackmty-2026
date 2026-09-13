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
export function CardShowcase({ titulo, tarjetas, destacadaId, emit, action }: WidgetProps) {
  const lista = Array.isArray(tarjetas) ? (tarjetas as FichaTarjeta[]) : [];
  const name =
    (action as { event?: { name?: string } } | undefined)?.event?.name ?? "card_selected";

  /*
   * El detalle vive en un panel DEBAJO de la reja, no encima del plastico.
   *
   * Antes era una capa `absolute inset-0` que aparecia al pasar el cursor y
   * tapaba la tarjeta entera. Tres problemas: tapaba justo la imagen que el
   * usuario estaba mirando, obligaba a sostener el cursor para leer, y en una
   * pantalla tactil no hay "pasar el cursor" — o salia siempre puesta o no
   * salia nunca.
   *
   * Con el panel abajo, la reja no se mueve al elegir, el detalle siempre
   * aparece en el mismo sitio (el ojo ya sabe donde mirar) y funciona igual con
   * dedo que con raton. El canvas mide su alto solo, asi que la tarjeta del
   * tablero crece lo justo cuando el panel se abre.
   */
  const inicial = lista.find((t) => t.id === destacadaId)?.id ?? lista[0]?.id ?? null;
  const [abierta, setAbierta] = useState<string | null>(null);

  const detalle = lista.find((t) => t.id === (abierta ?? inicial)) ?? null;

  return (
    <section>
      <h3 className="text-base font-semibold text-ink">{String(titulo ?? "")}</h3>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {lista.map((t) => {
          // La destacada la elige la tool (recomendada:true), no el modelo.
          const destacada = destacadaId !== undefined && t.id === destacadaId;
          const seleccionada = detalle?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={seleccionada}
              onClick={() => setAbierta(t.id)}
              className={`relative overflow-hidden rounded-xl border bg-surface p-3 text-left transition-colors ${
                seleccionada
                  ? "border-brand ring-2 ring-brand/30"
                  : destacada
                    ? "border-brand/50 hover:border-brand"
                    : "border-line hover:border-brand"
              }`}
            >
              {destacada && (
                <span className="absolute left-0 top-0 z-10 rounded-br-lg bg-brand px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Te conviene
                </span>
              )}

              <img
                src={t.imagen}
                alt={t.nombre}
                loading="lazy"
                className="mx-auto h-24 w-auto object-contain"
              />

              <p className="mt-2 text-center text-xs font-semibold leading-tight text-ink">
                {t.nombre}
              </p>

              {typeof t.anualidad === "number" && (
                <p className="tnum mt-0.5 text-center text-[11px] text-muted">
                  {t.anualidad === 0 ? "Sin anualidad" : `Anualidad ${money(t.anualidad)}`}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {detalle && (
        <div className="mt-4 rounded-xl border border-line bg-brand-soft/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-ink">{detalle.nombre}</p>
            <p className="tnum text-xs text-muted">
              {typeof detalle.cat === "number" && (
                <>CAT promedio <span className="font-medium text-ink">{detalle.cat}%</span></>
              )}
              {typeof detalle.anualidad === "number" && (
                <> · anualidad <span className="font-medium text-ink">{money(detalle.anualidad)}</span></>
              )}
            </p>
          </div>

          {(detalle.bullets ?? []).length > 0 && (
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {(detalle.bullets ?? []).map((b) => (
                <li key={b} className="flex gap-2 text-xs leading-relaxed text-muted">
                  <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                  {b}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => emit(name, { cardId: detalle.id, nombre: detalle.nombre })}
              className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Analizar esta tarjeta para mi
            </button>
            {detalle.fuente && (
              <p className="text-[10px] leading-tight text-muted">
                Fuente oficial
                {detalle.fechaVerificacion ? ` · vigente al ${detalle.fechaVerificacion}` : ""}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function CardRanking({ titulo, criterio, barras, destacadaId }: WidgetProps) {
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
                  {destacadaId !== undefined && b.id === destacadaId && (
                    <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Recomendada
                    </span>
                  )}
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

/* ---------------------------------------------------------------- */
/* Riesgo                                                            */
/* ---------------------------------------------------------------- */

/**
 * Aviso de endeudamiento.
 *
 * El nivel NO lo decide el modelo: lo calcula `evaluarRiesgoDeuda` en el MCP a
 * partir de cifras del perfil (uso de linea, pagos atrasados, creditos
 * vencidos). Es la parte de la pantalla donde el banco asume una
 * responsabilidad, y no puede depender de que el modelo se sienta prudente ese
 * dia.
 *
 * En "alto" se pinta en rojo pleno y dice explicitamente que no conviene sacar
 * mas credito: es el unico lugar del producto donde el asesor desaconseja algo,
 * y tiene que leerse distinto a todo lo demas.
 */
export function RiskAlert({ nivel, titulo, mensaje, senales }: WidgetProps) {
  const lista = Array.isArray(senales) ? (senales as string[]) : [];
  const grado = String(nivel ?? "ok");

  const estilos: Record<string, { caja: string; icono: string; punto: string }> = {
    alto: {
      caja: "border-brand bg-brand-soft",
      icono: "bg-brand text-white",
      punto: "bg-brand",
    },
    precaucion: {
      caja: "border-warning/40 bg-warning/5",
      icono: "bg-warning text-white",
      punto: "bg-warning",
    },
    ok: {
      caja: "border-line bg-surface",
      icono: "bg-positive text-white",
      punto: "bg-positive",
    },
  };
  const estilo = estilos[grado] ?? estilos.ok;

  return (
    <section
      role={grado === "alto" ? "alert" : undefined}
      className={`flex gap-4 rounded-xl border p-4 ${estilo.caja}`}
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${estilo.icono}`}
      >
        {grado === "ok" ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 8v5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        )}
      </span>

      <div className="min-w-0">
        <h3 className={`text-base font-semibold ${grado === "alto" ? "text-brand" : "text-ink"}`}>
          {String(titulo ?? "")}
        </h3>
        <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
          {String(mensaje ?? "")}
        </p>

        {lista.length > 0 && (
          <ul className="mt-3 space-y-1">
            {lista.map((s) => (
              <li key={s} className="flex gap-2 text-xs leading-relaxed text-muted">
                <span aria-hidden className={`mt-[6px] h-1 w-1 shrink-0 rounded-full ${estilo.punto}`} />
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Fuera de alcance                                                  */
/* ---------------------------------------------------------------- */

type Sugerencia = { id: string; texto: string; porQue: string };

/**
 * Lo que ve quien escribio "hola" o pregunto por el clima.
 *
 * Es la unica pantalla del producto que se genera SIN pasar por el modelo: la
 * arma `scope.ts` en el servidor y viaja como A2UI normal (ver ahi el porque).
 * Para el canvas es un widget mas.
 *
 * Decision de tono: no es un error, es una puerta. Un "no entendi tu consulta"
 * a secas deja al usuario exactamente donde estaba —sin saber que preguntar—,
 * que es justo el problema que esta tarjeta existe para resolver. Por eso el
 * peso visual esta en las sugerencias y no en la negativa: la negativa es una
 * linea, las sugerencias son botones que se pican y arrancan la consulta.
 *
 * Cada sugerencia manda su texto TAL CUAL como si el usuario lo hubiera
 * tecleado (ver `page.tsx`), no un id que el agente tenga que interpretar. Asi
 * el historial de la sesion muestra una pregunta legible y no "capacidad 3".
 */
export function OutOfScopeCard({
  titulo,
  mensaje,
  sugerencias,
  consultaOriginal,
  emit,
  action,
}: WidgetProps) {
  const items = Array.isArray(sugerencias) ? (sugerencias as Sugerencia[]) : [];
  const name =
    (action as { event?: { name?: string } } | undefined)?.event?.name ?? "sugerencia_elegida";
  const original = typeof consultaOriginal === "string" ? consultaOriginal.trim() : "";

  return (
    <section className="space-y-4">
      <div className="flex gap-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.4" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>

        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{String(titulo ?? "")}</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            {String(mensaje ?? "")}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((s) => (
            <li key={s.id}>
              {/*
                h-full en el boton y no en el li: los botones de una fila del
                grid tienen alturas distintas segun cuanto mida su "porQue", y
                sin esto quedan desalineados por abajo.
              */}
              <button
                type="button"
                onClick={() => emit(name, { texto: s.texto, sugerenciaId: s.id })}
                className="h-full w-full rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <p className="text-sm font-medium text-ink">{s.texto}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{s.porQue}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Salida cuando el filtro se equivoco.
        El filtro de alcance es un puñado de expresiones regulares, no un
        clasificador: en algun momento va a rechazar una consulta legitima
        escrita con palabras que no previmos. Este boton es lo que hace que ese
        error cueste un clic en vez de dejar a alguien sin respuesta.
      */}
      {original && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={() => emit("consultar_de_todos_modos", { texto: original })}
            className="text-xs text-muted underline decoration-line underline-offset-4 transition-colors hover:text-brand"
          >
            Preguntarlo de todos modos
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Jerarquia visual del tablero: titular -> cartera -> siguiente paso */
/* ---------------------------------------------------------------- */

/**
 * NIVEL 1: la conclusion, en grande.
 *
 * Regla de producto que este widget existe para forzar: primero mostrar,
 * despues explicar. Antes el tablero abria con un parrafo de cuatro renglones
 * y la cifra importante aparecia a media tarjeta; el usuario tenia que LEER
 * para enterarse de algo que se entiende en un segundo si se pone grande.
 *
 * Por eso `veredicto` es una linea y no un campo de texto libre: si cupiera un
 * parrafo, acabaria habiendo un parrafo.
 */
export function HeadlineVerdict({ veredicto, dato, datoEtiqueta, tono = "neutral", indicador, apoyo }: WidgetProps) {
  const tonos: Record<string, { texto: string; barra: string; halo: string }> = {
    neutral: { texto: "text-ink", barra: "bg-ink", halo: "bg-line/60" },
    positive: { texto: "text-positive", barra: "bg-positive", halo: "bg-positive/10" },
    warning: { texto: "text-warning", barra: "bg-warning", halo: "bg-warning/10" },
    critical: { texto: "text-brand", barra: "bg-brand", halo: "bg-brand-soft" },
  };
  const t = tonos[String(tono)] ?? tonos.neutral;

  const medida = indicador as { valor?: number; etiqueta?: string } | undefined;
  const valor = typeof medida?.valor === "number" ? Math.max(0, Math.min(100, medida.valor)) : null;
  const contexto = Array.isArray(apoyo) ? (apoyo as { label: string; value: string }[]).slice(0, 3) : [];

  return (
    <section className="space-y-5">
      {/*
        gap y no justify-between: con la tarjeta a todo lo ancho, empujar el
        veredicto a la orilla derecha lo despegaba de su cifra y los dos se
        leian como dos cosas distintas. Juntos se leen como una sola frase.
      */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted">{String(datoEtiqueta ?? "")}</p>
          {/* La cifra manda: es lo unico a 48px de la pantalla. */}
          <p className={`tnum mt-1 text-5xl font-bold leading-none ${t.texto}`}>{String(dato ?? "")}</p>
        </div>
        <p className="max-w-[46ch] text-base font-medium leading-snug text-ink">
          {String(veredicto ?? "")}
        </p>
      </div>

      {valor !== null && (
        <div className="space-y-1.5">
          <div className={`h-2.5 w-full overflow-hidden rounded-full ${t.halo}`}>
            <div className={`h-full rounded-full ${t.barra}`} style={{ width: `${valor}%` }} />
          </div>
          {medida?.etiqueta && <p className="text-xs text-muted">{medida.etiqueta}</p>}
        </div>
      )}

      {contexto.length > 0 && (
        <div className="flex flex-wrap gap-x-10 gap-y-3 border-t border-line pt-4">
          {contexto.map((c) => (
            <div key={c.label}>
              <p className="text-xs text-muted">{c.label}</p>
              <p className="tnum text-lg font-semibold text-ink">{c.value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Iconos de la cartera. Cuatro familias, cuatro trazos simples. */
function IconoProducto({ familia }: { familia: string }) {
  const trazos: Record<string, ReactNode> = {
    cuenta: <path d="M3 8h18M3 8l9-4 9 4M5 8v9m14-9v9M3 17h18" strokeLinecap="round" strokeLinejoin="round" />,
    tarjeta: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></>,
    credito: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 10h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4" strokeLinecap="round" /></>,
    inversion: <path d="M4 17l5-5 3.5 3.5L20 8m0 0h-4.5M20 8v4.5" strokeLinecap="round" strokeLinejoin="round" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      {trazos[familia] ?? trazos.cuenta}
    </svg>
  );
}

type Producto = { id: string; tipo: string; familia: string; valor?: string; etiqueta?: string; nota?: string };

/**
 * NIVEL 2: que tiene contratado, de un vistazo.
 *
 * Mosaico y no lista: "que productos tengo" es una pregunta de panorama, y un
 * panorama se escanea, no se lee renglon por renglon.
 *
 * Los productos que NO tiene van abajo, apagados y sin cifra. Estan porque el
 * usuario tiene derecho a saber que existen, y NO como anzuelo: sin boton de
 * contratar, sin "te recomendamos", sin color de marca. Es informacion, no
 * venta (AGENTS.md, regla 7).
 */
export function ProductPortfolio({ titulo, productos, sinContratar, emit, action }: WidgetProps) {
  const items = Array.isArray(productos) ? (productos as Producto[]) : [];
  const faltantes = Array.isArray(sinContratar) ? (sinContratar as string[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => {
          const Contenedor = name ? "button" : "div";
          return (
            <li key={p.id}>
              <Contenedor
                {...(name
                  ? { type: "button" as const, onClick: () => emit(name, { productoId: p.id, tipo: p.tipo }) }
                  : {})}
                className={`h-full w-full rounded-xl border border-line bg-surface p-4 text-left ${
                  name ? "transition-colors hover:border-brand hover:bg-brand-soft" : ""
                }`}
              >
                <div className="flex items-center gap-2 text-muted">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <IconoProducto familia={String(p.familia)} />
                  </span>
                  <span className="text-sm font-medium text-ink">{p.tipo}</span>
                </div>

                {p.valor ? (
                  <>
                    <p className="tnum mt-3 text-2xl font-semibold text-ink">{p.valor}</p>
                    <p className="text-xs text-muted">{p.etiqueta ?? ""}</p>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-muted">Activo</p>
                )}

                {p.nota && <p className="mt-2 text-xs leading-relaxed text-muted">{p.nota}</p>}
              </Contenedor>
            </li>
          );
        })}
      </ul>

      {faltantes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-muted">No tienes:</span>
          {faltantes.map((f) => (
            <span key={f} className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted">
              {f}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * NIVEL 3: por donde seguir.
 *
 * Cada boton manda su propio texto como una consulta nueva —el mismo camino que
 * usa la tarjeta de fuera de alcance—, asi que el historial de la sesion
 * muestra una pregunta legible y no "paso 2".
 *
 * Sustituye a ActionPlan, que esta prohibido: la diferencia es que aqui no hay
 * nada que confirmar ni que contratar. Son preguntas, no compromisos.
 */
export function NextSteps({ titulo, pasos, emit, action }: WidgetProps) {
  const items = Array.isArray(pasos) ? (pasos as { id: string; texto: string }[]) : [];
  const name = (action as { event?: { name?: string } } | undefined)?.event?.name ?? "siguiente_paso";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">{String(titulo ?? "Y ahora, que sigue")}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => emit(name, { texto: p.texto, pasoId: p.id })}
            className="group inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-brand hover:bg-brand-soft"
          >
            {p.texto}
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="text-muted transition-colors group-hover:text-brand"
            >
              <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}

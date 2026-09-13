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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

/**
 * Ingreso contra gasto, mes por mes: barras agrupadas.
 *
 * Ojo con los datos: el seed de clientes NO trae una serie mensual, solo el
 * ingreso y el gasto de un mes tipico. Este widget dibuja lo que le den, pero
 * el planner no debe inventarle meses (ver su descripcion en el catalogo).
 */
export function CashflowChart({ titulo, serie }: WidgetProps) {
  const meses = Array.isArray(serie)
    ? (serie as { mes: string; ingreso: number; gasto: number }[]).filter(
        (m) => typeof m?.ingreso === "number" && typeof m?.gasto === "number",
      )
    : [];
  const tope = Math.max(1, ...meses.flatMap((m) => [m.ingreso, m.gasto]));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
        <Leyenda items={[["bg-positive", "Ingreso"], ["bg-brand", "Gasto"]]} />
      </div>
      {meses.length === 0 ? (
        <p className="text-xs text-muted">Sin datos para graficar.</p>
      ) : (
        <>
          <div className="flex h-44 items-end gap-3 border-b border-line">
            {meses.map((m) => (
              <div key={m.mes} className="flex h-full flex-1 items-end justify-center gap-1">
                <div
                  title={`Ingreso ${money(m.ingreso)}`}
                  className="w-1/3 max-w-[20px] rounded-t bg-positive"
                  style={{ height: `${(m.ingreso / tope) * 100}%` }}
                />
                <div
                  title={`Gasto ${money(m.gasto)}`}
                  className="w-1/3 max-w-[20px] rounded-t bg-brand"
                  style={{ height: `${(m.gasto / tope) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {meses.map((m) => (
              <p key={m.mes} className="flex-1 truncate text-center text-[11px] text-muted">
                {m.mes}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** A donde se va el dinero, por categoria: una dona con su leyenda. */
export function SpendingBreakdown({ titulo, categorias }: WidgetProps) {
  const items = Array.isArray(categorias)
    ? (categorias as { nombre: string; monto: number }[])
        .filter((c) => typeof c?.monto === "number" && c.monto > 0)
        .map((c) => ({ id: c.nombre, label: c.nombre, valor: c.monto }))
    : [];
  const total = items.reduce((a, c) => a + c.valor, 0);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Sin datos para graficar.</p>
      ) : (
        <Dona segmentos={items} unidad="$" centro={{ valor: money(total), etiqueta: "Total" }} />
      )}
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
      {/*
        La grafica es tambien el selector: picar una barra elige ese plazo.

        Cada barra es el costo total partido en dos: lo que ya debes (igual en
        todos los plazos) y los intereses encima. Asi se VE lo que en texto
        cuesta explicar: alargar el plazo baja la mensualidad pero la barra
        crece, porque pagas mas al final.
      */}
      {lista.length > 1 && lista.every((o) => numero(o.interesesTotales) !== undefined) && (
        <Barras
          barras={lista.map((o) => ({
            id: String(o.meses),
            label: `${o.meses} meses`,
            valor: Number(saldo),
            secundario: o.interesesTotales,
            pie: numero(o.pagoMensual) !== undefined ? `${money(o.pagoMensual)}/mes` : undefined,
          }))}
          unidad="$"
          leyenda={["Lo que debes", "Intereses"]}
          elegido={elegido !== undefined ? String(elegido) : undefined}
          onElegir={(id) => setElegido(Number(id))}
          alto="h-36"
        />
      )}

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
          <article key={o.id} className="rounded-xl bg-brand-soft/40 p-4">
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
   * Ventana flotante junto al cursor.
   *
   * Historia de este widget, para no repetirla:
   *  1. Capa superpuesta al pasar el cursor: tapaba la imagen que el usuario
   *     estaba mirando y en tactil no funcionaba.
   *  2. Panel debajo de la reja: no tapaba nada, pero con muchas tarjetas el
   *     detalle quedaba hasta el fondo y habia que elegir, bajar, leer y
   *     volver a subir para comparar la siguiente.
   *  3. (Esta) Ventana que sigue al cursor, al LADO de la tarjeta, nunca
   *     encima. Pasar de una tarjeta a otra es mover el mouse: no hay que
   *     hacer clic ni scroll para comparar.
   *
   * Va en un portal a document.body con posicion fija. Dentro del tablero la
   * cortaria el `overflow-hidden` de la tarjeta del canvas.
   *
   * Con dedo no hay "pasar el cursor": el primer toque abre la ventana fija
   * (con su boton) y el segundo toque sobre la misma tarjeta la analiza. Con
   * mouse la ventana ya esta abierta, asi que un clic la analiza directo.
   */
  const [globo, setGlobo] = useState<{
    id: string;
    x: number;
    y: number;
    fijo: boolean;
    izquierdaAncla?: number;
  } | null>(null);
  const globoRef = useRef<HTMLDivElement>(null);
  const [altoGlobo, setAltoGlobo] = useState(260);

  useEffect(() => {
    if (!globo) return;
    const alto = globoRef.current?.offsetHeight;
    if (alto && alto !== altoGlobo) setAltoGlobo(alto);
  }, [globo, altoGlobo]);

  const abierta = globo !== null;
  const fija = globo?.fijo === true;
  useEffect(() => {
    if (!abierta) return;
    const cerrar = () => setGlobo(null);
    const conTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    const fuera = (e: PointerEvent) => {
      if (!fija) return;
      const destino = e.target as HTMLElement;
      if (globoRef.current?.contains(destino)) return;
      if (destino.closest?.("[data-ficha-tarjeta]")) return;
      cerrar();
    };
    // Posicion fija: si algo hace scroll, la ventana se despegaria de su
    // tarjeta. Mejor cerrarla que dejarla flotando sobre otra cosa.
    window.addEventListener("keydown", conTecla);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("pointerdown", fuera);
    return () => {
      window.removeEventListener("keydown", conTecla);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("pointerdown", fuera);
    };
  }, [abierta, fija]);

  const ANCHO = 300;
  const posicion =
    globo && typeof window !== "undefined"
      ? (() => {
          const margen = 18;
          const noCabe = globo.x + margen + ANCHO > window.innerWidth - 8;
          const izquierda = noCabe
            ? (globo.izquierdaAncla ?? globo.x) - margen - ANCHO
            : globo.x + margen;
          const arriba = Math.min(globo.y + margen, window.innerHeight - altoGlobo - 8);
          return { left: Math.max(8, izquierda), top: Math.max(8, arriba) };
        })()
      : null;
  const ficha = globo ? lista.find((t) => t.id === globo.id) : undefined;

  const analizar = (t: FichaTarjeta) => {
    emit(name, { cardId: t.id, nombre: t.nombre });
    setGlobo(null);
  };

  return (
    <section>
      <h3 className="text-base font-semibold text-ink">{String(titulo ?? "")}</h3>
      <p className="mt-0.5 text-xs text-muted">
        Pasa el cursor sobre una tarjeta para ver sus detalles.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 xl:grid-cols-4">
        {lista.map((t) => {
          // La destacada la elige la tool (recomendada:true), no el modelo.
          const destacada = destacadaId !== undefined && t.id === destacadaId;
          const activa = globo?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-ficha-tarjeta
              aria-describedby={activa ? `ficha-${t.id}` : undefined}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse")
                  setGlobo({ id: t.id, x: e.clientX, y: e.clientY, fijo: false });
              }}
              onPointerMove={(e) => {
                if (e.pointerType !== "mouse") return;
                const { clientX, clientY } = e;
                setGlobo((g) => (g && g.id === t.id && !g.fijo ? { ...g, x: clientX, y: clientY } : g));
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setGlobo((g) => (g && !g.fijo ? null : g));
              }}
              onFocus={(e) => {
                // Solo foco de teclado: un toque tambien enfoca, y abrir aqui
                // haria que el primer toque analizara la tarjeta sin mostrarla.
                if (!e.currentTarget.matches(":focus-visible")) return;
                const r = e.currentTarget.getBoundingClientRect();
                setGlobo((g) =>
                  g?.id === t.id
                    ? g
                    : { id: t.id, x: r.right, y: r.top, fijo: false, izquierdaAncla: r.left },
                );
              }}
              onBlur={() => setGlobo((g) => (g && !g.fijo ? null : g))}
              onClick={(e) => {
                if (globo?.id === t.id) {
                  analizar(t);
                  return;
                }
                const r = e.currentTarget.getBoundingClientRect();
                setGlobo({ id: t.id, x: r.right, y: r.top, fijo: true, izquierdaAncla: r.left });
              }}
              className={`relative rounded-xl border bg-surface p-2 text-center transition-colors ${
                activa
                  ? "border-brand ring-2 ring-brand/30"
                  : destacada
                    ? "border-brand/50 hover:border-brand"
                    : "border-line hover:border-brand"
              }`}
            >
              {destacada && (
                <span className="absolute left-0 top-0 z-10 rounded-br-lg rounded-tl-xl bg-brand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                  Te conviene
                </span>
              )}
              <img src={t.imagen} alt={t.nombre} loading="lazy" className="mx-auto h-14 w-auto object-contain" />
              <p className="mt-1 truncate text-[11px] font-semibold text-ink">{t.nombre}</p>
            </button>
          );
        })}
      </div>

      {ficha &&
        posicion &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={globoRef}
            id={`ficha-${ficha.id}`}
            role="tooltip"
            style={{ left: posicion.left, top: posicion.top, width: ANCHO }}
            className={`fixed z-[70] rounded-2xl border border-line bg-surface p-4 shadow-[0_18px_48px_rgba(20,16,15,0.18)] ${
              fija ? "" : "pointer-events-none"
            }`}
          >
            <div className="flex items-center gap-3">
              <img src={ficha.imagen} alt="" className="h-12 w-auto shrink-0 object-contain" />
              <div className="min-w-0">
                {destacadaId === ficha.id && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    La que mas te conviene
                  </span>
                )}
                <p className="mt-1 text-sm font-semibold leading-tight text-ink">{ficha.nombre}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-brand-soft/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted">CAT promedio</p>
                <p className="tnum text-lg font-bold text-ink">
                  {typeof ficha.cat === "number" ? `${ficha.cat}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-brand-soft/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted">Anualidad</p>
                <p className="tnum text-lg font-bold text-ink">
                  {typeof ficha.anualidad !== "number"
                    ? "—"
                    : ficha.anualidad === 0
                      ? "Sin costo"
                      : money(ficha.anualidad)}
                </p>
              </div>
            </div>

            {(ficha.bullets ?? []).length > 0 && (
              <ul className="mt-3 space-y-1">
                {(ficha.bullets ?? []).slice(0, 4).map((b) => (
                  <li key={b} className="flex gap-2 text-xs leading-relaxed text-muted">
                    <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {fija ? (
              <button
                type="button"
                onClick={() => analizar(ficha)}
                className="mt-3 w-full rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Analizar esta tarjeta para mi
              </button>
            ) : (
              <p className="mt-3 text-[11px] font-medium text-brand">
                Haz clic en la tarjeta para analizarla para ti
              </p>
            )}

            {ficha.fuente && (
              <p className="mt-2 text-[10px] leading-tight text-muted">
                Fuente oficial{ficha.fechaVerificacion ? ` · vigente al ${ficha.fechaVerificacion}` : ""}
              </p>
            )}
          </div>,
          document.body,
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
                {/*
                  Todas las barras van en rojo pleno. La recomendada ya se
                  distingue por su sello, y la longitud dice el resto.

                  Antes las barras 2 a N usaban `bg-brand/40`, una clase que
                  Tailwind no generaba (ver los -rgb de globals.css): el div se
                  quedaba sin fondo y solo se veia la pista gris, como si esas
                  tarjetas tuvieran cero puntos.
                */}
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
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

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => {
          const Contenedor = name ? "button" : "div";
          return (
            <li key={p.id}>
              <Contenedor
                {...(name
                  ? { type: "button" as const, onClick: () => emit(name, { productoId: p.id, tipo: p.tipo }) }
                  : {})}
                className={`h-full w-full rounded-xl bg-brand-soft/40 p-4 text-left ${
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

/* ---------------------------------------------------------------- */
/* Graficas                                                          */
/* ---------------------------------------------------------------- */

/*
 * Todas las graficas son HTML y SVG a mano, sin libreria.
 *
 * No por purismo: instalar dependencias dentro del contenedor es de las cosas
 * que ya sabemos que rompen (AGENTS.md, seccion 8), y lo que hace falta aqui
 * —barras y donas— son veinte lineas cada una. Asi ademas heredan los tokens
 * de color y la tipografia sin pelearse con el tema de una libreria.
 */

function formatear(valor: number, unidad: unknown): string {
  if (!Number.isFinite(valor)) return "—";
  if (unidad === "$") return money(Math.round(valor));
  if (unidad === "%") return `${Math.round(valor * 10) / 10}%`;
  return valor.toLocaleString("es-MX");
}

function Leyenda({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map(([color, texto]) => (
        <span key={texto} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <span aria-hidden className={`h-2 w-2 rounded-sm ${color}`} />
          {texto}
        </span>
      ))}
    </div>
  );
}

type Barra = {
  id: string;
  label: string;
  valor: number;
  /** Segundo tramo apilado encima (intereses sobre capital, por ejemplo). */
  secundario?: number;
  destacado?: boolean;
  /** Linea chica bajo la etiqueta: "$1,186/mes". */
  pie?: string;
};

/**
 * Barras verticales, con tramo apilado opcional.
 *
 * Con `onElegir` cada columna es un boton y la grafica funciona como selector:
 * la elegida va en rojo pleno y las demas en rojo suave. Sin seleccion ni
 * destacada, todas van en rojo pleno.
 */
function Barras({
  barras,
  unidad,
  leyenda,
  elegido,
  onElegir,
  alto = "h-44",
}: {
  barras: Barra[];
  unidad?: unknown;
  leyenda?: [string, string?];
  elegido?: string;
  onElegir?: (id: string) => void;
  alto?: string;
}) {
  const lista = barras.filter((b) => Number.isFinite(b.valor));
  const tope = Math.max(1, ...lista.map((b) => b.valor + (b.secundario ?? 0)));
  const hayActivo = elegido !== undefined || lista.some((b) => b.destacado === true);
  const conSecundario = lista.some((b) => (b.secundario ?? 0) > 0);
  const esActivo = (b: Barra) => (elegido !== undefined ? b.id === elegido : b.destacado === true);

  return (
    <div className="space-y-2">
      {leyenda && conSecundario && (
        <Leyenda items={[["bg-brand", leyenda[0]], ["bg-warning", leyenda[1] ?? ""]]} />
      )}

      <div className={`flex ${alto} items-end gap-2 border-b border-line pt-5 sm:gap-3`}>
        {lista.map((b) => {
          const activo = esActivo(b);
          const total = b.valor + (b.secundario ?? 0);
          const Columna = onElegir ? "button" : "div";
          return (
            <Columna
              key={b.id}
              {...(onElegir
                ? { type: "button" as const, onClick: () => onElegir(b.id), "aria-pressed": activo }
                : {})}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div
                className="relative flex w-full max-w-[56px] flex-col"
                style={{ height: `${Math.max(2, (total / tope) * 100)}%` }}
              >
                <span
                  className={`tnum absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] ${
                    activo ? "font-semibold text-ink" : "text-muted"
                  }`}
                >
                  {formatear(total, unidad)}
                </span>
                {(b.secundario ?? 0) > 0 && (
                  <div
                    className="w-full rounded-t-md bg-warning"
                    style={{ height: `${((b.secundario ?? 0) / total) * 100}%` }}
                  />
                )}
                <div
                  className={`w-full flex-1 ${(b.secundario ?? 0) > 0 ? "" : "rounded-t-md"} ${
                    !hayActivo || activo ? "bg-brand" : "bg-brand/40"
                  } ${onElegir ? "transition-opacity group-hover:opacity-80" : ""}`}
                />
              </div>
            </Columna>
          );
        })}
      </div>

      <div className="flex gap-2 sm:gap-3">
        {lista.map((b) => (
          <div key={b.id} className="min-w-0 flex-1 text-center">
            <p className={`truncate text-[11px] ${esActivo(b) ? "font-semibold text-ink" : "text-muted"}`}>
              {b.label}
            </p>
            {b.pie && <p className="tnum truncate text-[10px] text-muted">{b.pie}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

const PALETA_DONA = [
  { svg: "var(--brand)", clase: "bg-brand" },
  { svg: "var(--warning)", clase: "bg-warning" },
  { svg: "var(--positive)", clase: "bg-positive" },
  { svg: "var(--ink)", clase: "bg-ink" },
  { svg: "var(--muted-soft)", clase: "bg-muted-soft" },
];

/** Dona con leyenda: partes de un todo, con su porcentaje y su monto. */
function Dona({
  segmentos,
  unidad,
  centro,
}: {
  segmentos: { id: string; label: string; valor: number }[];
  unidad?: unknown;
  centro?: { valor?: string; etiqueta?: string };
}) {
  const lista = segmentos.filter((sg) => Number.isFinite(sg.valor) && sg.valor > 0);
  const total = lista.reduce((a, sg) => a + sg.valor, 0);
  const radio = 40;
  const circunferencia = 2 * Math.PI * radio;

  let acumulado = 0;
  const arcos = lista.map((sg, i) => {
    const largo = total > 0 ? (sg.valor / total) * circunferencia : 0;
    // Un respiro entre tramos para que no se lean como una sola mancha.
    const hueco = lista.length > 1 ? Math.min(1.2, largo / 2) : 0;
    const arco = { id: sg.id, color: PALETA_DONA[i % PALETA_DONA.length].svg, largo: Math.max(0, largo - hueco), desde: acumulado };
    acumulado += largo;
    return arco;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={radio} fill="none" stroke="var(--line)" strokeWidth="13" />
          {arcos.map((a) => (
            <circle
              key={a.id}
              cx="50"
              cy="50"
              r={radio}
              fill="none"
              stroke={a.color}
              strokeWidth="13"
              strokeDasharray={`${a.largo} ${circunferencia}`}
              strokeDashoffset={-a.desde}
            />
          ))}
        </svg>
        {centro && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="tnum text-lg font-bold leading-none text-ink">{centro.valor}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">{centro.etiqueta}</p>
            </div>
          </div>
        )}
      </div>

      <ul className="min-w-[12rem] flex-1 space-y-2">
        {lista.map((sg, i) => (
          <li key={sg.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${PALETA_DONA[i % PALETA_DONA.length].clase}`} />
            <span className="min-w-0 flex-1 truncate text-ink">{sg.label}</span>
            <span className="tnum text-xs text-muted">{total > 0 ? Math.round((sg.valor / total) * 100) : 0}%</span>
            <span className="tnum w-24 text-right text-sm font-medium text-ink">{formatear(sg.valor, unidad)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Comparar cantidades lado a lado: CAT de varias tarjetas, mensualidad por
 * plazo, costo de cada opcion. Existe para que el planner deje de escribir
 * "la opcion A cuesta X y la B cuesta Y" en un parrafo.
 */
export function BarChart({ titulo, subtitulo, unidad, barras, leyenda }: WidgetProps) {
  const lista = Array.isArray(barras)
    ? (barras as Barra[]).filter((b) => typeof b?.valor === "number")
    : [];
  const nombres = Array.isArray(leyenda) ? (leyenda as string[]) : undefined;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
        {subtitulo ? <p className="mt-0.5 text-xs text-muted">{String(subtitulo)}</p> : null}
      </div>
      {lista.length === 0 ? (
        <p className="text-xs text-muted">Sin datos para graficar.</p>
      ) : (
        <Barras
          barras={lista}
          unidad={unidad ?? "$"}
          leyenda={nombres ? [nombres[0] ?? "", nombres[1]] : undefined}
        />
      )}
    </section>
  );
}

/** Partes de un todo: como se reparte el ingreso, que parte de la linea esta usada. */
export function DonutChart({ titulo, subtitulo, unidad, segmentos, centro }: WidgetProps) {
  const lista = Array.isArray(segmentos)
    ? (segmentos as { id: string; label: string; valor: number }[]).filter(
        (sg) => typeof sg?.valor === "number",
      )
    : [];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{String(titulo ?? "")}</h2>
        {subtitulo ? <p className="mt-0.5 text-xs text-muted">{String(subtitulo)}</p> : null}
      </div>
      {lista.length === 0 ? (
        <p className="text-xs text-muted">Sin datos para graficar.</p>
      ) : (
        <Dona
          segmentos={lista}
          unidad={unidad ?? "$"}
          centro={centro as { valor?: string; etiqueta?: string } | undefined}
        />
      )}
    </section>
  );
}

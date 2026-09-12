"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { A2UIMessage, ClientEvent } from "@banorte/a2ui";
import { ModularCanvas } from "@/components/ModularCanvas";
import { SpotlightController } from "@/components/guidance/SpotlightController";
import { useCanvas } from "@/lib/surfaceStore";

/** Puntos de informacion del hero. Estaticos: no navegan a ningun lado. */
const PUNTOS = [
  {
    titulo: "Tarjetas",
    detalle:
      "Conoce tus opciones, revisa tus limites y descubre los beneficios que tenemos para ti.",
  },
  {
    titulo: "Creditos",
    detalle: "Encuentra el credito que se adapta a tus metas: auto, hipotecario, nomina o personal.",
  },
  {
    titulo: "Prestamos",
    detalle: "Haz realidad tus proyectos con opciones flexibles y tasas competitivas.",
  },
];

export default function Home() {
  const { state, applyMessage, setLayout, dismissGuidance } = useCanvas();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  /**
   * Boton de la pantalla generada que disparo la consulta en curso.
   *
   * Cuando la consulta nace de un boton, la senial de carga va DENTRO de ese
   * boton: la barra del prompt queda arriba, fuera de vista, y su anillo no le
   * sirve de nada a quien acaba de picar algo abajo.
   */
  const [componenteOcupado, setComponenteOcupado] = useState<string | null>(null);

  const hayPantalla = state.order.length > 0;

  /**
   * Al terminar de generar, la pantalla baja sola hasta el canvas.
   *
   * Sin esto el usuario se queda mirando el hero sin enterarse de que ya hay
   * resultados mas abajo. Solo se dispara en la transicion de "pensando" a
   * "listo": si corriera en cada render, cualquier updateDataModel posterior
   * arrastraria la vista mientras el usuario esta leyendo.
   */
  const canvasRef = useRef<HTMLDivElement>(null);
  const estabaPensando = useRef(false);

  /**
   * Medida real de la barra, para dibujar el anillo de carga sin deformarlo.
   *
   * El intento anterior estiraba un SVG cuadrado a la forma de la pildora. Eso
   * deforma el patron del trazo: en vez de un arco recorriendo el contorno se
   * veian varios segmentos sueltos parpadeando. Con el tamanio real el
   * contorno se dibuja a escala 1:1 y el trazo recorre limpio.
   */
  const barraRef = useRef<HTMLDivElement>(null);
  const [barra, setBarra] = useState({ ancho: 0, alto: 0 });

  useEffect(() => {
    const el = barraRef.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      setBarra({ ancho: width, alto: height });
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (estabaPensando.current && !thinking && hayPantalla) {
      canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    estabaPensando.current = thinking;
  }, [thinking, hayPantalla]);

  /** Manda contexto al agente y aplica los mensajes A2UI que regresan. */
  const send = useCallback(
    async (event: ClientEvent) => {
      setThinking(true);
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, surfaces: Object.keys(state.surfaces) }),
        });
        if (!response.body) return;

        // Stream de mensajes A2UI, uno por linea (NDJSON).
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            applyMessage(JSON.parse(line) as A2UIMessage);
          }
        }
      } finally {
        setThinking(false);
        setComponenteOcupado(null);
      }
    },
    [applyMessage, state.surfaces],
  );

  const onEvent = useCallback(
    (event: ClientEvent) => {
      // El reacomodo del canvas no debe disparar una regeneracion de UI.
      if (event.type === "canvas_layout_changed") return;
      if (event.type === "ui_action") setComponenteOcupado(event.componentId);
      void send(event);
    },
    [send],
  );

  const preguntar = useCallback(() => {
    const texto = input.trim();
    if (!texto || thinking) return;
    setComponenteOcupado(null); // la senial vuelve a la barra
    void send({ type: "user_message", text: texto });
    setInput("");
  }, [input, thinking, send]);

  return (
    <main className="min-h-screen">
      {/* Filete superior: detalle de marca, no navega a ningun lado. */}
      <div aria-hidden className="h-1 w-full bg-brand" />

      {/* ---------------------------------------------------------------- */}
      {/* Hero: titular a la izquierda, imagen a la derecha                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative flex min-h-[88vh] items-center overflow-hidden bg-white">
        {/*
          La grafica del hero ya trae compuesta la forma blanca, el circulo rojo
          y la persona. Vive en apps/web/public/hero-banner.png — para cambiarla,
          reemplaza ese archivo con el mismo nombre.

          Se usa object-contain y no object-cover a proposito: con cover, en
          cuanto la ventana no coincide con la proporcion de la grafica se le
          corta la cabeza a la persona. Con contain siempre se ve completa, y
          como el fondo de la imagen es blanco igual que el de la seccion, el
          espacio sobrante no se distingue.
        */}
        <img
          src="/hero-banner.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{ objectPosition: "center" }}
        />

        {/* Velo solo en pantallas angostas, donde el texto cae sobre la grafica. */}
        <div aria-hidden className="absolute inset-0 bg-white/80 lg:hidden" />

        <div className="relative mx-auto w-full max-w-6xl px-6">
          <div className="max-w-[30rem]">
            <p className="text-sm font-medium text-brand">Tu asesor financiero</p>

            <h1 className="mt-4 text-4xl font-bold leading-[1.12] tracking-tight text-ink sm:text-5xl">
              Hay una decision
              <br />
              distinta para cada
              <br />
              momento de tu vida
            </h1>

            <p className="mt-6 max-w-[38ch] text-base leading-relaxed text-muted">
              Cuentame que quieres resolver y armo contigo la pantalla que lo explica, con tus
              numeros y sus costos a la vista.
            </p>

            <a
              href="#consultar"
              className="mt-8 inline-block rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white"
            >
              Empezar
            </a>
          </div>
        </div>

        <a
          href="#consultar"
          aria-label="Ir a la consulta"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted transition-opacity hover:opacity-60"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Barra del agente + puntos de informacion                          */}
      {/* ---------------------------------------------------------------- */}
      <section id="consultar" className="mx-auto max-w-6xl px-6 pt-14">
        <div ref={barraRef} className="relative rounded-full">
          <div className="relative flex items-center gap-3 rounded-full border border-line bg-surface px-3 py-2 shadow-[0_6px_24px_rgba(20,16,15,0.08)]">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5zM19 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9L19 15z" />
            </svg>
          </span>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") preguntar();
            }}
            placeholder="Que informacion te gustaria consultar hoy?"
            aria-label="Escribe lo que quieres resolver"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />

          <button
            type="button"
            onClick={preguntar}
            disabled={!input.trim() || thinking}
            aria-label={thinking ? "Analizando" : "Preguntar"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition-opacity disabled:opacity-40"
          >
            {thinking ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            </button>
          </div>

          {/*
            Anillo de carga: un arco rojo recorre el contorno de la barra
            mientras el agente trabaja.

            Va DESPUES de la pildora y desplazado 3px hacia afuera. Antes
            estaba antes y justo sobre el borde, asi que el fondo opaco de la
            barra lo tapaba entero y no se veia nada.

            El SVG se dibuja con la medida real de la barra (ver barraRef), sin
            estirar: estirarlo rompe el patron del trazo y en vez de un arco
            salen segmentos sueltos. pathLength="100" deja el arco en 22% del
            perimetro sin importar cuanto mida la barra.

            El respeto a prefers-reduced-motion ya esta en globals.css.
          */}
          {thinking && !componenteOcupado && barra.ancho > 0 && (
            <svg
              aria-hidden
              width={barra.ancho + 6}
              height={barra.alto + 6}
              viewBox={`0 0 ${barra.ancho + 6} ${barra.alto + 6}`}
              className="pointer-events-none absolute -left-[3px] -top-[3px] z-10"
            >
              <rect
                x="1"
                y="1"
                width={barra.ancho + 4}
                height={barra.alto + 4}
                rx={(barra.alto + 4) / 2}
                pathLength="100"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="2"
                strokeLinecap="round"
                className="anillo-trazo"
              />
            </svg>
          )}
        </div>

        {/* Los puntos de info son el estado vacio: sobran en cuanto hay pantalla. */}
        {!hayPantalla && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PUNTOS.map((punto) => (
              <article key={punto.titulo} className="rounded-xl border border-line bg-surface p-5">
                <span aria-hidden className="block h-[3px] w-8 bg-brand" />
                <h2 className="mt-4 text-sm font-semibold text-ink">{punto.titulo}</h2>
                <p className="mt-2 text-xs leading-relaxed text-muted">{punto.detalle}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Canvas generado por el agente                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div ref={canvasRef} aria-hidden className="scroll-mt-6" />
        {hayPantalla ? (
          <ModularCanvas
            surfaces={state.surfaces}
            order={state.order}
            layout={state.layout}
            editable={state.layoutEditable && !tourActive}
            busyId={thinking ? componenteOcupado : null}
            onEvent={onEvent}
            onLayoutChange={setLayout}
          />
        ) : (
          <p className="text-center text-sm text-muted">
            {thinking
              ? "Analizando tu situacion y armando la pantalla."
              : "Escribe arriba lo que quieres resolver y el asesor arma la pantalla."}
          </p>
        )}
      </section>

      <SpotlightController
        steps={state.guidance?.steps ?? null}
        trigger={state.guidance?.trigger}
        onStart={() => setTourActive(true)}
        onFinish={() => {
          setTourActive(false);
          dismissGuidance();
        }}
      />
    </main>
  );
}

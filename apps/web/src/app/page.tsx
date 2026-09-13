"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { A2UIMessage, ClientEvent } from "@banorte/a2ui";
import { ModularCanvas } from "@/components/ModularCanvas";
import { PromptBar } from "@/components/PromptBar";
import { SpotlightController } from "@/components/guidance/SpotlightController";
import { useCanvas } from "@/lib/surfaceStore";

/** Un turno del usuario: lo que escribio o lo que pico en la pantalla generada. */
type Turno = {
  id: number;
  tipo: "pregunta" | "interaccion";
  texto: string;
};

/**
 * Pasa un evento de UI a algo legible para el historial.
 *
 * Los nombres del catalogo vienen en snake_case ("opportunity_selected"), que
 * sirve para el agente pero no para una lista que lee una persona.
 */
function describirAccion(name: string, payload?: Record<string, unknown>): string {
  const accion = name.replace(/_/g, " ");
  const valores = Object.values(payload ?? {})
    .filter((v) => typeof v === "string" || typeof v === "number")
    .join(", ");
  return valores ? `${accion}: ${valores}` : accion;
}

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

  /**
   * Modo consulta: la barra se acopla arriba y el tablero se abre sobre el hero.
   *
   * Se enciende al mandar la primera pregunta y ya no se apaga. El hero es la
   * puerta de entrada; una vez adentro, volver a el no aporta nada y si obliga
   * a bajar otra vez para seguir trabajando.
   */
  const [modoConsulta, setModoConsulta] = useState(false);

  /**
   * Historial de lo que ha hecho el usuario en esta sesion.
   *
   * Hace falta porque la barra se vacia en cuanto arranca la transicion: sin
   * esto, a los dos turnos ya nadie se acuerda de que pregunto ni en que orden,
   * y el tablero se queda sin el hilo que lo explica.
   *
   * Se guardan los dos tipos de turno, no solo lo tecleado. Picar un widget
   * generado tambien es hablarle al agente — es literalmente el ciclo
   * adaptativo del reto — y si solo apareciera lo escrito, el historial diria
   * que el usuario pregunto una vez y la pantalla cambio sola tres veces.
   */
  const [historial, setHistorial] = useState<Turno[]>([]);
  const turnoId = useRef(0);

  const anotarTurno = useCallback((tipo: Turno["tipo"], texto: string) => {
    turnoId.current += 1;
    setHistorial((previo) => [...previo, { id: turnoId.current, tipo, texto }]);
  }, []);

  const hayPantalla = state.order.length > 0;

  /** Al acoplarse, el foco sigue a la barra de arriba para encadenar preguntas. */
  const inputAcopladoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modoConsulta) return;
    // Un respiro para que la barra termine de abrirse antes de pedir el foco.
    const t = setTimeout(() => inputAcopladoRef.current?.focus({ preventScroll: true }), 650);
    return () => clearTimeout(t);
  }, [modoConsulta]);

  /**
   * Con el tablero como capa fija, el scroll del documento de atras estorba:
   * se ven dos barras de scroll y la rueda a veces mueve el hero difuminado.
   */
  useEffect(() => {
    if (!modoConsulta) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [modoConsulta]);

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
      if (event.type === "ui_action") {
        setComponenteOcupado(event.componentId);
        anotarTurno("interaccion", describirAccion(event.name, event.payload));
      }
      void send(event);
    },
    [send, anotarTurno],
  );

  const preguntar = useCallback(() => {
    const texto = input.trim();
    if (!texto || thinking) return;
    setComponenteOcupado(null); // la senial vuelve a la barra
    setModoConsulta(true);
    anotarTurno("pregunta", texto);
    void send({ type: "user_message", text: texto });
    // Se vacia junto con el arranque de la transicion, no al terminar: la
    // pregunta ya quedo en el historial, dejarla en el campo solo invita a
    // mandarla dos veces.
    setInput("");
  }, [input, thinking, send, anotarTurno]);

  return (
    <main className="min-h-screen">
      {/* ---------------------------------------------------------------- */}
      {/* Capa de fondo: el hero. Se difumina al entrar en modo consulta.    */}
      {/* ---------------------------------------------------------------- */}
      {/*
        El blur va en este contenedor y no en el <img>: asi se difuminan
        tambien el titular y el parrafo, que es lo que hace que el tablero de
        encima se lea. El scale-105 tapa el borde translucido que deja el
        filtro — sin el se ve una franja clara en las orillas.

        Ojo si alguien mueve cosas aqui: `filter` crea bloque contenedor para
        los descendientes `fixed`. Por eso la barra acoplada y el tablero son
        HERMANOS de esta capa y no hijos; metidos aqui dentro se posicionarian
        respecto a ella y el efecto se cae.
      */}
      <div
        aria-hidden={modoConsulta}
        className={`transition-all duration-700 ease-out ${
          modoConsulta ? "pointer-events-none scale-105 blur-lg" : ""
        }`}
      >
        {/* Filete superior: detalle de marca, no navega a ningun lado. */}
        <div aria-hidden className="h-1 w-full bg-brand" />

        {/* -------------------------------------------------------------- */}
        {/* Hero: titular a la izquierda, imagen a la derecha               */}
        {/* -------------------------------------------------------------- */}
        <section className="relative flex min-h-[88vh] items-center overflow-hidden bg-white">
          {/*
            La grafica del hero ya trae compuesta la forma blanca, el circulo
            rojo y la persona. Vive en apps/web/public/hero-banner.png — para
            cambiarla, reemplaza ese archivo con el mismo nombre.

            object-cover, no object-contain: la grafica es 16:9 y el encabezado
            es mas apaisado que eso, asi que contain la dejaba encajada al
            centro con franjas blancas a los lados. Con cover llena el ancho
            completo y no queda ningun hueco.

            objectPosition y=30% en vez de center: el PNG trae relleno blanco
            propio, poco arriba (~6% del alto) y bastante abajo (~25%). Anclar
            el encuadre hacia arriba tira ese relleno inferior fuera de cuadro
            y deja a la persona completa; con "center" el recorte se reparte
            parejo y reaparece el blanco debajo de ella.
          */}
          <img
            src="/hero-banner.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center 30%" }}
          />

          {/* Velo solo en pantallas angostas, donde el texto cae sobre la grafica. */}
          <div aria-hidden className="absolute inset-0 bg-white/80 lg:hidden" />

          {/*
            El bloque va pegado a la izquierda, no centrado en un max-w-6xl.

            Con el contenedor centrado, en un monitor ancho el texto arrancaba
            como a un 17% del viewport: se despegaba del borde y se metia hacia
            el centro, donde la forma blanca de la grafica ya esta cediendo el
            paso al circulo rojo. Anclado con padding izquierdo se queda dentro
            de la zona blanca, que es la que el PNG reserva justo para esto.
          */}
          <div className="relative w-full px-6 sm:px-10 lg:px-24">
            {/*
              La columna mide 34rem y no 30rem: con Montserrat, el titular a
              text-5xl no alcanzaba a meter "momento de tu vida" en su renglon
              y "vida" caia sola en una cuarta linea. Los <br /> marcan el ritmo
              de tres lineas del disenio; el ancho es lo que los deja cumplirse.
            */}
            <div className="max-w-[34rem]">
              <p className="text-sm font-medium text-brand">Tu asesor financiero</p>

              <h1 className="mt-4 text-4xl font-bold leading-[1.12] tracking-tight text-ink sm:text-5xl">
                Hay una decision
                <br />
                distinta para cada
                <br />
                momento de tu vida
              </h1>

              <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-muted">
                Cuentame que quieres resolver y armo contigo la pantalla que lo explica, con tus
                numeros y sus costos a la vista.
              </p>

              {/*
                Salida de la barra: se encoge hacia su propio centro (scale-x-0
                con origen al centro) mientras se difumina. Es la mitad del
                movimiento; la otra mitad la hace la barra acoplada al abrirse.
                Dura menos que la entrada de arriba y sin retraso, para que el
                relevo se sienta encadenado y no simultaneo.
              */}
              <div
                className={`mt-10 origin-center transition-all duration-300 ease-in ${
                  modoConsulta
                    ? "pointer-events-none scale-x-0 opacity-0 blur-[2px]"
                    : "scale-x-100 opacity-100"
                }`}
              >
                <PromptBar
                  value={input}
                  onChange={setInput}
                  onSubmit={preguntar}
                  thinking={thinking}
                  showRing={!modoConsulta && thinking && !componenteOcupado}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Velo: separa el tablero del hero difuminado                       */}
      {/* ---------------------------------------------------------------- */}
      <div
        aria-hidden
        className={`fixed inset-0 z-30 bg-[#faf8f8]/75 transition-opacity duration-700 ${
          modoConsulta ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Tablero generado, sobre el hero                                   */}
      {/* ---------------------------------------------------------------- */}
      <div
        className={`fixed inset-0 z-40 overflow-y-auto px-6 pb-16 pt-28 transition-opacity duration-500 ${
          modoConsulta ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-auto max-w-6xl">
          {/*
            Historial de la sesion. Va arriba del tablero porque es el hilo que
            lo explica: sin el, una pantalla que cambio tres veces no dice por
            que cambio.

            max-h con scroll propio: a los diez turnos esto empuja el tablero
            fuera de vista, y lo que el usuario vino a ver es el tablero.
          */}
          {historial.length > 0 && (
            <section
              aria-label="Historial de la conversacion"
              className="mb-6 max-h-44 overflow-y-auto rounded-2xl border border-line bg-surface/80 px-5 py-4 backdrop-blur"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Tu conversacion
              </h2>
              <ol className="mt-3 space-y-2">
                {historial.map((turno, index) => {
                  const actual = index === historial.length - 1;
                  return (
                    <li key={turno.id} className="flex gap-3 text-sm">
                      <span
                        aria-hidden
                        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                          turno.tipo === "pregunta" ? "bg-brand" : "bg-line"
                        }`}
                      />
                      <span
                        className={
                          turno.tipo === "pregunta"
                            ? `${actual ? "font-medium text-ink" : "text-ink"}`
                            : "text-xs leading-6 text-muted"
                        }
                      >
                        {turno.texto}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

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
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Barra acoplada arriba                                             */}
      {/* ---------------------------------------------------------------- */}
      {/*
        Va por encima del tablero (z-50) para que no se la coman los widgets al
        hacer scroll. Dos transiciones montadas: el contenedor baja y aparece,
        y la pildora de adentro se abre desde su centro hacia las orillas. El
        retraso de 250ms es lo que deja que la barra del hero termine de
        encogerse antes: sin el, las dos se mueven a la vez y se lee como dos
        barras, no como una que viajo.
      */}
      <div
        className={`fixed inset-x-0 top-0 z-50 px-6 pt-6 transition-all duration-500 ease-out ${
          modoConsulta ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        }`}
        style={{ transitionDelay: modoConsulta ? "250ms" : "0ms" }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          {/*
            Volver al hero. El tablero y el historial NO se borran: se vuelve a
            la portada, no se tira la sesion. Si el usuario pregunta otra vez,
            se reabre con todo lo que ya habia.

            Entra despues que la barra (delay-700) para no competir con ella
            durante el relevo.
          */}
          <button
            type="button"
            onClick={() => setModoConsulta(false)}
            aria-label="Volver al inicio"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_6px_24px_rgba(20,16,15,0.12)] transition-opacity duration-300 ${
              modoConsulta ? "opacity-100 delay-700" : "pointer-events-none opacity-0"
            }`}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H6M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div
            className={`flex-1 origin-center transition-transform duration-500 ease-out ${
              modoConsulta ? "scale-x-100" : "scale-x-0"
            }`}
            style={{ transitionDelay: modoConsulta ? "250ms" : "0ms" }}
          >
            <PromptBar
              value={input}
              onChange={setInput}
              onSubmit={preguntar}
              thinking={thinking}
              showRing={modoConsulta && thinking && !componenteOcupado}
              inputRef={inputAcopladoRef}
            />
          </div>
        </div>
      </div>

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

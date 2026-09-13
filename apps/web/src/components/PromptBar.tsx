"use client";

/**
 * Barra del prompt.
 *
 * Se monta DOS veces: una dentro del hero y otra acoplada arriba. No es un
 * descuido. Para que la barra "viaje" del hero a la cabecera habria que medir
 * dos posiciones y animar entre ellas (FLIP), y eso se rompe en cuanto cambia
 * el ancho de la ventana a media transicion. Con dos instancias, una se encoge
 * hacia su centro y la otra se abre desde el suyo: el ojo lo lee como un solo
 * movimiento y el layout de cada una la resuelve su propio contenedor.
 *
 * El estado vive arriba (`value`), asi que las dos instancias muestran siempre
 * lo mismo y da igual cual este visible.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  thinking: boolean;
  /**
   * El anillo de carga solo se dibuja en la instancia visible. Si se dibujara
   * en las dos, la que esta colapsada lo pintaria aplastado en el centro.
   */
  showRing: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function PromptBar({ value, onChange, onSubmit, thinking, showRing, inputRef }: Props) {
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

  return (
    <div ref={barraRef} className="relative rounded-full">
      <div className="relative flex items-center gap-3 rounded-full border border-line bg-surface py-2 pl-6 pr-2 shadow-[0_6px_24px_rgba(20,16,15,0.08)]">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="Que informacion te gustaria consultar hoy?"
          aria-label="Escribe lo que quieres resolver"
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || thinking}
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
        Anillo de carga: un arco rojo recorre el contorno de la barra mientras
        el agente trabaja.

        Va DESPUES de la pildora y desplazado 3px hacia afuera. Antes estaba
        antes y justo sobre el borde, asi que el fondo opaco de la barra lo
        tapaba entero y no se veia nada.

        El SVG se dibuja con la medida real de la barra (ver barraRef), sin
        estirar: estirarlo rompe el patron del trazo y en vez de un arco salen
        segmentos sueltos. pathLength="100" deja el arco en 22% del perimetro
        sin importar cuanto mida la barra.

        El respeto a prefers-reduced-motion ya esta en globals.css.
      */}
      {showRing && barra.ancho > 0 && (
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
  );
}

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
 *
 * Tambien vive aqui el autocompletado fantasma (ver mas abajo): las dos
 * instancias lo calculan del mismo `value`, asi que proponen lo mismo.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { completaciones, restanteDe } from "@/lib/suggestions";

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

  /*
   * Autocompletado fantasma.
   *
   * Por que de frase completa y no de palabra: el problema del usuario no es
   * teclear rapido, es no saber que se le puede preguntar a esto. Completar
   * "tarj" -> "tarjeta" no le ensena nada; completar a "Quiero pagar menos
   * intereses de mi tarjeta de credito" le ensena el tipo de consulta que este
   * asesor sabe convertir en un tablero.
   *
   * Por que en gris dentro del campo y no en una lista desplegable: la barra
   * vive sobre el tablero y es la misma que se acopla arriba; un panel colgando
   * taparia justo los widgets que el usuario esta leyendo para decidir su
   * siguiente pregunta.
   *
   * Solo empata por PREFIJO (ver `completaciones`). Un empate a media frase no
   * se puede pintar alineado, y una sugerencia descuadrada se lee como un bug.
   */
  const opciones = useMemo(() => completaciones(value), [value]);
  const [indice, setIndice] = useState(0);

  // Al cambiar lo tecleado la lista es otra: quedarse en el indice viejo
  // apuntaria a una frase que ya no tiene que ver con lo que se escribio.
  useEffect(() => setIndice(0), [value]);

  const frase = opciones.length > 0 ? opciones[indice % opciones.length] : null;
  const restante = frase ? restanteDe(value, frase) : "";

  /**
   * Aceptar reemplaza el campo con la frase COMPLETA, no concatena el gris.
   *
   * Asi la consulta enviada queda siempre igual a una de las frases del banco,
   * sin importar como venia escrito lo tecleado (acentos, espacio doble,
   * mayusculas). Concatenar dejaba cosas como "Cuánto me ahorro si..." con
   * medio texto en un estilo y medio en otro.
   */
  const aceptar = () => {
    if (!frase) return;
    onChange(frase);
    setIndice(0);
  };

  return (
    <div ref={barraRef} className="relative rounded-full">
      <div className="relative flex items-center gap-3 rounded-full border border-line bg-surface py-2 pl-6 pr-2 shadow-[0_6px_24px_rgba(20,16,15,0.08)]">
        <div className="relative min-w-0 flex-1">
          {/*
            La capa del fantasma se dibuja DEBAJO del input, no dentro.

            El truco es que repite lo ya tecleado en `invisible` (ocupa su
            espacio pero no se ve) y solo pinta en gris lo que falta: asi el
            gris arranca exactamente donde termina el texto real, sin medir
            nada. Depende de que las dos capas tengan la misma tipografia y el
            mismo padding — el preflight de Tailwind deja el input en padding
            cero, que es lo que hace que cuadre.

            overflow-hidden porque cuando el texto pasa del ancho, el input
            hace scroll horizontal y esta capa no: sin recortar, el gris se
            saldria por debajo del boton de enviar.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-sm"
          >
            <span className="invisible">{value}</span>
            <span className="text-muted-soft">{restante}</span>
          </div>

          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit();
                return;
              }
              if (!frase) return;

              // Tab: el gesto estandar para aceptar una sugerencia en linea.
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                aceptar();
                return;
              }

              /*
               * Flecha derecha solo con el cursor AL FINAL y sin seleccion: si
               * no, aceptar la frase le robaria al usuario el movimiento normal
               * del cursor cuando esta corrigiendo algo a media linea.
               */
              if (e.key === "ArrowRight") {
                const el = e.currentTarget;
                const alFinal =
                  el.selectionStart === value.length && el.selectionEnd === value.length;
                if (alFinal) {
                  e.preventDefault();
                  aceptar();
                }
                return;
              }

              // Con varias frases posibles, las flechas verticales las recorren.
              if ((e.key === "ArrowDown" || e.key === "ArrowUp") && opciones.length > 1) {
                e.preventDefault();
                const paso = e.key === "ArrowDown" ? 1 : -1;
                setIndice((i) => (i + paso + opciones.length) % opciones.length);
              }
            }}
            placeholder="Que informacion te gustaria consultar hoy?"
            aria-label="Escribe lo que quieres resolver"
            className="relative w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        {/*
          Pista de teclado. Aparece solo cuando hay algo que aceptar, porque un
          indicador permanente en una barra tan limpia se lee como ruido.

          Se esconde en pantallas angostas: ahi no hay teclado fisico que
          apretar y el espacio lo necesita el texto.
        */}
        {frase && (
          <span
            aria-hidden
            className="hidden shrink-0 items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] uppercase tracking-wide text-muted sm:flex"
          >
            Tab
            {opciones.length > 1 && <span className="text-muted-soft">· ↑↓ {opciones.length}</span>}
          </span>
        )}

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

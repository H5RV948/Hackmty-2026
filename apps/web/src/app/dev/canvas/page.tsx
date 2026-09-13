"use client";

/**
 * Banco de pruebas del acomodo del canvas.
 *
 * `/dev/gallery` dibuja cada widget suelto, asi que no sirve para lo unico que
 * importa aqui: como quedan REPARTIDOS entre si. Esta pagina monta el
 * ModularCanvas de verdad con tableros fijos, para poder mirar el resultado sin
 * gastar una consulta al agente ni depender de que hoy toque cierto cliente.
 *
 * Los tres casos son los que rompian antes: alturas muy distintas en la misma
 * fila, un widget de media fila que se queda solo, y una mezcla que tiene que
 * repartirse en dos columnas.
 */
import { useEffect, useState } from "react";
import type { GridItem, SurfaceState } from "@banorte/a2ui";
import { ModularCanvas } from "@/components/ModularCanvas";

function surface(surfaceId: string, title: string, componente: Record<string, unknown>): SurfaceState {
  return {
    surfaceId,
    catalogId: "dev",
    title,
    root: "raiz",
    components: { raiz: { id: "raiz", component: String(componente.component), ...componente } },
    dataModel: {},
  };
}

const RIESGO = {
  component: "RiskAlert",
  nivel: "alto",
  titulo: "Antes de pedir otra tarjeta, conviene bajar lo que ya debes",
  mensaje:
    "Con tu situacion actual, sumar una linea nueva encarece el problema en vez de resolverlo.",
  senales: ["Usa el 96.4% de su linea de credito.", "Su nivel de endeudamiento es alto."],
};

const RANKING = {
  component: "CardRanking",
  titulo: "Opciones para Fernando",
  criterio: "Basado en tu ingreso mensual de $2,573",
  destacadaId: "conmigo",
  barras: [
    { id: "conmigo", nombre: "Banorte Conmigo", puntaje: 70, porQue: "Es la unica opcion sin anualidad que se ajusta a tu ingreso actual." },
    { id: "basica", nombre: "Basica", puntaje: 58, porQue: "Anualidad de $500 y CAT de 121.4%." },
  ],
};

const SIMULADOR = {
  component: "DebtSimulator",
  saldo: 16525,
  plazoSeleccionado: 18,
  opciones: [
    { meses: 12, cat: 32.4, pagoMensual: 1631, costoTotal: 19572, interesesTotales: 3047 },
    { meses: 18, cat: 34.1, pagoMensual: 1186, costoTotal: 21348, interesesTotales: 4823 },
    { meses: 24, cat: 36, pagoMensual: 975, costoTotal: 23400, interesesTotales: 6875 },
  ],
  action: { event: { name: "simulate_restructure" } },
};

const COMPARADOR = {
  component: "OptionComparator",
  titulo: "Tus dos caminos, con su costo",
  opciones: [
    { id: "a", nombre: "Plazo corto", pagoMensual: 1631, costoTotal: 19572, plazoMeses: 12, ventaja: "Pagas menos intereses.", desventaja: "La mensualidad pesa mas." },
    { id: "b", nombre: "Plazo largo", pagoMensual: 975, costoTotal: 23400, plazoMeses: 24, ventaja: "Mensualidad comoda.", desventaja: "Pagas $3,828 mas al final." },
  ],
  action: { event: { name: "comparar" } },
};

const TITULAR = {
  component: "HeadlineVerdict",
  veredicto: "Tu tarjeta se lleva casi toda tu linea disponible",
  dato: "$16,525",
  datoEtiqueta: "Saldo de tu tarjeta",
  tono: "critical",
  indicador: { valor: 94, etiqueta: "94% de tu limite de $17,500 usado" },
  apoyo: [
    { label: "Ingreso mensual", value: "$2,573" },
    { label: "Score", value: "591" },
    { label: "Creditos activos", value: "2" },
  ],
};

const CARTERA = {
  component: "ProductPortfolio",
  titulo: "Lo que tienes con nosotros",
  productos: [
    { id: "debito", tipo: "Cuenta de debito", familia: "cuenta", valor: "$35,610", etiqueta: "Saldo promedio" },
    { id: "tarjeta", tipo: "Tarjeta de credito", familia: "tarjeta", valor: "$16,525", etiqueta: "Saldo actual", nota: "94% de tu limite usado" },
    { id: "personal", tipo: "Credito personal", familia: "credito" },
  ],
  sinContratar: ["Credito automotriz", "Credito hipotecario", "Inversiones"],
};

const SIGUIENTE = {
  component: "NextSteps",
  titulo: "Y ahora, que sigue",
  pasos: [
    { id: "a", texto: "Comparar mi tarjeta con las demas" },
    { id: "b", texto: "Ver cuanto bajo mi deuda si pago mil pesos mas al mes" },
    { id: "c", texto: "Que credito me conviene con mi ingreso" },
  ],
  action: { event: { name: "siguiente_paso" } },
};

const CATALOGO = {
  component: "CardShowcase",
  titulo: "Opciones de tarjetas",
  destacadaId: "conmigo",
  tarjetas: [
    { id: "conmigo", nombre: "Banorte Conmigo", imagen: "/tarjetas/conmigo.png", cat: 98.8, anualidad: 0,
      bullets: ["Tarjeta gratis de por vida.", "Simplifica tu dia a dia."], fuente: "https://www.banorte.com", fechaVerificacion: "2026-09-12" },
    { id: "basica", nombre: "Banorte Basica", imagen: "/tarjetas/basica.png", cat: 95.6, anualidad: 0,
      bullets: ["Sin anualidad de por vida.", "Controla tus compras facil."], fuente: "https://www.banorte.com", fechaVerificacion: "2026-09-12" },
    { id: "oneup", nombre: "Banorte One Up", imagen: "/tarjetas/one-up.png", cat: 87.8, anualidad: 0,
      bullets: ["Elige tu comunidad.", "Puntos por tus compras."], fuente: "https://www.banorte.com", fechaVerificacion: "2026-09-12" },
  ],
  action: { event: { name: "card_selected" } },
};

const DONA = {
  component: "DonutChart",
  titulo: "A donde se va tu ingreso",
  unidad: "$",
  centro: { valor: "$2,573", etiqueta: "Ingreso" },
  segmentos: [
    { id: "gasto", label: "Gasto mensual", valor: 1910 },
    { id: "ahorro", label: "Capacidad de ahorro", valor: 663 },
  ],
};

const HIST_TITULAR = {
  component: "HeadlineVerdict",
  veredicto: "Tu score bajo 57 puntos este ano: los atrasos pesan",
  dato: "591",
  datoEtiqueta: "Score crediticio en agosto",
  tono: "critical",
  indicador: { valor: 53, etiqueta: "591 de 850" },
};
const HIST_LINEA = {
  component: "LineChart",
  titulo: "Tu score crediticio mes a mes",
  unidad: "pts",
  etiquetas: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago"],
  series: [{ id: "score", nombre: "Score crediticio", valores: [648, 641, 636, 630, 618, 611, 600, 591] }],
  referencia: { valor: 670, etiqueta: "Score bueno" },
};
const HIST_AREA = {
  component: "CashflowChart",
  titulo: "Tu cashflow",
  serie: [
    { mes: "Ene", ingreso: 2590, gasto: 1980 }, { mes: "Feb", ingreso: 2540, gasto: 1860 },
    { mes: "Mar", ingreso: 2610, gasto: 2050 }, { mes: "Abr", ingreso: 2555, gasto: 1890 },
    { mes: "May", ingreso: 2600, gasto: 1990 }, { mes: "Jun", ingreso: 2530, gasto: 1850 },
    { mes: "Jul", ingreso: 2580, gasto: 1940 }, { mes: "Ago", ingreso: 2573, gasto: 1910 },
  ],
};
const HIST_PROGRESO = {
  component: "ProgressBars",
  titulo: "Tu salud financiera",
  total: { valor: 41, maximo: 100, etiqueta: "Finance score", nivel: "en riesgo" },
  barras: [
    { id: "ahorro", label: "Capacidad de ahorro", valor: 100, nota: "Te queda libre el 26% de tu ingreso al mes." },
    { id: "uso", label: "Uso de tu linea de credito", valor: 0, nota: "Usas el 94% de tu limite." },
    { id: "score", label: "Score crediticio", valor: 53, nota: "Tu score es 591 de 850." },
  ],
};

const TABLEROS: Record<string, SurfaceState[]> = {
  "Tarjetas (el de tu captura)": [
    surface("s1", "Alerta de riesgo", RIESGO),
    surface("s2", "Ranking de tarjetas", RANKING),
    surface("s3", "Situacion actual", TITULAR),
    surface("s4", "Siguientes pasos", SIGUIENTE),
    surface("s5", "Catalogo de tarjetas", CATALOGO),
  ],
  "Analiza mi perfil": [
    surface("s1", "Tu situacion", TITULAR),
    surface("s2", "Tus productos", CARTERA),
    surface("s3", "Tu ingreso", DONA),
    surface("s4", "Simulador", SIMULADOR),
    surface("s5", "Siguiente", SIGUIENTE),
  ],
  "Tarjetas (el del reporte)": [
    surface("s1", "Evaluacion de riesgo", RIESGO),
    surface("s2", "Tarjetas recomendadas", RANKING),
  ],
  "Deuda: dos de media fila": [
    surface("s1", "Tu situacion", TITULAR),
    surface("s2", "Simulador", SIMULADOR),
  ],
  "Mezcla: alturas muy distintas": [
    surface("s1", "Evaluacion de riesgo", RIESGO),
    surface("s2", "Tu situacion", TITULAR),
    surface("s3", "Simulador", SIMULADOR),
    surface("s4", "Comparador", COMPARADOR),
  ],
  "Mi historial": [
    surface("h1", "Tu tendencia", HIST_TITULAR),
    surface("h2", "Historial crediticio", HIST_LINEA),
    surface("h3", "Cashflow", HIST_AREA),
    surface("h4", "Salud financiera", HIST_PROGRESO),
    surface("h5", "Siguiente", SIGUIENTE),
  ],
};

export default function DevCanvas() {
  const [nombre, setNombre] = useState(Object.keys(TABLEROS)[0]);

  // ?t=<indice> selecciona un tablero desde la URL. Es para poder capturar los
  // tres casos con un navegador sin sesion, que no puede picar los botones.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    const claves = Object.keys(TABLEROS);
    if (t && claves[Number(t)]) setNombre(claves[Number(t)]);
  }, []);
  const [layout, setLayout] = useState<GridItem[]>([]);
  const lista = TABLEROS[nombre];

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-10">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl font-semibold">Acomodo del canvas</h1>
        {Object.keys(TABLEROS).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setNombre(k)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              k === nombre ? "border-brand bg-brand text-white" : "border-line hover:border-brand"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <ModularCanvas
        surfaces={Object.fromEntries(lista.map((s) => [s.surfaceId, s]))}
        order={lista.map((s) => s.surfaceId)}
        layout={layout}
        editable
        onEvent={() => {}}
        onLayoutChange={setLayout}
      />
    </main>
  );
}

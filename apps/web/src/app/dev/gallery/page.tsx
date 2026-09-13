/**
 * Galeria de widgets: criterio de aceptacion de la fase 2.
 * Todo componente del catalogo debe poder verse aqui con datos de ejemplo.
 */
"use client";

import { A2UIRenderer } from "@/components/A2UIRenderer";
import type { SurfaceState } from "@banorte/a2ui";
// Las mismas capacidades que ofrece el asesor en vivo: si cambian alla, la
// galeria las refleja sola en vez de quedarse con una copia vieja.
import { CAPACIDADES } from "@/lib/suggestions";

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
        // Los tres plazos ya calculados: cambiar de chip no vuelve al agente.
        opciones: [
          { meses: 12, cat: 32.4, pagoMensual: 1816, costoTotal: 21787, interesesTotales: 3387 },
          { meses: 18, cat: 34.1, pagoMensual: 1320, costoTotal: 23760, interesesTotales: 5360 },
          { meses: 24, cat: 36, pagoMensual: 1086, costoTotal: 26075, interesesTotales: 7675 },
        ],
        plazoSeleccionado: 18,
        action: { event: { name: "simulate_restructure" } },
      },
    },
    dataModel: {},
  },
  // Los tres niveles de RiskAlert juntos: la diferencia entre ellos es el
  // punto del componente, y verlos por separado no dice nada.
  {
    surfaceId: "g-riesgo-alto",
    catalogId: "gallery",
    title: "RiskAlert — nivel alto (desaconseja credito nuevo)",
    root: "alerta",
    components: {
      alerta: {
        id: "alerta",
        component: "RiskAlert",
        nivel: "alto",
        titulo: "Antes de pedir otra tarjeta, conviene bajar lo que ya debes",
        mensaje:
          "Con tu situacion actual, sumar una linea nueva encarece el problema en vez de resolverlo. Lo que mas te ayuda hoy es ordenar la deuda que ya tienes.",
        senales: [
          "Usa el 96.4% de su linea de credito.",
          "Su nivel de endeudamiento esta clasificado como alto.",
          "Su clasificacion crediticia es baja.",
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-riesgo-precaucion",
    catalogId: "gallery",
    title: "RiskAlert — precaucion",
    root: "alerta",
    components: {
      alerta: {
        id: "alerta",
        component: "RiskAlert",
        nivel: "precaucion",
        titulo: "Puedes pedirla, pero vale la pena verlo con calma",
        mensaje:
          "Calificas para varios productos, aunque tu nivel de deuda ya pesa. Si contratas, que sea por un beneficio concreto y no por la linea extra.",
        senales: ["Tuvo 2 pagos atrasados en los ultimos 12 meses."],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-riesgo-ok",
    catalogId: "gallery",
    title: "RiskAlert — ok",
    root: "alerta",
    components: {
      alerta: {
        id: "alerta",
        component: "RiskAlert",
        nivel: "ok",
        titulo: "Tu situacion da espacio para una tarjeta nueva",
        mensaje: "Tus indicadores de deuda estan en rango.",
        senales: [],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-vitrina",
    catalogId: "gallery",
    title: "CardShowcase — con destacadaId",
    root: "vitrina",
    components: {
      vitrina: {
        id: "vitrina",
        component: "CardShowcase",
        titulo: "Tarjetas para las que calificas",
        destacadaId: "Banorte One Up",
        tarjetas: [
          {
            id: "Banorte One Up",
            nombre: "One Up",
            imagen: "/tarjetas/one-up.png",
            bullets: ["Sin anualidad el primer anio.", "Recompensas en cada compra."],
            cat: 87.8,
            anualidad: 750,
            fuente: "https://www.banorte.com/",
            fechaVerificacion: "2026-09-12",
          },
          {
            id: "Mujer Banorte",
            nombre: "Mujer Banorte",
            imagen: "/tarjetas/mujer.png",
            bullets: ["6 meses sin intereses en salud.", "Primera anualidad sin costo."],
            cat: 96.6,
            anualidad: 1100,
            fuente: "https://www.banorte.com/",
            fechaVerificacion: "2026-09-12",
          },
        ],
        action: { event: { name: "card_selected" } },
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-ranking",
    catalogId: "gallery",
    title: "CardRanking — con destacadaId",
    root: "ranking",
    components: {
      ranking: {
        id: "ranking",
        component: "CardRanking",
        titulo: "Cual te conviene mas",
        criterio: "Segun tu ingreso, tu uso de credito y el costo de cada tarjeta",
        destacadaId: "Banorte One Up",
        barras: [
          { id: "Banorte One Up", nombre: "One Up", puntaje: 85, porQue: "El CAT mas bajo de las que calificas: 87.8%." },
          { id: "Banorte Básica", nombre: "Básica", puntaje: 81, porQue: "Anualidad de $500, la mitad que las demas." },
          { id: "Mujer Banorte", nombre: "Mujer Banorte", puntaje: 81, porQue: "Asistencias de salud y 6 MSI iniciales." },
        ],
      },
    },
    dataModel: {},
  },
  // Los dos motivos por los que sale la tarjeta de fuera de alcance. Se ven
  // juntos porque la diferencia entre ellos es el punto: el saludo abre la
  // puerta, el otro tema explica que no y ofrece la salida de reenviar.
  {
    surfaceId: "g-fuera-charla",
    catalogId: "gallery",
    title: "OutOfScopeCard — saludo (sin consulta que reenviar)",
    root: "fuera",
    components: {
      fuera: {
        id: "fuera",
        component: "OutOfScopeCard",
        titulo: "Hola. Dime que quieres resolver y te armo la pantalla",
        mensaje:
          "Todavia no tengo una pregunta que analizar, y de temas generales no se nada: lo mio es tu tarjeta de credito y lo que debes en ella. Pica una de estas y arranco con tus numeros.",
        sugerencias: CAPACIDADES.map((c) => ({ ...c })),
        action: { event: { name: "sugerencia_elegida" } },
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-fuera-tema",
    catalogId: "gallery",
    title: "OutOfScopeCard — otro tema (con boton de reenviar)",
    root: "fuera",
    components: {
      fuera: {
        id: "fuera",
        component: "OutOfScopeCard",
        titulo: "Eso se sale de lo que puedo resolver",
        mensaje:
          'Lamentablemente no puedo responder "como va a estar el clima manana". Soy el asesor financiero de Banorte y solo trabajo con tu deuda de tarjeta de credito y el credito al que puedes acceder. Esto si lo hago contigo:',
        sugerencias: CAPACIDADES.map((c) => ({ ...c })),
        consultaOriginal: "como va a estar el clima manana",
        action: { event: { name: "sugerencia_elegida" } },
      },
    },
    dataModel: {},
  },
  // Los tres niveles de la jerarquia visual, en el orden en que van en pantalla.
  {
    surfaceId: "g-titular",
    catalogId: "gallery",
    title: "HeadlineVerdict — nivel 1, la conclusion",
    root: "titular",
    components: {
      titular: {
        id: "titular",
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
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-cartera",
    catalogId: "gallery",
    title: "ProductPortfolio — nivel 2, que tiene contratado",
    root: "cartera",
    components: {
      cartera: {
        id: "cartera",
        component: "ProductPortfolio",
        titulo: "Lo que tienes con nosotros",
        productos: [
          { id: "debito", tipo: "Cuenta de debito", familia: "cuenta", valor: "$35,610", etiqueta: "Saldo promedio" },
          { id: "tarjeta", tipo: "Tarjeta de credito", familia: "tarjeta", valor: "$16,525", etiqueta: "Saldo actual", nota: "94% de tu limite usado" },
          { id: "personal", tipo: "Credito personal", familia: "credito" },
        ],
        sinContratar: ["Credito automotriz", "Credito hipotecario", "Inversiones"],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-siguiente",
    catalogId: "gallery",
    title: "NextSteps — nivel 3, por donde seguir",
    root: "siguiente",
    components: {
      siguiente: {
        id: "siguiente",
        component: "NextSteps",
        titulo: "Y ahora, que sigue",
        pasos: [
          { id: "a", texto: "Comparar mi tarjeta con las demas" },
          { id: "b", texto: "Ver cuanto bajo mi deuda si pago mil pesos mas al mes" },
          { id: "c", texto: "Que credito me conviene con mi ingreso" },
        ],
        action: { event: { name: "siguiente_paso" } },
      },
    },
    dataModel: {},
  },
  // Graficas: las cuatro del catalogo con datos de ejemplo.
  {
    surfaceId: "g-barras",
    catalogId: "gallery",
    title: "BarChart — capital e intereses por plazo",
    root: "barras",
    components: {
      barras: {
        id: "barras",
        component: "BarChart",
        titulo: "Cuanto pagas en total segun el plazo",
        subtitulo: "Lo que debes mas los intereses de cada opcion",
        unidad: "$",
        leyenda: ["Lo que debes", "Intereses"],
        barras: [
          { id: "12", label: "12 meses", valor: 18400, secundario: 3387, destacado: true, pie: "$1,816/mes" },
          { id: "18", label: "18 meses", valor: 18400, secundario: 5360, pie: "$1,320/mes" },
          { id: "24", label: "24 meses", valor: 18400, secundario: 7675, pie: "$1,086/mes" },
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-dona",
    catalogId: "gallery",
    title: "DonutChart — a donde se va el ingreso",
    root: "dona",
    components: {
      dona: {
        id: "dona",
        component: "DonutChart",
        titulo: "A donde se va tu ingreso",
        unidad: "$",
        centro: { valor: "$27,365", etiqueta: "Ingreso" },
        segmentos: [
          { id: "gasto", label: "Gasto mensual", valor: 15686 },
          { id: "ahorro", label: "Capacidad de ahorro", valor: 11679 },
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-cashflow",
    catalogId: "gallery",
    title: "CashflowChart — ingreso contra gasto por mes",
    root: "flujo",
    components: {
      flujo: {
        id: "flujo",
        component: "CashflowChart",
        titulo: "Ingreso contra gasto",
        serie: [
          { mes: "Jun", ingreso: 27365, gasto: 15686 },
          { mes: "Jul", ingreso: 27365, gasto: 18210 },
          { mes: "Ago", ingreso: 28100, gasto: 16950 },
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-gasto",
    catalogId: "gallery",
    title: "SpendingBreakdown — gasto por categoria",
    root: "gasto",
    components: {
      gasto: {
        id: "gasto",
        component: "SpendingBreakdown",
        titulo: "En que se va tu dinero",
        categorias: [
          { nombre: "Vivienda", monto: 6500 },
          { nombre: "Comida", monto: 4200 },
          { nombre: "Transporte", monto: 2300 },
          { nombre: "Tarjeta", monto: 2686 },
        ],
      },
    },
    dataModel: {},
  },
  // Historial de enero a agosto de 2026.
  {
    surfaceId: "g-linea",
    catalogId: "gallery",
    title: "LineChart — historial crediticio",
    root: "linea",
    components: {
      linea: {
        id: "linea",
        component: "LineChart",
        titulo: "Tu score crediticio mes a mes",
        subtitulo: "Enero a agosto de 2026",
        unidad: "pts",
        etiquetas: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago"],
        series: [{ id: "score", nombre: "Score crediticio", valores: [648, 641, 636, 630, 618, 611, 600, 591] }],
        referencia: { valor: 670, etiqueta: "Score bueno" },
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-linea-cuenta",
    catalogId: "gallery",
    title: "LineChart — ingresos, gastos y ahorro (analisis general)",
    root: "cuenta",
    components: {
      cuenta: {
        id: "cuenta",
        component: "LineChart",
        titulo: "Tus ingresos, gastos y ahorro",
        subtitulo: "Enero a agosto de 2026",
        unidad: "$",
        etiquetas: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago"],
        // Orden revuelto a proposito: los colores tienen que seguir al significado.
        series: [
          { id: "ahorro", nombre: "Ahorro", valores: [10940, 12090, 10550, 11630, 10600, 12030, 11590, 11679] },
          { id: "gastos", nombre: "Gastos", valores: [16240, 14820, 17100, 15390, 16880, 14960, 15720, 15686] },
          { id: "ingreso", nombre: "Ingreso", valores: [27180, 26910, 27650, 27020, 27480, 26990, 27310, 27365] },
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-area",
    catalogId: "gallery",
    title: "CashflowChart — area de ingreso contra gasto",
    root: "area",
    components: {
      area: {
        id: "area",
        component: "CashflowChart",
        titulo: "Tu cashflow",
        subtitulo: "Lo que entra contra lo que sale",
        serie: [
          { mes: "Ene", ingreso: 27180, gasto: 16240 },
          { mes: "Feb", ingreso: 26910, gasto: 14820 },
          { mes: "Mar", ingreso: 27650, gasto: 17100 },
          { mes: "Abr", ingreso: 27020, gasto: 15390 },
          { mes: "May", ingreso: 27480, gasto: 16880 },
          { mes: "Jun", ingreso: 26990, gasto: 14960 },
          { mes: "Jul", ingreso: 27310, gasto: 15720 },
          { mes: "Ago", ingreso: 27365, gasto: 15686 },
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-progreso",
    catalogId: "gallery",
    title: "ProgressBars — finance score",
    root: "progreso",
    components: {
      progreso: {
        id: "progreso",
        component: "ProgressBars",
        titulo: "Tu salud financiera",
        total: { valor: 58, maximo: 100, etiqueta: "Finance score", nivel: "estable" },
        barras: [
          { id: "ahorro", label: "Capacidad de ahorro", valor: 100, nota: "Te queda libre el 43% de tu ingreso al mes." },
          { id: "uso", label: "Uso de tu linea de credito", valor: 10, nota: "Usas el 84% de tu limite." },
          { id: "puntualidad", label: "Puntualidad en tus pagos", valor: 70, nota: "1 pago atrasado en los ultimos 12 meses." },
          { id: "score", label: "Score crediticio", valor: 53, nota: "Tu score es 591 de 850." },
        ],
      },
    },
    dataModel: {},
  },
  {
    surfaceId: "g-planes",
    catalogId: "gallery",
    title: "ProgressBars — planes de ahorro",
    root: "planes",
    components: {
      planes: {
        id: "planes",
        component: "ProgressBars",
        titulo: "Tus planes de ahorro",
        barras: [
          { id: "emergencia", label: "Fondo de emergencia", valor: 35610, meta: 47058, unidad: "$", nota: "A tu ritmo actual lo completas en 5 meses." },
          { id: "tarjeta", label: "Liquidar tu tarjeta", valor: 0, meta: 16525, unidad: "$", nota: "Tu saldo esta en su punto mas alto desde Ago: no ha bajado." },
        ],
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

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

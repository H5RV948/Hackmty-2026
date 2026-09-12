/**
 * Endpoint del agente.
 *
 * FASE 2 (actual): responde con un guion fijo para poder trabajar el renderer
 * y el canvas sin gastar tokens. Todo mensaje pasa por validateA2UI.
 *
 * FASE 4: reemplazar `scriptedResponse` por:
 *   1. agente razonador con herramientas MCP (MCP_SERVER_URL),
 *   2. surface planner con salida estructurada limitada al catalogo,
 *   3. ciclo de reparacion con los errores del validador (max 2 intentos),
 *   4. fallback a la surface `fallback-text`.
 */
import { validateA2UI, CATALOG_ID, A2UI_VERSION } from "@banorte/a2ui";
import type { A2UIMessage, ClientEvent } from "@banorte/a2ui";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { event } = (await request.json()) as { event: ClientEvent };
  const messages = scriptedResponse(event);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const message of messages) {
        const result = validateA2UI(message);
        if (!result.ok) {
          console.error("[a2ui] mensaje invalido:", result.errors);
          continue; // en fase 4 esto dispara el ciclo de reparacion
        }
        controller.enqueue(encoder.encode(JSON.stringify(result.message) + "\n"));
        await new Promise((r) => setTimeout(r, 120)); // render incremental
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}

function scriptedResponse(event: ClientEvent): A2UIMessage[] {
  if (event.type !== "user_message") return [];

  return [
    {
      version: A2UI_VERSION,
      createSurface: { surfaceId: "diagnostico", catalogId: CATALOG_ID, title: "Tu situacion" },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: "diagnostico",
        root: "salud",
        components: [
          {
            id: "salud",
            component: "FinancialHealthCard",
            titulo: "Asi se ve tu mes",
            lectura:
              "Tu tarjeta concentra la mayor parte de lo que pagas en intereses. Si mueves ese saldo a un plazo fijo, bajas el pago mensual, aunque el costo total sube.",
            metricas: { path: "/resumen/metricas" },
          },
        ],
      },
    },
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId: "diagnostico",
        path: "/resumen",
        value: {
          metricas: [
            { label: "Saldo de tarjeta", value: "$18,400", tone: "critical" },
            { label: "Pago minimo", value: "$1,840", tone: "warning" },
            { label: "Intereses del mes", value: "$497", tone: "warning" },
          ],
        },
      },
    },
    {
      version: A2UI_VERSION,
      createSurface: { surfaceId: "posibilidades", catalogId: CATALOG_ID, title: "Que puedes hacer" },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: "posibilidades",
        root: "oportunidades",
        components: [
          {
            id: "oportunidades",
            component: "OpportunityGrid",
            titulo: "Caminos posibles, tu decides cual explorar",
            opciones: { path: "/opciones/lista" },
            action: { event: { name: "opportunity_selected" } },
          },
        ],
      },
    },
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId: "posibilidades",
        path: "/opciones",
        value: {
          lista: [
            {
              id: "reestructura",
              titulo: "Reestructurar el saldo a plazo fijo",
              porQue: "Bajas el pago mensual y dejas de pagar intereses revolventes.",
              impactoEstimado: "Hasta $860 menos al mes",
            },
            {
              id: "pago-dirigido",
              titulo: "Atacar el saldo sin reestructurar",
              porQue: "Pagas mas al mes pero terminas antes y te cuesta menos.",
              impactoEstimado: "Ahorras $2,300 en intereses",
            },
          ],
        },
      },
    },
    {
      version: A2UI_VERSION,
      updateCanvasLayout: {
        items: [
          { surfaceId: "diagnostico", x: 0, y: 0, w: 6, h: 4 },
          { surfaceId: "posibilidades", x: 6, y: 0, w: 6, h: 4 },
        ],
      },
    },
    {
      version: A2UI_VERSION,
      updateGuidance: {
        steps: [
          {
            targetId: "salud",
            title: "Empieza por aqui",
            body: "Este es el numero que mas te esta costando hoy.",
            side: "right",
          },
          {
            targetId: "oportunidades",
            title: "Elige que explorar",
            body: "Selecciona un camino y te hago un par de preguntas cortas para afinarlo.",
            side: "left",
          },
        ],
        trigger: "auto",
      },
    },
  ];
}

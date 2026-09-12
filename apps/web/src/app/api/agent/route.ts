/**
 * Endpoint del agente — FASE 4.
 *
 * Ciclo por request:
 *   evento de UI -> intencion en texto
 *                -> agente razonador con tools MCP (de ahi salen las cifras)
 *                -> surface planner (A2UI limitado al catalogo)
 *                -> validateA2UI + ciclo de reparacion
 *                -> stream NDJSON al canvas
 *
 * Lo que cambio respecto a la fase 2: ya no hay guion fijo, y los eventos
 * `ui_action` SI regresan al agente como contexto — antes se ignoraban, que
 * era justo lo que rompia el ciclo adaptativo del reto.
 */
import { validateA2UI } from "@banorte/a2ui";
import type { A2UIMessage, ClientEvent } from "@banorte/a2ui";
import { openMcpSession } from "@/lib/agent/mcp";
import { reason } from "@/lib/agent/gemini";
import { fallbackSurface, planSurfaces } from "@/lib/agent/planner";

export const runtime = "nodejs";
export const maxDuration = 60;

type RequestBody = { event: ClientEvent; surfaces?: string[] };

/** El agente razona sobre texto, no sobre la forma interna del evento. */
function intentFromEvent(event: ClientEvent): string | null {
  if (event.type === "user_message") {
    return `El usuario escribio: "${event.text}"`;
  }

  if (event.type === "ui_action") {
    const payload = event.payload ? ` con estos datos: ${JSON.stringify(event.payload)}` : "";
    return [
      `El usuario interactuo con la pantalla que le generaste.`,
      `Evento "${event.name}" en el componente "${event.componentId}" de la surface "${event.surfaceId}"${payload}.`,
      `Actualiza la pantalla segun lo que esto te dice de el.`,
      `Si el evento confirma una accion explicitamente, recien ahi puedes ejecutar una tool de tipo write.`,
    ].join(" ");
  }

  // canvas_layout_changed no regenera UI: reacomodar widgets no es una intencion.
  return null;
}

export async function POST(request: Request) {
  const { event, surfaces = [] } = (await request.json()) as RequestBody;
  const intent = intentFromEvent(event);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: A2UIMessage) => {
        // Cinturon y tirantes: el planner ya valido, pero el fallback y
        // cualquier mensaje futuro tambien tienen que pasar por aqui.
        const result = validateA2UI(message);
        if (!result.ok) {
          console.error("[a2ui] mensaje invalido, no se envia:", result.errors);
          return;
        }
        controller.enqueue(encoder.encode(JSON.stringify(result.message) + "\n"));
      };

      if (!intent) {
        controller.close();
        return;
      }

      let mcp: Awaited<ReturnType<typeof openMcpSession>> | null = null;
      try {
        mcp = await openMcpSession();
        const reasoning = await reason(intent, mcp);
        const plan = await planSurfaces(intent, reasoning, surfaces);

        if (plan.fellBack) {
          console.warn("[agent] el planner no produjo A2UI valido, va el fallback");
        } else if (plan.repairs > 0) {
          console.info(`[agent] A2UI valido despues de ${plan.repairs} reparacion(es)`);
        }

        for (const message of plan.messages) {
          send(message);
          // Render incremental: el canvas se va armando a la vista.
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[agent] fallo:", detail);
        // En desarrollo el error va a la pantalla: perseguir esto en los logs
        // de Docker cuesta mucho mas que leerlo aqui. En produccion se
        // mostraria un mensaje generico.
        const visible =
          process.env.NODE_ENV === "development"
            ? `No pude armar tu pantalla. Error: ${detail}`
            : "No pude armar tu pantalla en este momento. Intenta de nuevo.";
        for (const message of fallbackSurface(visible)) {
          send(message);
        }
      } finally {
        await mcp?.close().catch(() => undefined);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}

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
import type { A2UIMessage, ClientEvent, GridItem } from "@banorte/a2ui";
import { clasificarConsulta, fueraDeAlcanceMessages } from "@/lib/agent/scope";
import { openMcpSession, precargarContexto } from "@/lib/agent/mcp";
import { reason } from "@/lib/agent/gemini";
import { fallbackSurface, planSurfaces } from "@/lib/agent/planner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * `layout` viaja junto con `surfaces` porque el filtro de alcance necesita
 * saber donde esta cada widget para meter su tarjeta arriba sin descolocar el
 * tablero: updateCanvasLayout reemplaza el layout completo, no lo parchea.
 */
type RequestBody = { event: ClientEvent; surfaces?: string[]; layout?: GridItem[] };

/**
 * El agente razona sobre texto, no sobre la forma interna del evento.
 *
 * Ojo con lo que NO dice: ya no se le pide llamar get_financial_profile. El
 * perfil y la simulacion llegan precargados (ver precargarContexto), y pedirle
 * que los vuelva a llamar costaba un viaje extra al modelo y, peor, con
 * `nuevoCaso: true` le cambiaba el cliente a media pantalla.
 */
function intentFromEvent(event: ClientEvent): string | null {
  if (event.type === "user_message") {
    return [
      `El usuario escribio: "${event.text}"`,
      `Es una consulta nueva. Su perfil ya viene abajo: no lo vuelvas a pedir.`,
    ].join(" ");
  }

  if (event.type === "ui_action") {
    const payload = event.payload ? ` con estos datos: ${JSON.stringify(event.payload)}` : "";
    return [
      `El usuario interactuo con la pantalla que le generaste.`,
      `Evento "${event.name}" en el componente "${event.componentId}" de la surface "${event.surfaceId}"${payload}.`,
      `Actualiza la pantalla segun lo que esto te dice de el.`,
      `Sigue siendo la MISMA persona: su perfil ya viene abajo, con su clienteId.`,
      `Reutiliza ese clienteId en cualquier tool que llames; pedir el perfil otra`,
      `vez mezclaria dos personas en la misma pantalla.`,
      `Si el evento confirma una accion explicitamente, recien ahi puedes ejecutar una tool de tipo write.`,
    ].join(" ");
  }

  // canvas_layout_changed no regenera UI: reacomodar widgets no es una intencion.
  return null;
}

export async function POST(request: Request) {
  const { event, surfaces = [], layout = [] } = (await request.json()) as RequestBody;
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

      /*
       * Cortocircuito de alcance.
       *
       * Va ANTES de abrir la sesion MCP porque el objetivo es justamente no
       * pagar nada: sin esto, "hola" cuesta lo mismo que un tablero completo
       * (sesion MCP + razonamiento + planner, dos llamadas al modelo) y gasta
       * una peticion de la cuota diaria de Gemini para contestar un saludo.
       *
       * Solo aplica a lo que el usuario escribe. Un `ui_action` nace de un
       * boton que nosotros dibujamos: si llegara aqui seria un bug nuestro, y
       * filtrarlo esconderia el bug en vez de arreglarlo.
       */
      if (event.type === "user_message" && !event.forzado) {
        const alcance = clasificarConsulta(event.text);
        if (!alcance.dentro) {
          console.info(`[scope] consulta fuera de alcance (${alcance.motivo}): "${event.text}"`);
          for (const message of fueraDeAlcanceMessages(alcance.motivo, event.text, layout)) {
            send(message);
          }
          controller.close();
          return;
        }
      }

      let mcp: Awaited<ReturnType<typeof openMcpSession>> | null = null;
      try {
        /*
         * Tiempos por fase. Sin esto, "la pantalla tarda" no se puede atacar:
         * el razonamiento y el planner son llamadas al modelo separadas y la
         * lenta no siempre es la misma. La sesion MCP se mide aparte porque es
         * local y deberia ser ruido — si algun dia no lo es, se ve aqui.
         */
        const t0 = Date.now();
        mcp = await openMcpSession();
        // `nuevoCaso` solo en consultas nuevas desde la barra: al reaccionar a
        // un boton seguimos hablando con la misma persona.
        const precargados = await precargarContexto(mcp, event.type === "user_message");
        const tMcp = Date.now();
        const reasoning = await reason(intent, mcp, precargados);
        const tRazon = Date.now();
        const plan = await planSurfaces(intent, reasoning, surfaces);
        const tPlan = Date.now();

        console.info(
          `[agent] mcp ${tMcp - t0}ms · razonamiento ${tRazon - tMcp}ms · planner ${
            tPlan - tRazon
          }ms · total ${tPlan - t0}ms`,
        );

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

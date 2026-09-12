/**
 * Servidor MCP: expone al agente los datos y las acciones del banco.
 *
 * Convencion obligatoria (AGENTS.md, regla 5): cada tool declara su acceso en
 * la descripcion. Las tools `write` NO ejecutan nada sin `confirmadoPorUsuario`,
 * que solo puede venir de una interaccion con la UI generada.
 */
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cliente, cuentas, tarjetas, plazosReestructura, SYNTHETIC } from "./data.js";
import { simularReestructura } from "./finance.js";
import {
  emptyUnderstanding,
  isReadyToSummarize,
  nextSlotToAsk,
  type UserUnderstanding,
} from "./understanding.js";

const server = new McpServer({ name: "banorte-advisor", version: "0.1.0" });

/* ---------------------------------------------------------------- */
/* READ                                                              */
/* ---------------------------------------------------------------- */

server.registerTool(
  "get_financial_profile",
  {
    description: "[read] Perfil del cliente: ingreso, gasto, cuentas y tarjetas. Datos sinteticos.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ cliente, cuentas, tarjetas, synthetic: SYNTHETIC }),
      },
    ],
  }),
);

server.registerTool(
  "simulate_restructure",
  {
    description:
      "[read] Simula la reestructura de un saldo de tarjeta. Devuelve pago mensual, CAT, costo total e intereses por plazo. Usa SIEMPRE esta tool para los numeros: no los estimes.",
    inputSchema: {
      cardId: z.string(),
      saldo: z.number().positive().optional(),
    },
  },
  async ({ cardId, saldo }) => {
    const card = tarjetas.find((t) => t.id === cardId);
    if (!card) {
      return { isError: true, content: [{ type: "text", text: `Tarjeta ${cardId} no encontrada.` }] };
    }
    const opciones = simularReestructura(saldo ?? card.saldo, plazosReestructura);
    return { content: [{ type: "text", text: JSON.stringify({ cardId, opciones }) }] };
  },
);

/* ---------------------------------------------------------------- */
/* Entendimiento del usuario                                         */
/* ---------------------------------------------------------------- */

// TODO(fase 5): persistir por sesion. En memoria mientras se prueba el ciclo.
let understanding: UserUnderstanding = emptyUnderstanding();

server.registerTool(
  "update_understanding",
  {
    description:
      "[read] Registra lo que se aprendio del usuario y devuelve el siguiente slot a preguntar. Llamala despues de cada respuesta a una ExplorationCard.",
    inputSchema: {
      slot: z.enum(["objetivo", "horizonte", "capacidadPago", "toleranciaRiesgo", "prioridades"]),
      value: z.unknown(),
      confidence: z.number().min(0).max(1),
      source: z.string(),
    },
  },
  async ({ slot, value, confidence, source }) => {
    understanding = {
      ...understanding,
      [slot]: { value, confidence, source },
    } as UserUnderstanding;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            understanding,
            siguienteSlot: nextSlotToAsk(understanding),
            listoParaValidar: isReadyToSummarize(understanding),
          }),
        },
      ],
    };
  },
);

/* ---------------------------------------------------------------- */
/* WRITE — requiere confirmacion explicita del usuario                */
/* ---------------------------------------------------------------- */

server.registerTool(
  "apply_restructure_plan",
  {
    description:
      "[write] Aplica un plan de reestructura. NO la llames sin que el usuario haya confirmado en la UI generada. Si confirmadoPorUsuario es false, regresa error.",
    inputSchema: {
      cardId: z.string(),
      plazoMeses: z.number().int().positive(),
      confirmadoPorUsuario: z.boolean(),
    },
  },
  async ({ cardId, plazoMeses, confirmadoPorUsuario }) => {
    if (!confirmadoPorUsuario) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Falta confirmacion del usuario. Genera un ActionPlan con requiereConfirmacion y espera el evento.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            estado: "aplicado",
            cardId,
            plazoMeses,
            folio: `SIM-${Date.now()}`,
            synthetic: SYNTHETIC,
          }),
        },
      ],
    };
  },
);

/* ---------------------------------------------------------------- */
/* Transporte HTTP                                                   */
/* ---------------------------------------------------------------- */

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, synthetic: SYNTHETIC }));

app.all("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => void transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(`[mcp] escuchando en http://0.0.0.0:${port}/mcp`);
});

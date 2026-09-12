/**
 * Servidor MCP: expone al agente los datos y las acciones del banco.
 *
 * Convencion obligatoria (AGENTS.md, regla 5): cada tool declara su acceso en
 * la descripcion. Las tools `write` NO ejecutan nada sin `confirmadoPorUsuario`,
 * que solo puede venir de una interaccion con la UI generada.
 *
 * Los datos salen de los CSV de `seed/` (ver data.ts). Todo lo que no venga de
 * ahi se marca explicitamente como supuesto en la respuesta, para que ni el
 * modelo ni la UI lo presenten como dato del cliente.
 */
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  DEFAULT_CLIENTE_ID,
  PAGO_MINIMO_PCT,
  SYNTHETIC,
  clientes,
  clientesConTarjeta,
  getCliente,
  pagoMinimoEstimado,
  plazosReestructura,
  tarjetasCredito,
} from "./data.js";
import { simularReestructura } from "./finance.js";
import {
  emptyUnderstanding,
  isReadyToSummarize,
  nextSlotToAsk,
  type UserUnderstanding,
} from "./understanding.js";

const ok = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
});

const fail = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

/**
 * Estado compartido entre requests, a proposito: si viviera dentro de
 * buildServer() se reiniciaria en cada llamada y el ciclo adaptativo no
 * avanzaria nunca.
 *
 * TODO(fase 5): persistir por sesion de usuario, no global.
 */
let understanding: UserUnderstanding = emptyUnderstanding();

/**
 * Una instancia de McpServer POR REQUEST.
 *
 * El SDK (>= 1.30) ya no permite reconectar la misma instancia a un transport
 * nuevo: truena con "Already connected to a transport". Antes funcionaba de
 * casualidad, y estaba anotado como deuda tecnica en docs/STATUS.md. Registrar
 * las tools es barato, asi que armamos un servidor limpio en cada /mcp.
 */
function buildServer(): McpServer {
  const server = new McpServer({ name: "banorte-advisor", version: "0.2.0" });

  /* ---------------------------------------------------------------- */
  /* READ                                                              */
  /* ---------------------------------------------------------------- */

  server.registerTool(
    "get_financial_profile",
    {
      description:
        "[read] Perfil de un cliente: ingreso, gastos, capacidad de ahorro, saldo y limite de tarjeta, uso del limite, score y nivel de endeudamiento. Si no mandas clienteId devuelve el cliente de la demo. Datos sinteticos.",
      inputSchema: {
        clienteId: z
          .string()
          .optional()
          .describe(`Id tipo "CLI131". Por defecto ${DEFAULT_CLIENTE_ID}.`),
      },
    },
    async ({ clienteId }) => {
      const cliente = getCliente(clienteId);
      if (!cliente) {
        return fail(
          `No existe el cliente "${clienteId}". Hay ${clientes.length} clientes con ids tipo CLI001. Usa list_clients si necesitas uno.`,
        );
      }

      const pagoMinimo =
        cliente.saldoTarjeta && cliente.saldoTarjeta > 0
          ? pagoMinimoEstimado(cliente.saldoTarjeta)
          : null;

      return ok({
        cliente,
        supuestos:
          pagoMinimo === null
            ? {}
            : {
                pagoMinimo,
                nota: `El pago minimo no viene en los datos: es un estimado al ${
                  PAGO_MINIMO_PCT * 100
                }% del saldo.`,
              },
        synthetic: SYNTHETIC,
      });
    },
  );

  server.registerTool(
    "list_clients",
    {
      description:
        "[read] Lista breve de clientes con tarjeta de credito y saldo, para elegir un caso. Usala solo si necesitas un clienteId y no te dieron uno.",
      inputSchema: {
        limite: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ limite }) =>
      ok({
        total: clientesConTarjeta.length,
        clientes: clientesConTarjeta.slice(0, limite ?? 10).map((c) => ({
          id: c.id,
          edad: c.edad,
          saldoTarjeta: c.saldoTarjeta,
          usoLimitePct: c.usoLimitePct,
          nivelEndeudamiento: c.nivelEndeudamiento,
          objetivoFinanciero: c.objetivoFinanciero,
        })),
        synthetic: SYNTHETIC,
      }),
  );

  server.registerTool(
    "simulate_restructure",
    {
      description:
        "[read] Simula reestructurar el saldo de tarjeta de un cliente. Devuelve pago mensual, CAT, costo total e intereses por plazo. Usa SIEMPRE esta tool para los numeros: no los estimes.",
      inputSchema: {
        clienteId: z.string().optional(),
        saldo: z
          .number()
          .positive()
          .optional()
          .describe("Solo si quieres simular un saldo distinto al del cliente."),
      },
    },
    async ({ clienteId, saldo }) => {
      const cliente = getCliente(clienteId);
      if (!cliente) return fail(`No existe el cliente "${clienteId}".`);

      const base = saldo ?? cliente.saldoTarjeta;
      if (!base || base <= 0) {
        return fail(
          `El cliente ${cliente.id} no tiene saldo de tarjeta que reestructurar. Ofrecele otra cosa, no inventes un saldo.`,
        );
      }

      return ok({
        clienteId: cliente.id,
        saldo: base,
        pagoMinimoActual: pagoMinimoEstimado(base),
        opciones: simularReestructura(base, plazosReestructura),
        nota: "Los plazos y su CAT son la oferta supuesta del banco para el reto, no una oferta real.",
        synthetic: SYNTHETIC,
      });
    },
  );

  server.registerTool(
    "get_card_catalog",
    {
      description:
        "[read] Catalogo de tarjetas de credito Banorte con CAT, tasa, comision anual, MSI, requisitos y la fuente oficial de cada producto. Cita siempre fuente y fechaVerificacion junto a cualquier cifra de este catalogo.",
      inputSchema: {
        ingresoMensual: z
          .number()
          .positive()
          .optional()
          .describe("Filtra productos cuyo ingreso minimo el cliente si cumple."),
      },
    },
    async ({ ingresoMensual }) => {
      const productos =
        ingresoMensual === undefined
          ? tarjetasCredito
          : tarjetasCredito.filter(
              (t) => t.ingresoMinimo === null || t.ingresoMinimo <= ingresoMensual,
            );
      return ok({ total: productos.length, productos, synthetic: false });
    },
  );

  /* ---------------------------------------------------------------- */
  /* Entendimiento del usuario                                         */
  /* ---------------------------------------------------------------- */

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
      return ok({
        understanding,
        siguienteSlot: nextSlotToAsk(understanding),
        listoParaValidar: isReadyToSummarize(understanding),
      });
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
        clienteId: z.string(),
        plazoMeses: z.number().int().positive(),
        confirmadoPorUsuario: z.boolean(),
      },
    },
    async ({ clienteId, plazoMeses, confirmadoPorUsuario }) => {
      if (!confirmadoPorUsuario) {
        return fail(
          "Falta confirmacion del usuario. Genera un ActionPlan con requiereConfirmacion y espera el evento.",
        );
      }
      const cliente = getCliente(clienteId);
      if (!cliente) return fail(`No existe el cliente "${clienteId}".`);

      return ok({
        estado: "aplicado",
        clienteId: cliente.id,
        plazoMeses,
        folio: `SIM-${Date.now()}`,
        synthetic: SYNTHETIC,
      });
    },
  );

  return server;
}

/* ---------------------------------------------------------------- */
/* Transporte HTTP                                                   */
/* ---------------------------------------------------------------- */

const app = express();
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    synthetic: SYNTHETIC,
    clientes: clientes.length,
    clientesConTarjeta: clientesConTarjeta.length,
    productosTarjeta: tarjetasCredito.length,
  }),
);

app.all("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    // Sin este catch, un throw aqui tumba el proceso entero de Node.
    console.error("[mcp] fallo atendiendo /mcp:", error);
    if (!res.headersSent) res.status(500).json({ error: "Fallo el servidor MCP." });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(
    `[mcp] escuchando en http://0.0.0.0:${port}/mcp — ${clientes.length} clientes (${clientesConTarjeta.length} con tarjeta), ${tarjetasCredito.length} productos de credito`,
  );
});

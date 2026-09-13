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
import { evaluarElegibilidad, evaluarRiesgoDeuda, puntuar } from "./eligibility.js";
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
        "[read] Perfil de un cliente: nombre, ingreso, gastos, capacidad de ahorro, saldo y limite de tarjeta, uso del limite, score y nivel de endeudamiento. Sin clienteId devuelve el cliente de la conversacion en curso, el mismo entre llamadas. Guarda el clienteId que te devuelve y pasalo a las demas tools. Datos sinteticos.",
      inputSchema: {
        clienteId: z
          .string()
          .optional()
          .describe(`Id tipo "CLI131". Si lo omites se usa el cliente de la conversacion.`),
        nuevoCaso: z
          .boolean()
          .optional()
          .describe(
            "Solo true cuando el usuario abre una consulta NUEVA desde la barra de texto. Cambia de cliente. Nunca lo pongas al reaccionar a un boton de la pantalla generada.",
          ),
      },
    },
    async ({ clienteId, nuevoCaso }) => {
      const cliente = getCliente(clienteId, nuevoCaso === true);
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

  /*
   * "Que productos tengo" es la primera pregunta de cualquiera que entra a su
   * banca, y hasta ahora no habia con que responderla: el perfil solo exponia
   * la tarjeta. Esta tool arma la cartera completa desde las columnas del seed.
   *
   * Devuelve SOLO lo que el dato sostiene. El seed dice si el cliente tiene un
   * credito personal y cuantos creditos activos hay, pero no el monto, la tasa
   * ni la mensualidad de cada uno. Inventar esas cifras seria el peor bug
   * posible en una pantalla bancaria, asi que el campo `detalle` dice
   * explicitamente que no esta disponible y la UI lo refleja.
   */
  server.registerTool(
    "get_my_products",
    {
      description:
        "[read] Cartera del cliente: que productos bancarios tiene contratados (cuenta de debito, tarjeta de credito, credito personal, automotriz, hipotecario, empresarial, inversiones), con la cifra relevante de cada uno y un resumen de su deuda total. Usala para 'que productos tengo', 'analiza mi perfil', 'mis creditos' o 'mis prestamos'. El detalle por credito individual NO existe en los datos: no lo inventes. Datos sinteticos.",
      inputSchema: {
        clienteId: z
          .string()
          .optional()
          .describe(`Id tipo "CLI131". Si lo omites se usa el cliente de la conversacion.`),
      },
    },
    async ({ clienteId }) => {
      const cliente = getCliente(clienteId);
      if (!cliente) return fail(`No existe el cliente "${clienteId}".`);

      const pct = (parte: number | null, total: number | null) =>
        parte !== null && total !== null && total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

      const productos = [
        {
          id: "debito",
          tipo: "Cuenta de debito",
          familia: "cuenta",
          contratado: cliente.tieneCuentaDebito,
          cifra: cliente.saldoPromedioCuenta,
          cifraEtiqueta: "Saldo promedio",
          detalle: null,
        },
        {
          id: "tarjeta",
          tipo: "Tarjeta de credito",
          familia: "tarjeta",
          contratado: cliente.tieneTarjetaCredito,
          cifra: cliente.saldoTarjeta,
          cifraEtiqueta: "Saldo actual",
          detalle:
            cliente.limiteCredito === null
              ? null
              : {
                  limite: cliente.limiteCredito,
                  usoPct: cliente.usoLimitePct ?? pct(cliente.saldoTarjeta, cliente.limiteCredito),
                  gastoMensual: cliente.gastoMensualTarjeta,
                },
        },
        {
          id: "personal",
          tipo: "Credito personal",
          familia: "credito",
          contratado: cliente.tieneCreditoPersonal,
          cifra: null,
          cifraEtiqueta: null,
          detalle: null,
        },
        {
          id: "automotriz",
          tipo: "Credito automotriz",
          familia: "credito",
          contratado: cliente.tieneCreditoAutomotriz,
          cifra: null,
          cifraEtiqueta: null,
          detalle: null,
        },
        {
          id: "hipotecario",
          tipo: "Credito hipotecario",
          familia: "credito",
          contratado: cliente.tieneCreditoHipotecario,
          cifra: null,
          cifraEtiqueta: null,
          detalle: null,
        },
        {
          id: "empresarial",
          tipo: "Credito empresarial",
          familia: "credito",
          contratado: cliente.tieneCreditoEmpresarial,
          cifra: null,
          cifraEtiqueta: null,
          detalle: null,
        },
        {
          id: "inversiones",
          tipo: "Inversiones",
          familia: "inversion",
          contratado: cliente.tieneInversiones,
          cifra: null,
          cifraEtiqueta: null,
          detalle: null,
        },
      ];

      return ok({
        clienteId: cliente.id,
        nombre: cliente.nombre,
        contratados: productos.filter((p) => p.contratado),
        noContratados: productos.filter((p) => !p.contratado).map((p) => p.tipo),
        resumen: {
          totalProductos: cliente.numeroProductosBancarios,
          antiguedadAnios: cliente.antiguedadClienteAnios,
          creditosActivos: cliente.creditosActivos,
          creditosLiquidados: cliente.creditosLiquidados,
          saldoTotalDeuda: cliente.saldoTotalDeuda,
          ingresoMensual: cliente.ingresoMensual,
          capacidadAhorroMensual: cliente.capacidadAhorroMensual,
          perfilFinanciero: cliente.perfilFinanciero,
          nivelAhorro: cliente.nivelAhorro,
          nivelEndeudamiento: cliente.nivelEndeudamiento,
          scoreCrediticio: cliente.scoreCrediticio,
          clasificacionCrediticia: cliente.clasificacionCrediticia,
          objetivoFinanciero: cliente.objetivoFinanciero,
          productoInteres: cliente.productoInteres,
        },
        limitacion:
          "El seed no trae el detalle por credito (monto, tasa, plazo ni mensualidad de cada uno). Di cuantos hay y su deuda total; no inventes cifras por credito.",
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
          nombre: c.nombreCompleto,
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
        "[read] Simula reestructurar el saldo de tarjeta de un cliente. Devuelve pago mensual, CAT, costo total e intereses por plazo. Usa SIEMPRE esta tool para los numeros: no los estimes. El clienteId es obligatorio y debe ser el mismo de get_financial_profile.",
      inputSchema: {
        clienteId: z
          .string()
          .describe("Obligatorio: el mismo que te devolvio get_financial_profile."),
        saldo: z
          .number()
          .positive()
          .optional()
          .describe("Solo si quieres simular un saldo distinto al del cliente."),
      },
    },
    async ({ clienteId, saldo }) => {
      // Sin id explicito se elegiria otro cliente al azar y los numeros de la
      // pantalla no cuadrarian con el perfil que ya mostro el agente.
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
    "get_eligible_cards",
    {
      description:
        "[read] LA TOOL PARA RECOMENDAR TARJETAS. Para un clienteId devuelve: (1) las tarjetas a las que SI califica, ya ordenadas por conveniencia y con la mejor marcada con recomendada:true, (2) las que no le tocan y por que, y (3) una alerta de endeudamiento. La elegibilidad y el puntaje los calcula el banco, no tu: copialos tal cual y limitate a explicarlos. Si alertaDeuda.desaconsejaNuevoCredito es true, la pantalla NO debe empujar contratacion.",
      inputSchema: {
        clienteId: z
          .string()
          .describe("Obligatorio. El mismo de get_financial_profile."),
        incluirNoElegibles: z
          .boolean()
          .optional()
          .describe("Por defecto true: sirve para explicarle al usuario que le falta."),
      },
    },
    async ({ clienteId, incluirNoElegibles }) => {
      const cliente = getCliente(clienteId);
      if (!cliente) {
        return fail(
          `No existe el cliente "${clienteId}". Pasa el mismo id que te dio get_financial_profile.`,
        );
      }

      const evaluadas = tarjetasCredito.map((producto) => {
        const elegibilidad = evaluarElegibilidad(cliente, producto);
        const { puntaje, factores } = puntuar(cliente, producto);
        return {
          id: producto.producto,
          nombre: producto.nombreDisplay,
          imagen: producto.imagen,
          bullets: producto.bullets,
          cat: producto.catPromedio,
          anualidad: producto.comisionAnual,
          ingresoMinimo: producto.ingresoMinimo,
          segmento: producto.segmento,
          perfilObjetivo: producto.perfilObjetivo,
          requisitos: producto.requisitos,
          fuente: producto.fuente,
          fechaVerificacion: producto.fechaVerificacion,
          elegible: elegibilidad.elegible,
          bloqueos: elegibilidad.bloqueos,
          cumple: elegibilidad.cumple,
          puntaje,
          factoresPuntaje: factores,
        };
      });

      const elegibles = evaluadas
        .filter((t) => t.elegible)
        .sort((a, b) => b.puntaje - a.puntaje)
        .map((t, i) => ({ ...t, recomendada: i === 0 }));

      const noElegibles = incluirNoElegibles === false ? [] : evaluadas.filter((t) => !t.elegible);
      const alertaDeuda = evaluarRiesgoDeuda(cliente);

      return ok({
        clienteId: cliente.id,
        nombre: cliente.nombre,
        totalEvaluadas: evaluadas.length,
        elegibles,
        noElegibles,
        alertaDeuda,
        nota: "Elegibilidad y puntaje calculados por el banco a partir de los requisitos publicados. El puntaje es un criterio de conveniencia del asesor, no una preaprobacion.",
        synthetic: false,
      });
    },
  );

  server.registerTool(
    "get_card_catalog",
    {
      description:
        "[read] Catalogo de tarjetas de credito Banorte: nombreDisplay, imagen del plastico, bullets de beneficios, CAT, tasa, comision anual, MSI, requisitos y la fuente oficial. Usalo para CardShowcase y CardRanking. Copia imagen, cat y anualidad tal cual: no los reescribas.",
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

/**
 * Datos del asesor. Se leen de los CSV de `apps/mcp/seed/` al arrancar.
 *
 * Regla dura de AGENTS.md #6: nada de datos reales de clientes. El padron sale
 * de `clientes_sintetico.csv`, generado sinteticamente. El catalogo de tarjetas
 * SI es informacion publica y real de producto (no de personas), y cada fila
 * trae su `fuente` y su `fecha_verificacion` para poder citarla en pantalla.
 *
 * En fase 3 esto se mueve a Postgres con un seed reproducible; la forma de las
 * respuestas de las tools no deberia cambiar cuando pase.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SYNTHETIC = true;

/* ------------------------------------------------------------------ */
/* Lectura de CSV                                                      */
/* ------------------------------------------------------------------ */

/**
 * Parser minimo pero correcto: respeta comillas dobles, comas dentro de
 * comillas y saltos de linea dentro de un campo. El catalogo de tarjetas tiene
 * textos largos con comas, asi que un `split(",")` no alcanza.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((key, i) => [key.trim(), (r[i] ?? "").trim()])));
}

function readSeed(file: string): Record<string, string>[] {
  const path = fileURLToPath(new URL(`../seed/${file}`, import.meta.url));
  return parseCsv(readFileSync(path, "utf8"));
}

/** "No aplica", "" y basura -> null. Nunca un 0 inventado. */
function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

function bool(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "sí" || value?.trim().toLowerCase() === "si";
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export type Cliente = {
  id: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
  tipoCliente: string;
  /** "Femenino" | "Masculino" | "No aplica" | "Otro/Prefiere no decir". */
  sexo: string;
  edad: number | null;
  ingresoMensual: number | null;
  gastosMensuales: number | null;
  capacidadAhorroMensual: number | null;
  tieneTarjetaCredito: boolean;
  saldoTarjeta: number | null;
  limiteCredito: number | null;
  usoLimitePct: number | null;
  gastoMensualTarjeta: number | null;
  saldoTotalDeuda: number | null;
  scoreCrediticio: number | null;
  clasificacionCrediticia: string;
  nivelEndeudamiento: string;
  nivelRiesgoCrediticio: string;
  pagosAtrasados12m: number | null;
  tieneCreditosVencidos: boolean;
  reestructuraPrevia: boolean;
  objetivoFinanciero: string;
  productoInteres: string;
};

export const clientes: Cliente[] = readSeed("clientes_sintetico_con_nombres.csv").map((r) => ({
  id: r.cliente_id,
  nombre: r.nombre,
  apellidoPaterno: r.apellido_paterno,
  apellidoMaterno: r.apellido_materno,
  nombreCompleto: r.nombre_completo,
  tipoCliente: r.tipo_cliente,
  sexo: r.sexo,
  edad: num(r.edad),
  ingresoMensual: num(r.ingreso_mensual_mxn) ?? num(r.ventas_mensuales_mxn),
  gastosMensuales: num(r.gastos_mensuales_mxn),
  capacidadAhorroMensual: num(r.capacidad_ahorro_mensual_mxn),
  tieneTarjetaCredito: bool(r.tiene_tarjeta_credito),
  saldoTarjeta: num(r.saldo_tarjeta_credito_mxn),
  limiteCredito: num(r.limite_credito_mxn),
  usoLimitePct: num(r.porcentaje_uso_limite_credito),
  gastoMensualTarjeta: num(r.gasto_mensual_tarjeta_mxn),
  saldoTotalDeuda: num(r.saldo_total_deuda_mxn),
  scoreCrediticio: num(r.score_crediticio),
  clasificacionCrediticia: r.clasificacion_crediticia,
  nivelEndeudamiento: r.nivel_endeudamiento,
  nivelRiesgoCrediticio: r.nivel_riesgo_crediticio,
  pagosAtrasados12m: num(r.pagos_atrasados_ultimos_12_meses),
  tieneCreditosVencidos: bool(r.tiene_creditos_vencidos),
  reestructuraPrevia: bool(r.reestructuracion_deuda_previa),
  objetivoFinanciero: r.principal_objetivo_financiero,
  productoInteres: r.producto_interes,
}));

/**
 * Cliente de respaldo: persona fisica, 96.4% de su limite usado y "Pagar
 * deudas" como objetivo. Es el caso que mejor cuenta la historia de
 * reestructura, y el que se usa cuando el modo aleatorio esta apagado.
 */
export const DEFAULT_CLIENTE_ID = "CLI131";

export const clientesConTarjeta = clientes.filter(
  (c) => c.tieneTarjetaCredito && (c.saldoTarjeta ?? 0) > 0,
);

/**
 * Universo del que sale el cliente al azar de la demo.
 *
 * Solo personas fisicas: una persona moral tiene razon social en vez de nombre
 * de pila, y el asesor termina tuteando a "Grupo Empresarial del Bajio SA de
 * CV". El reto es asesoria financiera personal, asi que las empresas siguen
 * disponibles por clienteId pero no salen sorteadas.
 */
export const clientesDemo = clientesConTarjeta.filter(
  (c) => c.tipoCliente.toLowerCase().startsWith("persona f"),
);

/**
 * Modo demo: sin clienteId, cada consulta toma un cliente distinto al azar.
 *
 * Existe SOLO para la demo, donde no hay sesion y queremos que dos preguntas
 * seguidas no cuenten la misma historia. En una app real el cliente sale del
 * usuario autenticado y esto no aplica: apagalo con DEMO_RANDOM_CLIENT=false.
 *
 * Ojo importante: el azar es por LLAMADA, no por conversacion. Si el agente
 * pide el perfil y luego simula sin pasar el clienteId que recibio, mezclaria
 * dos clientes distintos en la misma pantalla. Por eso simulate_restructure
 * exige el id explicitamente en vez de elegir uno por su cuenta.
 */
export const DEMO_RANDOM_CLIENTE = process.env.DEMO_RANDOM_CLIENT !== "false";

function clienteAlAzar(): Cliente | undefined {
  const pool =
    clientesDemo.length > 0
      ? clientesDemo
      : clientesConTarjeta.length > 0
        ? clientesConTarjeta
        : clientes;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Cliente de la conversacion en curso.
 *
 * Sortear en CADA llamada era un bug: al picar un boton de la pantalla
 * generada se dispara otra consulta, el agente volvia a pedir el perfil y le
 * tocaba otra persona. Resultado: una pantalla que saludaba a Fernando arriba
 * y a Carmen abajo, con cifras de dos personas mezcladas.
 *
 * Ahora el sorteo ocurre una sola vez y se conserva hasta que alguien pida
 * explicitamente un caso nuevo (nuevoCaso), lo cual hace el endpoint del
 * agente solo cuando el usuario escribe una consulta desde la barra.
 */
let clienteSesion: Cliente | undefined;

export function rotarClienteSesion(): Cliente | undefined {
  clienteSesion = DEMO_RANDOM_CLIENTE
    ? clienteAlAzar()
    : clientes.find((c) => c.id === DEFAULT_CLIENTE_ID);
  return clienteSesion;
}

export function getCliente(id?: string, nuevoCaso = false): Cliente | undefined {
  if (id) {
    const buscado = id.trim().toUpperCase();
    return clientes.find((c) => c.id.toUpperCase() === buscado);
  }
  if (nuevoCaso || !clienteSesion) return rotarClienteSesion();
  return clienteSesion;
}

/* ------------------------------------------------------------------ */
/* Catalogo de tarjetas                                                */
/* ------------------------------------------------------------------ */

export type ProductoTarjeta = {
  categoria: string;
  producto: string;
  /** Nombre como aparece en el sitio; es el que ve el usuario. */
  nombreDisplay: string;
  /** Beneficios cortos, tal cual los publica Banorte. */
  bullets: string[];
  /** Ruta de la imagen del plastico dentro de apps/web/public. */
  imagen: string;
  segmento: string;
  tipoCliente: string;
  red: string;
  ingresoMinimo: number | null;
  /** Texto libre del CSV: "18 a 69 años 11 meses", "18+", "Mayor de edad"... */
  edadRequisito: string;
  comisionAnual: number | null;
  catPromedio: number | null;
  tasaPromedio: number | null;
  beneficios: string;
  msi: string;
  requisitos: string;
  perfilObjetivo: string;
  fuente: string;
  fechaVerificacion: string;
};

export const catalogoTarjetas: ProductoTarjeta[] = readSeed("catalogo_tarjetas.csv").map((r) => ({
  categoria: r.categoria,
  producto: r.producto,
  nombreDisplay: r.nombre_display || r.producto,
  bullets: (r.bullets || "").split("|").map((b) => b.trim()).filter(Boolean),
  imagen: r.imagen || "",
  segmento: r.segmento,
  tipoCliente: r.tipo_cliente,
  red: r.red,
  ingresoMinimo: num(r.ingreso_min_mxn),
  edadRequisito: r.edad || "",
  comisionAnual: num(r.comision_admin_anual_mxn_sin_iva),
  catPromedio: num(r.cat_promedio_pct),
  tasaPromedio: num(r.tasa_promedio_pct),
  beneficios: r.beneficios,
  msi: r.msi_financiamiento,
  requisitos: r.requisitos,
  perfilObjetivo: r.perfil_objetivo,
  fuente: r.fuente,
  fechaVerificacion: r.fecha_verificacion,
}));

/**
 * Solo tarjetas de credito para PERSONA, no lineas empresariales.
 *
 * El filtro anterior era `includes("crédito")`, que tambien dejaba pasar
 * "Credito empresarial": el asesor termino recomendandole "Credito Empuje
 * Negocios" y "Tarjeta Corporativa" a una persona fisica asalariada. El reto
 * es asesoria personal, asi que el universo son las 12 tarjetas del sitio.
 */
export const tarjetasCredito = catalogoTarjetas.filter(
  (t) => t.categoria.toLowerCase() === "crédito personal",
);

/* ------------------------------------------------------------------ */
/* Supuestos del producto — NO salen de ningun CSV                     */
/* ------------------------------------------------------------------ */

/**
 * Plazos de reestructura que ofreceria el banco. El CSV de clientes no trae
 * ofertas de reestructura, asi que esto es un supuesto del equipo, no un dato.
 * Marcado aparte a proposito para que nadie lo confunda con informacion real.
 */
export const plazosReestructura = [
  { meses: 12, cat: 0.324 },
  { meses: 18, cat: 0.341 },
  { meses: 24, cat: 0.36 },
];

/**
 * Pago minimo: el CSV no lo trae por cliente. En Mexico ronda el 10% del saldo
 * mas intereses; usamos 10% plano y lo reportamos como supuesto, no como dato.
 */
export const PAGO_MINIMO_PCT = 0.1;

export function pagoMinimoEstimado(saldo: number): number {
  return Math.round(saldo * PAGO_MINIMO_PCT);
}

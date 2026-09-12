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
  tipoCliente: string;
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
  reestructuraPrevia: boolean;
  objetivoFinanciero: string;
  productoInteres: string;
};

export const clientes: Cliente[] = readSeed("clientes_sintetico.csv").map((r) => ({
  id: r.cliente_id,
  tipoCliente: r.tipo_cliente,
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
  reestructuraPrevia: bool(r.reestructuracion_deuda_previa),
  objetivoFinanciero: r.principal_objetivo_financiero,
  productoInteres: r.producto_interes,
}));

/**
 * Cliente por defecto de la demo: persona fisica, 96.4% de su limite usado y
 * "Pagar deudas" como objetivo. Es el caso que mejor cuenta la historia de
 * reestructura. Se puede pedir cualquier otro por clienteId.
 */
export const DEFAULT_CLIENTE_ID = "CLI131";

export function getCliente(id?: string): Cliente | undefined {
  if (!id) return clientes.find((c) => c.id === DEFAULT_CLIENTE_ID);
  const buscado = id.trim().toUpperCase();
  return clientes.find((c) => c.id.toUpperCase() === buscado);
}

export const clientesConTarjeta = clientes.filter(
  (c) => c.tieneTarjetaCredito && (c.saldoTarjeta ?? 0) > 0,
);

/* ------------------------------------------------------------------ */
/* Catalogo de tarjetas                                                */
/* ------------------------------------------------------------------ */

export type ProductoTarjeta = {
  categoria: string;
  producto: string;
  segmento: string;
  tipoCliente: string;
  red: string;
  ingresoMinimo: number | null;
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
  segmento: r.segmento,
  tipoCliente: r.tipo_cliente,
  red: r.red,
  ingresoMinimo: num(r.ingreso_min_mxn),
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

export const tarjetasCredito = catalogoTarjetas.filter((t) =>
  t.categoria.toLowerCase().includes("crédito"),
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

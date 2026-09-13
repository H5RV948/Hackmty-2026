/**
 * Salud financiera y planes de ahorro: calculo del banco, no del modelo.
 *
 * Mismo principio que finance.ts y eligibility.ts: el modelo decide QUE
 * mostrar; cuanto vale cada indicador lo decide este archivo. Si el modelo
 * inventara el "finance score" de alguien, la barra de progreso mentiria con
 * toda la autoridad visual de una grafica.
 *
 * Nada de esto es una calificacion oficial. Es un indicador del reto con
 * reglas visibles, y cada componente trae su `nota` con la cifra que lo
 * explica para que la pantalla nunca muestre un numero sin su por que.
 */
import type { Cliente, MesHistorial } from "./data.js";

const acotar = (x: number, min = 0, max = 100) => Math.min(max, Math.max(min, x));

/** 0 en `peor`, 100 en `mejor`, lineal en medio. Funciona en ambos sentidos. */
function escala(valor: number, peor: number, mejor: number): number {
  if (peor === mejor) return valor >= mejor ? 100 : 0;
  return acotar(((valor - peor) / (mejor - peor)) * 100);
}

export type ComponenteSalud = {
  id: string;
  label: string;
  /** 0 a 100. */
  valor: number;
  /** Peso en el total, 0 a 1. */
  peso: number;
  nota: string;
};

export type SaludFinanciera = {
  total: number;
  maximo: 100;
  nivel: "saludable" | "estable" | "en riesgo" | "critico";
  componentes: ComponenteSalud[];
};

export function calcularSaludFinanciera(c: Cliente, h: MesHistorial[]): SaludFinanciera {
  const ultimo = h[h.length - 1];
  const primero = h[0];

  const ingreso = ultimo?.ingreso ?? c.ingresoMensual ?? 0;
  const ahorro = ultimo?.ahorro ?? c.capacidadAhorroMensual ?? 0;
  const tasaAhorro = ingreso > 0 ? (ahorro / ingreso) * 100 : 0;

  const uso = ultimo?.usoLimitePct ?? c.usoLimitePct ?? 0;
  const atrasos = c.pagosAtrasados12m ?? 0;
  const score = ultimo?.scoreCrediticio ?? c.scoreCrediticio ?? 300;

  const acumIni = primero?.ahorroAcumulado ?? null;
  const acumFin = ultimo?.ahorroAcumulado ?? null;
  const crecimiento =
    acumIni !== null && acumFin !== null && acumIni > 0 ? ((acumFin - acumIni) / acumIni) * 100 : null;

  const componentes: ComponenteSalud[] = [
    {
      id: "ahorro",
      label: "Capacidad de ahorro",
      // Ahorrar el 20% del ingreso es la referencia habitual de un presupuesto sano.
      valor: Math.round(escala(tasaAhorro, 0, 20)),
      peso: 0.25,
      nota: `Te queda libre el ${Math.round(tasaAhorro)}% de tu ingreso al mes.`,
    },
    {
      id: "uso",
      label: "Uso de tu linea de credito",
      // Por debajo de 30% no pesa en contra; arriba de 90% es sobreendeudamiento.
      valor: Math.round(escala(uso, 90, 30)),
      peso: 0.25,
      nota: `Usas el ${Math.round(uso)}% de tu limite.`,
    },
    {
      id: "puntualidad",
      label: "Puntualidad en tus pagos",
      valor: atrasos === 0 ? 100 : atrasos === 1 ? 70 : atrasos === 2 ? 45 : atrasos <= 4 ? 15 : 0,
      peso: 0.2,
      nota:
        atrasos === 0
          ? "Sin pagos atrasados en los ultimos 12 meses."
          : `${atrasos} pago(s) atrasado(s) en los ultimos 12 meses.`,
    },
    {
      id: "score",
      label: "Score crediticio",
      valor: Math.round(escala(score, 300, 850)),
      peso: 0.2,
      nota: `Tu score es ${Math.round(score)} de 850.`,
    },
    {
      id: "tendencia",
      label: "Tendencia de tu ahorro",
      valor: crecimiento === null ? 50 : Math.round(escala(crecimiento, -10, 20)),
      peso: 0.1,
      nota:
        crecimiento === null
          ? "Sin historial suficiente para ver la tendencia."
          : `Tu ahorro ${crecimiento >= 0 ? "crecio" : "bajo"} ${Math.abs(Math.round(crecimiento))}% desde enero.`,
    },
  ];

  const total = Math.round(componentes.reduce((s, k) => s + k.valor * k.peso, 0));
  const nivel = total >= 75 ? "saludable" : total >= 50 ? "estable" : total >= 30 ? "en riesgo" : "critico";

  return { total, maximo: 100, nivel, componentes };
}

export type PlanAhorro = {
  id: string;
  nombre: string;
  acumulado: number;
  meta: number;
  progresoPct: number;
  /** Promedio mensual de avance en el periodo; negativo si va para atras. */
  avanceMensual: number;
  /** Meses que faltan al ritmo actual; null si a este ritmo no se llega. */
  mesesParaMeta: number | null;
  nota: string;
};

export function planesDeAhorro(c: Cliente, h: MesHistorial[]): PlanAhorro[] {
  const planes: PlanAhorro[] = [];
  if (h.length === 0) return planes;
  const ultimo = h[h.length - 1];
  const periodos = Math.max(1, h.length - 1);

  /*
   * Fondo de emergencia: tres meses de gasto. Es el primer plan que tiene
   * sentido para cualquiera, y la meta sale de su propio gasto, no de una
   * cifra generica.
   */
  const gastos = ultimo.gastos ?? c.gastosMensuales ?? 0;
  const acumulado = ultimo.ahorroAcumulado ?? 0;
  if (gastos > 0) {
    const meta = Math.round(gastos * 3);
    const avance = ((ultimo.ahorroAcumulado ?? 0) - (h[0].ahorroAcumulado ?? 0)) / periodos;
    const falta = Math.max(0, meta - acumulado);
    const meses = falta === 0 ? 0 : avance > 0 ? Math.ceil(falta / avance) : null;
    planes.push({
      id: "emergencia",
      nombre: "Fondo de emergencia (3 meses de gasto)",
      acumulado: Math.round(acumulado),
      meta,
      progresoPct: Math.round(acotar((acumulado / meta) * 100)),
      avanceMensual: Math.round(avance),
      mesesParaMeta: meses,
      nota:
        meses === 0
          ? "Ya tienes cubiertos tres meses de gasto."
          : meses === null
            ? "A tu ritmo actual este fondo no esta creciendo."
            : `A tu ritmo actual lo completas en ${meses} ${meses === 1 ? "mes" : "meses"}.`,
    });
  }

  /*
   * Liquidar la tarjeta, medido contra su pico del periodo. Si el saldo de hoy
   * ES el pico, el progreso es cero y la nota lo dice: no se maquilla una
   * deuda que va creciendo.
   */
  const saldos = h.map((m) => m.saldoTarjeta ?? 0);
  const pico = Math.max(...saldos);
  const actual = ultimo.saldoTarjeta ?? 0;
  if (pico > 0) {
    const bajado = pico - actual;
    const idxPico = saldos.indexOf(pico);
    const mesesDesdePico = Math.max(1, h.length - 1 - idxPico);
    const ritmo = bajado / mesesDesdePico;
    const meses = actual === 0 ? 0 : ritmo > 0 ? Math.ceil(actual / ritmo) : null;
    planes.push({
      id: "tarjeta",
      nombre: "Liquidar tu tarjeta de credito",
      acumulado: Math.round(bajado),
      meta: Math.round(pico),
      progresoPct: Math.round(acotar((bajado / pico) * 100)),
      avanceMensual: Math.round(ritmo),
      mesesParaMeta: meses,
      nota:
        actual === 0
          ? "Tu tarjeta esta en cero."
          : meses === null
            ? `Tu saldo esta en su punto mas alto desde ${h[idxPico].etiqueta}: no ha bajado.`
            : `Has bajado ${Math.round((bajado / pico) * 100)}% desde tu pico de ${h[idxPico].etiqueta}.`,
    });
  }

  return planes;
}

/**
 * Calculo financiero. Vive aqui y no en el LLM: el modelo decide que mostrar,
 * la herramienta decide cuanto cuesta. Si el modelo inventa numeros, perdemos.
 */

/** Pago mensual de una anualidad simple. */
export function pagoMensual(saldo: number, tasaAnual: number, meses: number): number {
  const i = tasaAnual / 12;
  if (i === 0) return saldo / meses;
  return (saldo * i) / (1 - Math.pow(1 + i, -meses));
}

export type Amortizacion = {
  meses: number;
  cat: number;
  pagoMensual: number;
  costoTotal: number;
  interesesTotales: number;
};

export function simularReestructura(
  saldo: number,
  opciones: { meses: number; cat: number }[],
): Amortizacion[] {
  return opciones.map(({ meses, cat }) => {
    const pago = pagoMensual(saldo, cat, meses);
    const costoTotal = pago * meses;
    return {
      meses,
      cat: Number((cat * 100).toFixed(1)),
      pagoMensual: Math.round(pago),
      costoTotal: Math.round(costoTotal),
      interesesTotales: Math.round(costoTotal - saldo),
    };
  });
}

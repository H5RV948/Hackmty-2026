/**
 * Datos sinteticos. Regla dura de AGENTS.md: nada real, todo marcado.
 * En fase 3 esto se mueve a Postgres con un seed reproducible.
 */
export const SYNTHETIC = true;

export const cliente = {
  id: "cli-001",
  nombre: "Ana",
  ingresoMensual: 24500,
  gastoPromedioMensual: 19800,
};

export const tarjetas = [
  {
    id: "tdc-001",
    producto: "Tarjeta Clasica",
    saldo: 18400,
    limite: 30000,
    tasaAnual: 0.42,
    cat: 0.478,
    pagoMinimo: 1840,
    interesesUltimoMes: 497,
  },
];

export const cuentas = [
  { id: "deb-001", producto: "Cuenta de nomina", saldo: 12300 },
];

/** Plazos que el banco ofrece para reestructura, con su CAT. */
export const plazosReestructura = [
  { meses: 12, cat: 0.324 },
  { meses: 18, cat: 0.341 },
  { meses: 24, cat: 0.36 },
];

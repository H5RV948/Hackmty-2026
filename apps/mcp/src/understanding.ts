/**
 * Estado del entendimiento del usuario.
 *
 * El ciclo adaptativo del reto no se sostiene solo con prompt: necesitamos
 * saber que sabemos, con cuanta confianza, y cual es la siguiente pregunta
 * que mas informacion aporta.
 */
export type Slot<T> = { value: T | null; confidence: number; source: string };

export type UserUnderstanding = {
  objetivo: Slot<string>;
  horizonte: Slot<number>;
  capacidadPago: Slot<number>;
  toleranciaRiesgo: Slot<"baja" | "media" | "alta">;
  prioridades: Slot<string[]>;
};

export const emptyUnderstanding = (): UserUnderstanding => ({
  objetivo: { value: null, confidence: 0, source: "" },
  horizonte: { value: null, confidence: 0, source: "" },
  capacidadPago: { value: null, confidence: 0, source: "" },
  toleranciaRiesgo: { value: null, confidence: 0, source: "" },
  prioridades: { value: null, confidence: 0, source: "" },
});

/** Peso de cada slot en la recomendacion final. */
const IMPACT: Record<keyof UserUnderstanding, number> = {
  objetivo: 1.0,
  capacidadPago: 0.9,
  horizonte: 0.7,
  toleranciaRiesgo: 0.5,
  prioridades: 0.4,
};

export const UMBRAL_CONFIANZA = 0.7;

/** Slot con mayor ganancia de informacion: (1 - confianza) * impacto. */
export function nextSlotToAsk(u: UserUnderstanding): keyof UserUnderstanding | null {
  const candidates = (Object.keys(IMPACT) as (keyof UserUnderstanding)[])
    .map((slot) => ({ slot, gain: (1 - u[slot].confidence) * IMPACT[slot] }))
    .filter(({ slot }) => u[slot].confidence < UMBRAL_CONFIANZA)
    .sort((a, b) => b.gain - a.gain);
  return candidates[0]?.slot ?? null;
}

/** Listo para validar el entendimiento con el usuario. */
export function isReadyToSummarize(u: UserUnderstanding): boolean {
  return (["objetivo", "capacidadPago", "horizonte"] as const).every(
    (slot) => u[slot].confidence >= UMBRAL_CONFIANZA,
  );
}

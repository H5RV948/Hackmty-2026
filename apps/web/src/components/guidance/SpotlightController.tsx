"use client";

/**
 * Spotlight agentico: el agente decide que resaltar via `updateGuidance`.
 *
 * Apunta a los data-a2ui-id que pone el renderer. Mientras el tour corre, el
 * grid queda bloqueado (driver.js calcula posiciones absolutas y un drag
 * desalinea el overlay).
 */
import { useEffect, useRef } from "react";
import type { GuidanceStep } from "@banorte/a2ui";

type Props = {
  steps: GuidanceStep[] | null;
  trigger?: "auto" | "manual";
  onStart?: () => void;
  onFinish?: () => void;
};

export function SpotlightController({ steps, trigger = "auto", onStart, onFinish }: Props) {
  const activeRef = useRef(false);

  useEffect(() => {
    if (!steps || steps.length === 0 || trigger !== "auto" || activeRef.current) return;

    let cancelled = false;

    (async () => {
      const { driver } = await import("driver.js");
      if (cancelled) return;

      const tour = driver({
        showProgress: steps.length > 1,
        allowClose: true,
        nextBtnText: "Siguiente",
        prevBtnText: "Atras",
        doneBtnText: "Entendido",
        steps: steps.map((step) => ({
          element: `[data-a2ui-id="${step.targetId}"]`,
          popover: {
            title: step.title,
            description: step.body,
            side: step.side ?? "bottom",
          },
        })),
        onDestroyed: () => {
          activeRef.current = false;
          onFinish?.();
        },
      });

      activeRef.current = true;
      onStart?.();
      // Un frame de margen: el grid ya coloco los widgets.
      requestAnimationFrame(() => tour.drive());
    })();

    return () => {
      cancelled = true;
    };
  }, [steps, trigger, onStart, onFinish]);

  return null;
}

"use client";

import { useCallback, useState } from "react";
import type { A2UIMessage, ClientEvent } from "@banorte/a2ui";
import { ModularCanvas } from "@/components/ModularCanvas";
import { SpotlightController } from "@/components/guidance/SpotlightController";
import { useCanvas } from "@/lib/surfaceStore";

export default function Home() {
  const { state, applyMessage, setLayout, dismissGuidance } = useCanvas();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  /** Manda contexto al agente y aplica los mensajes A2UI que regresan. */
  const send = useCallback(
    async (event: ClientEvent) => {
      setThinking(true);
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, surfaces: Object.keys(state.surfaces) }),
        });
        if (!response.body) return;

        // Stream de mensajes A2UI, uno por linea (NDJSON).
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            applyMessage(JSON.parse(line) as A2UIMessage);
          }
        }
      } finally {
        setThinking(false);
      }
    },
    [applyMessage, state.surfaces],
  );

  const onEvent = useCallback(
    (event: ClientEvent) => {
      // El reacomodo del canvas no debe disparar una regeneracion de UI.
      if (event.type === "canvas_layout_changed") return;
      void send(event);
    },
    [send],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Tu asesor financiero</h1>
        <p className="mt-1 max-w-[62ch] text-sm text-muted">
          Cuentame que quieres resolver. Armo la pantalla contigo y la vamos
          ajustando conforme entienda mejor tu situacion.
        </p>
      </header>

      <div className="mb-8 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              void send({ type: "user_message", text: input.trim() });
              setInput("");
            }
          }}
          placeholder="Quiero pagar menos intereses de mi tarjeta"
          className="flex-1 rounded-full border border-line bg-surface px-5 py-3 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          disabled={!input.trim() || thinking}
          onClick={() => {
            void send({ type: "user_message", text: input.trim() });
            setInput("");
          }}
          className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {thinking ? "Analizando" : "Preguntar"}
        </button>
      </div>

      <ModularCanvas
        surfaces={state.surfaces}
        order={state.order}
        layout={state.layout}
        editable={state.layoutEditable && !tourActive}
        onEvent={onEvent}
        onLayoutChange={setLayout}
      />

      <SpotlightController
        steps={state.guidance?.steps ?? null}
        trigger={state.guidance?.trigger}
        onStart={() => setTourActive(true)}
        onFinish={() => {
          setTourActive(false);
          dismissGuidance();
        }}
      />
    </main>
  );
}

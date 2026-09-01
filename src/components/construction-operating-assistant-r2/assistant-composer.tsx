"use client";

import { useActionState, useRef } from "react";
import {
  submitOperatingAssistantCommand,
  type OperatingAssistantActionState,
} from "@/server/actions/construction-operating-assistant-r2";

const initialState: OperatingAssistantActionState = {
  ok: true,
  reply: "Je garde le contexte opérationnel; dites-moi ce qui doit arriver.",
};

const EXAMPLES = [
  "Qu’est-ce que j’ai aujourd’hui?",
  "Rappelle-moi mardi à 9 h d’appeler Marc pour Laval.",
  "Texte Marc que je serai 30 minutes en retard.",
];

export function OperatingAssistantComposer({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(submitOperatingAssistantCommand, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        const commandId = event.currentTarget.elements.namedItem("commandId");
        if (commandId instanceof HTMLInputElement) commandId.value = crypto.randomUUID();
      }}
      className="rounded-2xl border border-[#D87526]/35 bg-[#111317] p-4 shadow-2xl sm:p-5"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="commandId" />
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[#D87526]/60 bg-[#D87526]/10 font-mono text-sm text-[#FFCB7A]">AI</span>
        <div>
          <h2 className="font-semibold text-white">Parler à ENDVERA</h2>
          <p className="text-xs text-[#8A9099]">Le message devient une action, un rappel ou une réponse sourcée.</p>
        </div>
      </div>
      <textarea
        name="body"
        required
        maxLength={10_000}
        rows={4}
        className="mt-4 w-full resize-y rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-base text-white outline-none placeholder:text-white/35 focus:border-[#D87526]"
        placeholder="Ex.: Qu’est-ce que j’ai aujourd’hui?"
      />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              const field = formRef.current?.elements.namedItem("body");
              if (field instanceof HTMLTextAreaElement) {
                field.value = example;
                field.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }}
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#B7BDC7] hover:border-[#C9A76A]/60 hover:text-white"
          >
            {example}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className={`whitespace-pre-line text-sm ${state.ok ? "text-[#B7BDC7]" : "text-[#FF9A8B]"}`}>
          {state.reply}
        </p>
        <button
          disabled={pending}
          className="min-h-12 shrink-0 rounded-xl bg-[#D87526] px-6 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "ENDVERA travaille…" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}

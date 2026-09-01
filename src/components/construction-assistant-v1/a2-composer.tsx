"use client";

import { useActionState } from "react";
import {
  submitA2ConstructionMessage,
  type ConstructionActionResult,
} from "@/server/actions/construction-assistant-v1";

const initial: ConstructionActionResult = { ok: true, message: "Dites-moi ce qui doit arriver sur le chantier." };

export function A2ConstructionComposer({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(submitA2ConstructionMessage, initial);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const field = event.currentTarget.elements.namedItem("requestId");
        if (field instanceof HTMLInputElement) field.value = crypto.randomUUID();
      }}
      className="rounded-xl border border-[#C9A76A]/25 bg-[#111317] p-4 shadow-xl"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="requestId" />
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full border border-[#D87526]/50 bg-[#D87526]/10 font-mono text-sm text-[#FFCB7A]">A2</span>
        <div>
          <p className="text-sm font-semibold text-[#F7F6F3]">Parler à ENDVERA</p>
          <p className="text-xs text-[#8A9099]">Le modèle interprète. La base de données garde la vérité.</p>
        </div>
      </div>
      <textarea
        name="body"
        required
        maxLength={4000}
        rows={3}
        className="mt-4 w-full resize-y rounded-lg border border-white/15 bg-white/[0.06] px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#D87526]"
        placeholder="Ex.: Le travail de l’extra cuisine est terminé pour Rénovation Laval, 1 200 $. Le client dit que c’est approuvé."
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={`text-sm ${state.ok ? "text-[#B7BDC7]" : "text-[#FF9A8B]"}`}>{state.message}</p>
        <button disabled={pending} className="min-h-10 rounded-md bg-[#D87526] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Analyse…" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}

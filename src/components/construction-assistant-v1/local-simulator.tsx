"use client";

import { useActionState, useState } from "react";
import {
  submitLocalConstructionSimulation,
  type ConstructionActionResult,
} from "@/server/actions/construction-assistant-v1";

const initial: ConstructionActionResult = { ok: true, message: "Aucun réseau: ce simulateur reproduit seulement l’enveloppe provider-neutral." };

export function LocalConstructionSimulator({ workspaceId }: { workspaceId: string }) {
  const [providerMessageId, setProviderMessageId] = useState(() => `local-${crypto.randomUUID()}`);
  const [state, action, pending] = useActionState(submitLocalConstructionSimulation, initial);
  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="block text-xs font-medium uppercase tracking-wider text-[#A1A8B3]">Canal local
        <select name="channel" className="mt-2 block w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white">
          <option value="SMS">SMS simulé</option><option value="EMAIL">Courriel simulé</option>
        </select>
      </label>
      <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-[#A1A8B3]">ID provider (réutilisez-le pour tester le rejeu)
        <input name="providerMessageId" value={providerMessageId} onChange={(e) => setProviderMessageId(e.target.value)} className="mt-2 block w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white" />
      </label>
      <textarea name="body" required rows={3} maxLength={4000} className="mt-3 w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white" placeholder="Message SMS/courriel synthétique" />
      <div className="mt-3 flex items-center justify-between gap-3"><p aria-live="polite" className="text-xs text-[#A1A8B3]">{state.message}</p><button disabled={pending} className="rounded-md border border-[#C9A76A] px-3 py-2 text-sm text-[#E2C486]">Injecter localement</button></div>
    </form>
  );
}

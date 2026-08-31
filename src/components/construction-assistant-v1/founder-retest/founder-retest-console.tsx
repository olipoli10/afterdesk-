"use client";

import { useActionState } from "react";
import {
  FOUNDER_RETEST_STEPS,
  type RetestActionState,
} from "./contract";
import {
  runFounderRetestStep,
  submitFounderRetestObservation,
} from "@/server/actions/construction-assistant-v1-r3-retest";

function StatusPill({ good, children }: { good: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/5 text-white/60"}`}>{children}</span>;
}

export function FounderRetestConsole({ initialState }: { initialState: RetestActionState }) {
  const [state, stepAction, stepPending] = useActionState(runFounderRetestStep, initialState);
  const [finalState, finalAction, finalPending] = useActionState(submitFounderRetestObservation, state);
  const displayed = finalState.sealedVerdict ? finalState : state;
  const step = FOUNDER_RETEST_STEPS.find((candidate) => candidate.number === displayed.currentStep);
  const projection = displayed.projection;

  return (
    <main className="space-y-6 py-8">
      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">Test local — aucun vrai SMS ne sera envoyé</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Re-test Construction Assistant</h1>
        <p className="mt-2 max-w-3xl text-white/65">Tout se fait ici. ENDVERA conserve le dossier Laval, les identifiants techniques et l’ordre des actions pour vous.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill good>PostgreSQL local jetable</StatusPill>
          <StatusPill good>Marc — fournisseur synthétique</StatusPill>
          <StatusPill good>Zéro transport externe</StatusPill>
        </div>
      </section>

      {displayed.sealedVerdict ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6">
          <h2 className="text-2xl font-semibold text-white">Test terminé</h2>
          <p className="mt-2 text-emerald-100">{displayed.message}</p>
          <p className="mt-3 font-mono text-sm text-white/70">{displayed.sealedVerdict}</p>
        </section>
      ) : step ? (
        <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
          <p className="text-sm uppercase tracking-[0.16em] text-white/50">Étape {step.number} sur 9</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{step.title}</h2>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-lg text-white">{step.message}</div>

          {step.number === 7 && projection?.outboundPreview ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 sm:grid-cols-2">
              <div><span className="text-white/50">Destinataire</span><p className="font-semibold text-white">{projection.outboundPreview.recipientName}</p></div>
              <div><span className="text-white/50">Canal</span><p className="font-semibold text-white">{projection.outboundPreview.channel}</p></div>
              <div><span className="text-white/50">Chantier</span><p className="font-semibold text-white">{projection.outboundPreview.projectName}</p></div>
              <div><span className="text-white/50">Statut</span><p className="font-semibold text-white">{projection.outboundPreview.status}</p></div>
              <div className="sm:col-span-2"><span className="text-white/50">Texte exact</span><p className="mt-1 font-semibold text-white">{projection.outboundPreview.body}</p></div>
            </div>
          ) : null}

          <form action={stepAction} className="mt-5">
            <input type="hidden" name="step" value={step.number} />
            <button disabled={stepPending} className="rounded-lg bg-[#D87526] px-5 py-3 font-semibold text-white disabled:opacity-50">
              {stepPending ? "Vérification…" : step.button}
            </button>
          </form>

          <div className={`mt-5 rounded-xl border p-4 ${displayed.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <p className="font-semibold text-white">Résultat observé</p>
            <p className="mt-1 text-white/70">{displayed.message}</p>
            <p className="mt-2 font-mono text-xs text-white/45">{displayed.resultCode}</p>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
          <h2 className="text-2xl font-semibold text-white">Votre courte observation</h2>
          <p className="mt-2 text-white/60">Il n’y a aucune question technique.</p>
          <form action={finalAction} className="mt-5 grid gap-5">
            {[
              ["clarificationUnderstandabilityRating", "La clarification de l’heure était facile à comprendre"],
              ["approvalComprehensionRating", "L’approbation du message était claire"],
              ["actionabilityRating", "Le dossier final permet de prendre la prochaine décision"],
            ].map(([name, label]) => (
              <label key={name} className="grid gap-2 text-white"><span>{label} (1–5)</span><select required name={name} defaultValue="" className="rounded-lg border border-white/15 bg-[#111318] p-3"><option value="" disabled>Choisir</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            ))}
            <label className="grid gap-2 text-white"><span>Combien de corrections avez-vous demandées?</span><input required min="0" max="100" type="number" name="founderCorrectionCount" defaultValue="0" className="rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
            <label className="grid gap-2 text-white"><span>La prochaine décision est-elle claire?</span><select required name="nextDecisionIdentified" defaultValue="" className="rounded-lg border border-white/15 bg-[#111318] p-3"><option value="" disabled>Choisir</option><option value="yes">Oui</option><option value="no">Non</option></select></label>
            <label className="grid gap-2 text-white"><span>Combien de fois avez-vous dû répéter manuellement le contexte?</span><input required min="0" max="100" type="number" name="manualContextRestatementCount" defaultValue="0" className="rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
            <label className="grid gap-2 text-white"><span>Commentaire facultatif</span><textarea name="comment" maxLength={1000} className="min-h-24 rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
            <button disabled={finalPending} className="rounded-lg bg-[#D87526] px-5 py-3 font-semibold text-white disabled:opacity-50">{finalPending ? "Scellement…" : "Terminer le test"}</button>
          </form>
          {!finalState.ok ? <p className="mt-4 text-red-300">{finalState.message}</p> : null}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Projects</p><h3 className="mt-2 text-xl font-semibold text-white">{projection?.projectName ?? "Rénovation Laval"}</h3><p className="mt-1 text-white/60">{projection ? `${projection.projectCode} · ${projection.contactName}, ${projection.contactRole}` : "Créé à la première action"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Calendar</p><h3 className="mt-2 text-xl font-semibold text-white">{projection?.appointmentCount ?? 0} rendez-vous</h3><p className="mt-1 text-white/60">{projection?.appointmentLabel ?? "Aucun rendez-vous encore"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Inbox</p><h3 className="mt-2 text-xl font-semibold text-white">{projection?.inboundCanonicalCount ?? 0} entrant · {projection?.simulatedDeliveryCount ?? 0} livraison locale</h3><p className="mt-1 text-white/60">Duplicate: {projection?.duplicateCanonicalEffectCount ?? 0} effet additionnel · Transport externe: {projection?.externalTransportCount ?? 0}</p></div>
      </section>
    </main>
  );
}

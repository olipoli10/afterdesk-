"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  runFounderTestStep,
  submitFounderObservation,
  type FounderTestActionState,
} from "@/server/construction-operating-assistant-r38/founder-test-actions";

const EXACT_REPORT =
  "Le travail du dosseret est terminé pour Rénovation Laval. Le montant est de 1 200 $.";
const EXACT_RESOLUTION =
  "Approbation non vérifiée tant que la preuve écrite n’est pas fournie.";

const humanRatingFields = [
  ["missingEvidenceClarityRating", "Clarté des preuves manquantes"],
  ["contradictionClarityRating", "Clarté de la contradiction"],
  ["nextActorClarityRating", "Clarté du prochain responsable"],
  ["actionabilityRating", "Dossier actionnable"],
  ["confidenceBeforeInvoicingRating", "Confiance avant de facturer"],
] as const;

type HumanObservationDraft = {
  founderCorrectionCount: string;
  manualContextRestatementCount: string;
  missingEvidenceClarityRating: string;
  contradictionClarityRating: string;
  nextActorClarityRating: string;
  actionabilityRating: string;
  confidenceBeforeInvoicingRating: string;
  wouldUseBeforeInvoicing: "" | "yes" | "no";
  economicValueExplanation: string;
  humanConfirmation: boolean;
};

const initialHumanObservationDraft: HumanObservationDraft = {
  founderCorrectionCount: "0",
  manualContextRestatementCount: "0",
  missingEvidenceClarityRating: "",
  contradictionClarityRating: "",
  nextActorClarityRating: "",
  actionabilityRating: "",
  confidenceBeforeInvoicingRating: "",
  wouldUseBeforeInvoicing: "",
  economicValueExplanation: "",
  humanConfirmation: false,
};

function Pill({ children, good = false }: { children: React.ReactNode; good?: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${good ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-white/15 bg-white/5 text-white/65"}`}>
      {children}
    </span>
  );
}

function HumanTimer({ startedAtUtc }: { startedAtUtc: string | null }) {
  const [activeMs, setActiveMs] = useState(0);
  const [hiddenMs, setHiddenMs] = useState(0);
  const activeTotal = useRef(0);
  const hiddenTotal = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    if (!startedAtUtc) return;
    const activeKey = "coa-r38-active-ms";
    const hiddenKey = "coa-r38-hidden-ms";
    activeTotal.current = Number(sessionStorage.getItem(activeKey) ?? 0);
    hiddenTotal.current = Number(sessionStorage.getItem(hiddenKey) ?? 0);
    last.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const delta = Math.max(0, now - last.current);
      last.current = now;
      const active = document.visibilityState === "visible" && document.hasFocus();
      if (active) {
        activeTotal.current += delta;
        sessionStorage.setItem(activeKey, String(activeTotal.current));
        setActiveMs(activeTotal.current);
      } else {
        hiddenTotal.current += delta;
        sessionStorage.setItem(hiddenKey, String(hiddenTotal.current));
        setHiddenMs(hiddenTotal.current);
      }
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    window.addEventListener("blur", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("blur", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [startedAtUtc]);
  return (
    <>
      <input type="hidden" name="activeVisibleMilliseconds" value={Math.round(activeMs)} />
      <input type="hidden" name="hiddenOrInactiveMilliseconds" value={Math.round(hiddenMs)} />
      <p className="text-sm text-white/55">Le temps actif compte seulement quand cette page est visible et que cette fenêtre est active.</p>
    </>
  );
}

const labels: Record<string, { title: string; explanation: string; action?: string; button?: string }> = {
  NOT_STARTED: {
    title: "Vérifier si un travail terminé est vraiment prêt à facturer",
    explanation: "Tu vas utiliser un dossier Laval entièrement synthétique. Une seule action sera affichée à la fois.",
    action: "START",
    button: "Commencer",
  },
  ENTER_REPORT: {
    title: "Dis à ENDVERA que le travail est terminé",
    explanation: "Écris la phrase affichée. Le chronomètre humain est maintenant commencé.",
    action: "REPORT_WORK",
    button: "Analyser le travail terminé",
  },
  MISSING_EVIDENCE: {
    title: "Le travail est terminé, mais le dossier n’est pas encore prêt",
    explanation: "ENDVERA bloque la facturation parce qu’il manque encore la preuve écrite et une photo ou un document.",
    action: "ADD_CONTRADICTION",
    button: "Ajouter les deux affirmations contradictoires",
  },
  CONTRADICTION_VISIBLE: {
    title: "Deux affirmations se contredisent",
    explanation: "ENDVERA garde les deux versions. Choisis la règle exacte ci-dessous comme propriétaire autorisé.",
    action: "RESOLVE_CONTRADICTION",
    button: "Choisir cette résolution",
  },
  CONTRADICTION_RESOLVED: {
    title: "La contradiction est résolue sans effacer l’histoire",
    explanation: "Le dossier attend maintenant une preuve écrite réelle dans le scénario synthétique.",
    action: "ADD_WRITTEN_APPROVAL",
    button: "Ajouter l’approbation synthétique",
  },
  WRITTEN_APPROVAL_ADDED: {
    title: "L’approbation écrite est présente, mais la preuve du travail manque",
    explanation: "ENDVERA refuse encore READY_TO_INVOICE tant que la photo synthétique n’est pas ajoutée.",
    action: "ADD_PHOTO",
    button: "Ajouter la photo synthétique",
  },
  READY_TO_INVOICE: {
    title: "Le dossier est maintenant prêt à facturer",
    explanation: "Les deux preuves requises sont vérifiées. Teste maintenant le duplicate et le replay sans copier d’identifiant.",
    action: "TEST_REPLAY",
    button: "Tester duplicate et replay",
  },
  REPLAY_REFUSED: {
    title: "Le duplicate et le replay ont été refusés",
    explanation: "Aucun second dossier ni second effet n’a été créé. La prochaine action recharge réellement cette page.",
    action: "MARK_RELOAD",
    button: "Préparer le rechargement",
  },
  AWAITING_RELOAD: {
    title: "Recharge complète du dossier",
    explanation: "Clique une fois. ENDVERA relira PostgreSQL et vérifiera que l’état et son empreinte sont identiques.",
  },
  RELOAD_VERIFIED: {
    title: "Le dossier est identique après rechargement",
    explanation: "Tu n’as rien répété. Prépare maintenant une demande de preuve à Marc, sans l’envoyer.",
    action: "PREPARE_FOLLOW_UP",
    button: "Préparer la demande à Marc",
  },
  FOLLOW_UP_PREPARED: {
    title: "La demande à Marc est préparée, mais non envoyée",
    explanation: "Vérifie le destinataire, le canal, le texte et le statut avant de voir la version employé de chantier.",
    action: "VERIFY_FIELD_VIEW",
    button: "Voir comme employé de chantier",
  },
  FIELD_VIEW_VERIFIED: {
    title: "La vue employé protège les données financières",
    explanation: "Le travail et le prochain geste sont visibles; le montant et les détails financiers ne le sont pas.",
  },
};

export function FounderInvoiceReadinessConsole({ initialState }: { initialState: FounderTestActionState }) {
  const [state, stepAction, pending] = useActionState(runFounderTestStep, initialState);
  const [finalState, finalAction, finalPending] = useActionState(submitFounderObservation, state);
  const [humanDraft, setHumanDraft] = useState<HumanObservationDraft>(initialHumanObservationDraft);
  const shown = finalState.projection?.sealedVerdict ? finalState : state;
  const projection = shown.projection;
  const stage = projection?.stage ?? "NOT_STARTED";
  const copy = labels[stage];
  const humanObservationComplete =
    humanRatingFields.every(([name]) => humanDraft[name] !== "") &&
    humanDraft.founderCorrectionCount !== "" &&
    humanDraft.manualContextRestatementCount !== "" &&
    humanDraft.wouldUseBeforeInvoicing !== "" &&
    humanDraft.economicValueExplanation.trim() !== "" &&
    humanDraft.humanConfirmation;

  return (
    <main className="min-h-screen space-y-6 bg-[#0A0B0D] px-4 py-8 text-white sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">Test local — zéro envoi réel</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Du travail terminé au dossier prêt à facturer</h1>
        <p className="mt-2 max-w-3xl text-white/65">Tout se fait ici. ENDVERA garde le chantier, l’historique, les preuves et le prochain responsable.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill good>PostgreSQL local jetable</Pill>
          <Pill good>Dossier 100 % synthétique</Pill>
          <Pill good>Aucun fournisseur externe</Pill>
          <Pill good>Aucun SMS envoyé</Pill>
        </div>
      </section>

      {projection?.sealedVerdict ? (
        <section className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-6">
          <h2 className="text-2xl font-semibold text-white">Test terminé et scellé</h2>
          <p className="mt-2 text-emerald-100">Tes réponses sont enregistrées exactement une fois. Tu n’as plus rien à faire.</p>
          <p className="mt-3 font-mono text-sm text-white/70">{projection.sealedVerdict}</p>
        </section>
      ) : stage === "HUMAN_OBSERVATION" ? (
        <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
          <h2 className="text-2xl font-semibold text-white">Ton observation réelle</h2>
          <p className="mt-2 text-white/60">Réponds seulement à ce que toi seul peux juger. Les mesures techniques viennent directement de PostgreSQL.</p>
          <form action={finalAction} className="mt-6 grid gap-5">
            <HumanTimer startedAtUtc={projection?.startedAtUtc ?? null} />
            <div className="grid gap-4 md:grid-cols-2">
              {humanRatingFields.map(([name, label]) => (
                <label key={name} className="grid gap-2 text-white"><span>{label} (1–5)</span><select required name={name} value={humanDraft[name]} onChange={(event) => setHumanDraft((current) => ({ ...current, [name]: event.target.value }))} className="rounded-lg border border-white/15 bg-[#111318] p-3"><option value="" disabled>Choisir</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              ))}
            </div>
            <label className="grid gap-2 text-white"><span>Combien de corrections as-tu demandées?</span><input required min="0" max="100" type="number" name="founderCorrectionCount" value={humanDraft.founderCorrectionCount} onChange={(event) => setHumanDraft((current) => ({ ...current, founderCorrectionCount: event.target.value }))} className="rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
            <label className="grid gap-2 text-white"><span>Combien de fois as-tu dû répéter manuellement le contexte?</span><input required min="0" max="100" type="number" name="manualContextRestatementCount" value={humanDraft.manualContextRestatementCount} onChange={(event) => setHumanDraft((current) => ({ ...current, manualContextRestatementCount: event.target.value }))} className="rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
            <label className="grid gap-2 text-white"><span>Utiliserais-tu ce dossier avant d’envoyer une facture?</span><select required name="wouldUseBeforeInvoicing" value={humanDraft.wouldUseBeforeInvoicing} onChange={(event) => setHumanDraft((current) => ({ ...current, wouldUseBeforeInvoicing: event.target.value as HumanObservationDraft["wouldUseBeforeInvoicing"] }))} className="rounded-lg border border-white/15 bg-[#111318] p-3"><option value="" disabled>Choisir Oui ou Non</option><option value="yes">Oui</option><option value="no">Non</option></select></label>
            <label className="grid gap-2 text-white"><span>Quelle partie te ferait réellement économiser du temps ou éviter une perte d’argent?</span><textarea required name="economicValueExplanation" maxLength={2000} value={humanDraft.economicValueExplanation} onChange={(event) => setHumanDraft((current) => ({ ...current, economicValueExplanation: event.target.value }))} className="min-h-28 rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
            <label className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-white"><input required type="checkbox" name="humanConfirmation" value="confirmed" checked={humanDraft.humanConfirmation} onChange={(event) => setHumanDraft((current) => ({ ...current, humanConfirmation: event.target.checked }))} className="mt-1" /><span>Je confirme avoir effectué cette session moi-même et que ces réponses sont les miennes.</span></label>
            {!humanObservationComplete ? <p className="text-sm text-amber-100">Réponds aux cinq notes, choisis Oui ou Non, écris ta réponse libre et coche la confirmation. Le bouton s’activera ensuite.</p> : null}
            <button disabled={finalPending || !humanObservationComplete} className="rounded-lg bg-[#D87526] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{finalPending ? "Scellement…" : "Terminer et sceller mon test"}</button>
          </form>
          {!finalState.ok ? <p className="mt-4 text-red-300">{finalState.message}</p> : null}
        </section>
      ) : copy ? (
        <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
          <p className="text-sm uppercase tracking-[0.16em] text-white/45">Une seule action maintenant</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{copy.title}</h2>
          <p className="mt-3 max-w-3xl text-lg text-white/70">{copy.explanation}</p>

          {stage === "ENTER_REPORT" ? (
            <form action={stepAction} className="mt-5 grid gap-3">
              <input type="hidden" name="action" value="REPORT_WORK" />
              <label className="grid gap-2 text-white"><span>Écris exactement:</span><code className="rounded-lg border border-white/10 bg-black/30 p-4 text-amber-100">{EXACT_REPORT}</code><textarea required name="message" defaultValue={EXACT_REPORT} className="min-h-28 rounded-lg border border-white/15 bg-[#111318] p-3" /></label>
              <button disabled={pending} className="rounded-lg bg-[#D87526] px-5 py-3 font-semibold text-white disabled:opacity-50">{copy.button}</button>
            </form>
          ) : stage === "AWAITING_RELOAD" ? (
            <button
              type="button"
              onClick={() => window.location.assign("/founder-full-loop?reload=1")}
              className="mt-5 inline-block rounded-lg bg-[#D87526] px-5 py-3 font-semibold text-white"
            >
              Recharger et vérifier
            </button>
          ) : copy.action ? (
            <form action={stepAction} className="mt-5">
              <input type="hidden" name="action" value={copy.action} />
              {stage === "CONTRADICTION_VISIBLE" ? <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-white"><p className="text-sm text-white/55">Résolution exacte</p><p className="mt-1 font-semibold">{EXACT_RESOLUTION}</p></div> : null}
              <button disabled={pending} className="rounded-lg bg-[#D87526] px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Vérification…" : copy.button}</button>
            </form>
          ) : null}
          {!shown.ok ? <p className="mt-4 text-red-300">{shown.message}</p> : null}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Chantier</p><h3 className="mt-2 text-xl font-semibold text-white">{projection?.projectName ?? "Rénovation Laval"}</h3><p className="mt-1 text-white/60">LAVAL-001 · Dosseret de cuisine · Marc</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/45">État canonique</p><h3 className="mt-2 text-xl font-semibold text-white">{projection?.status ?? "Pas commencé"}</h3><p className="mt-1 text-white/60">Prochain responsable: {projection?.nextResponsible ?? "Olivier"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Montant propriétaire</p><h3 className="mt-2 text-xl font-semibold text-white">1 200 CAD</h3><p className="mt-1 text-white/60">La vue employé ne montre jamais ce montant.</p></div>
      </section>

      {projection?.missing.length ? <section className="rounded-2xl border border-red-400/25 bg-red-400/5 p-5"><h3 className="font-semibold text-white">Pourquoi ENDVERA refuse encore</h3><ul className="mt-3 list-disc space-y-1 pl-5 text-white/70">{projection.missing.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      {projection?.claims.length ? <section className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-5"><h3 className="font-semibold text-white">Les deux affirmations conservées</h3>{projection.claims.map((claim) => <p key={claim} className="mt-2 rounded-lg border border-white/10 p-3 text-white/75">{claim}</p>)}</section> : null}
      {projection?.preparedFollowUp ? <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5"><h3 className="text-xl font-semibold text-white">Demande préparée</h3><div className="mt-3 grid gap-3 md:grid-cols-2"><p className="text-white/70">Destinataire: <strong className="text-white">{projection.preparedFollowUp.recipient}</strong></p><p className="text-white/70">Canal: <strong className="text-white">{projection.preparedFollowUp.channel}</strong></p><p className="text-white/70 md:col-span-2">Texte: <strong className="text-white">{projection.preparedFollowUp.body}</strong></p><p className="text-white/70">Statut: <strong className="text-white">PREPARED_UNSENT</strong></p><p className="text-white/70">Transport autorisé: <strong className="text-white">Non</strong></p></div></section> : null}
      {projection?.fieldWorkerView ? <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-5"><h3 className="font-semibold text-white">Vue employé de chantier</h3><p className="mt-2 text-white/70">Travail visible: oui · Prochain geste visible: oui · Montant visible: non</p></section> : null}
    </main>
  );
}

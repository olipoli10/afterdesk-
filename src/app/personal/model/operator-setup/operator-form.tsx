"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { OPERATOR_FORM_API, OPERATOR_FORM_ORIGIN, parseOperatorFormView, readOperatorSetupReceipt, type OperatorFormView } from "./operator-form-wire";

type Phase = "LOADING" | "READY" | "INVALID" | "BUSY" | "UNKNOWN" | "RECORDED" | "HISTORY" | "REVOKED";
type Lifetime = { view: OperatorFormView | null; binding: string; active: boolean; revoked: boolean; attempted: boolean;
  inputClosed: boolean; busy: boolean; request: AbortController | null; wall: number; mono: number; expiryMono: number };
const unknownCopy = "Résultat non confirmé. Ne soumettez pas une nouvelle clé; consultez le résultat.";
const clearInput = (input: { current: HTMLInputElement | null }) => { if (input.current) input.current.value = ""; };

export function OperatorForm({ view }: { view: OperatorFormView }) {
  const input = useRef<HTMLInputElement>(null), lifetime = useRef<Lifetime | null>(null);
  const [phase, setPhase] = useState<Phase>("LOADING");
  let parsed: OperatorFormView | null = null;
  try { parsed = parseOperatorFormView(view); } catch { /* closed metadata only */ }
  const binding = parsed ? JSON.stringify(parsed) : "";
  // Nonsecret render binding is separate from the synchronous attempt latch.
  const [initialBinding] = useState(binding);
  const current = (state: Lifetime) => state.active && !state.revoked && binding === initialBinding
    && binding === state.binding && window.location.origin === OPERATOR_FORM_ORIGIN;
  const fresh = (state: Lifetime) => {
    const wall = Date.now(), mono = performance.now();
    if (!Number.isFinite(wall) || !Number.isFinite(mono) || wall < state.wall || mono < state.mono
      || wall >= Date.parse(state.view!.expiresAt) || mono >= state.expiryMono) { state.inputClosed = true; clearInput(input); return false; }
    state.wall = wall; state.mono = mono; return true;
  };

  useEffect(() => {
    if (!lifetime.current) lifetime.current = { view: binding ? parseOperatorFormView(JSON.parse(binding)) : null,
      binding, active: false, revoked: false, attempted: false, inputClosed: false, busy: false,
      request: null, wall: 0, mono: 0, expiryMono: 0 };
    const state = lifetime.current;
    if (!binding || binding !== initialBinding || binding !== state.binding) { state.revoked = true; state.inputClosed = true; }
    state.active = true;
    const wall = Date.now(), mono = performance.now();
    if (!state.view || window.location.origin !== OPERATOR_FORM_ORIGIN || !Number.isFinite(wall) || !Number.isFinite(mono)) state.revoked = true;
    state.wall = wall; state.mono = mono;
    state.expiryMono = mono + Math.min(900000, Math.max(0, Date.parse(state.view?.expiresAt ?? "") - wall));
    if (state.view?.state !== "INPUT_AVAILABLE" || !Number.isFinite(state.expiryMono) || state.expiryMono <= mono) state.inputClosed = true;
    setPhase(state.revoked ? "REVOKED" : state.inputClosed || state.attempted ? "HISTORY" : "READY");
    const revoke = () => { state.revoked = true; state.inputClosed = true; clearInput(input); state.request?.abort(); if (state.active) setPhase("REVOKED"); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) revoke(); };
    window.addEventListener("pagehide", revoke); window.addEventListener("pageshow", restore);
    const timer = setTimeout(() => { state.inputClosed = true; clearInput(input); if (state.active && !state.busy && !state.revoked) setPhase("HISTORY"); },
      Math.max(0, Math.min(900000, state.expiryMono - mono)));
    return () => { state.active = false; clearInput(input); state.request?.abort(); clearTimeout(timer);
      window.removeEventListener("pagehide", revoke); window.removeEventListener("pageshow", restore); };
  }, [binding, initialBinding]);

  async function exchange(write: boolean) {
    const state = lifetime.current;
    if (!state || !current(state) || state.busy || !state.view) return;
    let body: string | undefined;
    if (write) {
      if (state.attempted || state.inputClosed || state.view.state !== "INPUT_AVAILABLE" || !fresh(state)) { clearInput(input); setPhase("HISTORY"); return; }
      let secret = input.current?.value ?? "";
      if (!/^[A-Za-z0-9_-]{24,512}$/.test(secret)) { secret = ""; setPhase("INVALID"); return; }
      // Latch, capture and erase synchronously before the first await/fetch.
      state.attempted = true; state.inputClosed = true;
      body = JSON.stringify({ version: "personal-model-setup-command-v1", setupRef: state.view.setupRef, apiKey: secret });
      secret = ""; clearInput(input);
    } else { state.inputClosed = true; clearInput(input); }
    state.busy = true; setPhase("BUSY");
    const controller = new AbortController(); state.request = controller;
    const wall = Date.now(), mono = performance.now();
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error("OPERATOR_FORM_REFUSED")); });
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (!Number.isFinite(wall) || !Number.isFinite(mono)) throw new Error("OPERATOR_FORM_REFUSED");
      const pending = fetch(OPERATOR_FORM_API + (write ? "" : `?setupRef=${encodeURIComponent(state.view.setupRef)}`),
        { method: write ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
          headers: write ? { "content-type": "application/json" } : undefined, body, signal: controller.signal });
      body = undefined;
      const response = await Promise.race([pending, aborted]);
      await Promise.race([readOperatorSetupReceipt(response, state.view.setupRef, controller.signal), aborted]);
      const finalWall = Date.now(), finalMono = performance.now();
      if (!current(state) || controller.signal.aborted || !Number.isFinite(finalWall) || !Number.isFinite(finalMono)
        || finalWall < wall || finalMono < mono || finalWall - wall >= 15000 || finalMono - mono >= 15000) throw new Error("OPERATOR_FORM_REFUSED");
      setPhase("RECORDED");
    } catch { if (current(state)) setPhase("UNKNOWN"); }
    finally { body = undefined; clearTimeout(timer); controller.signal.removeEventListener("abort", rejectAbort);
      controller.abort(); if (state.request === controller) { state.request = null; state.busy = false; } }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void exchange(true); };
  const showInput = !!parsed && binding === initialBinding && (phase === "READY" || phase === "INVALID");
  if (!parsed || binding !== initialBinding || phase === "REVOKED") return <p role="status">Cette page n’est plus disponible. Rechargez-la pour vérifier l’accès.</p>;
  return <section className="space-y-5" aria-label="Configuration personnelle du modèle">
    <dl><dt>Fournisseur</dt><dd>{parsed.provider}</dd><dt>Modèle configuré</dt><dd>{parsed.model}</dd>
      <dt>Point de service configuré</dt><dd>{parsed.providerEndpoint}</dd><dt>Usage</dt><dd>Interprétation de demandes personnelles</dd></dl>
    <p>Enregistrer la clé pour cette configuration. Cette étape n’active aucun modèle et n’appelle aucun fournisseur.</p>
    {showInput ? <form onSubmit={submit} autoComplete="off" className="space-y-3">
      <label htmlFor="personal-model-key">Clé OpenRouter</label>
      <input id="personal-model-key" ref={node => { if (input.current && input.current !== node) input.current.value = ""; input.current = node; }} type="password" maxLength={512} autoComplete="off" spellCheck={false}
        autoCapitalize="none" className="block w-full rounded border p-3" />
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">Enregistrer une seule fois</button>
    </form> : phase === "LOADING" ? <p>Vérification de la page…</p> : null}
    <p role="status" aria-live="polite">{phase === "INVALID" ? "Vérifiez le format de la clé avant de l’envoyer."
      : phase === "RECORDED" ? "Configuration enregistrée; modèle non activé lors de cette opération."
      : phase === "UNKNOWN" ? unknownCopy : phase === "BUSY" ? "Vérification en cours…"
      : phase === "HISTORY" ? "Saisie indisponible : fenêtre expirée, consentement manquant ou tentative déjà enregistrée. Consultez le résultat." : ""}</p>
    <button type="button" disabled={phase === "LOADING" || phase === "BUSY"} onClick={() => { void exchange(false); }}
      className="rounded border px-4 py-2">Consulter le résultat</button>
  </section>;
}

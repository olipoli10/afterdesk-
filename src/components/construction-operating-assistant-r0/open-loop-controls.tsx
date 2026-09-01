"use client";

import { useActionState } from "react";
import {
  confirmInvoiceEvidence,
  prepareEvidenceFollowUp,
  type OpenLoopActionResult,
} from "@/server/actions/construction-operating-assistant-r0";

const initialEvidenceState: OpenLoopActionResult = {
  ok: true,
  message: "Ajoutez seulement une preuve que vous avez réellement vérifiée.",
};
const initialRequestState: OpenLoopActionResult = {
  ok: true,
  message: "Le suivi restera préparé et non envoyé dans cette version locale.",
};

type ContactOption = {
  id: string;
  displayName: string;
  hasSms: boolean;
  hasEmail: boolean;
};

function stampRequestId(event: React.FormEvent<HTMLFormElement>, fieldName: string) {
  const field = event.currentTarget.elements.namedItem(fieldName);
  if (field instanceof HTMLInputElement) field.value = crypto.randomUUID();
}

export function OpenLoopControls(props: {
  workspaceId: string;
  projectId: string;
  loopId: string;
  stateVersion: number;
  contacts: ContactOption[];
}) {
  const [evidenceState, evidenceAction, evidencePending] = useActionState(
    confirmInvoiceEvidence,
    initialEvidenceState,
  );
  const [requestState, requestAction, requestPending] = useActionState(
    prepareEvidenceFollowUp,
    initialRequestState,
  );
  const firstReachableContact = props.contacts.find((contact) => contact.hasSms || contact.hasEmail);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <form
        action={evidenceAction}
        onSubmit={(event) => stampRequestId(event, "eventId")}
        className="rounded-lg border border-white/10 bg-black/15 p-4"
      >
        <input type="hidden" name="workspaceId" value={props.workspaceId} />
        <input type="hidden" name="projectId" value={props.projectId} />
        <input type="hidden" name="loopId" value={props.loopId} />
        <input type="hidden" name="expectedStateVersion" value={props.stateVersion} />
        <input type="hidden" name="eventId" />
        <p className="font-semibold text-white">Confirmer une preuve</p>
        <label className="mt-3 block text-xs uppercase tracking-wider text-[#8A9099]" htmlFor={`kind-${props.loopId}`}>
          Type de preuve
        </label>
        <select
          id={`kind-${props.loopId}`}
          name="kind"
          className="mt-1 w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white"
          defaultValue="WRITTEN_APPROVAL"
        >
          <option value="WRITTEN_APPROVAL">Approbation écrite</option>
          <option value="PHOTO">Photo du travail</option>
          <option value="DOCUMENT">Document</option>
        </select>
        <label className="mt-3 block text-xs uppercase tracking-wider text-[#8A9099]" htmlFor={`source-${props.loopId}`}>
          Référence vérifiable
        </label>
        <input
          id={`source-${props.loopId}`}
          name="sourceRef"
          required
          maxLength={500}
          placeholder="Ex.: message client du 1er septembre"
          className="mt-1 w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white"
        />
        <input type="hidden" name="contentHash" value="" />
        <p aria-live="polite" className={`mt-3 text-sm ${evidenceState.ok ? "text-[#A1A8B3]" : "text-[#FF9A8B]"}`}>
          {evidenceState.message}
        </p>
        <button
          disabled={evidencePending}
          className="mt-3 rounded-md bg-[#D87526] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {evidencePending ? "Vérification…" : "Confirmer cette preuve"}
        </button>
      </form>

      <form
        action={requestAction}
        onSubmit={(event) => stampRequestId(event, "requestId")}
        className="rounded-lg border border-white/10 bg-black/15 p-4"
      >
        <input type="hidden" name="workspaceId" value={props.workspaceId} />
        <input type="hidden" name="projectId" value={props.projectId} />
        <input type="hidden" name="loopId" value={props.loopId} />
        <input type="hidden" name="expectedStateVersion" value={props.stateVersion} />
        <input type="hidden" name="requestId" />
        <p className="font-semibold text-white">Préparer un suivi</p>
        {firstReachableContact ? (
          <>
            <label className="mt-3 block text-xs uppercase tracking-wider text-[#8A9099]" htmlFor={`contact-${props.loopId}`}>
              Responsable à joindre
            </label>
            <select
              id={`contact-${props.loopId}`}
              name="contactId"
              className="mt-1 w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white"
              defaultValue={firstReachableContact.id}
            >
              {props.contacts
                .filter((contact) => contact.hasSms || contact.hasEmail)
                .map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.displayName}
                  </option>
                ))}
            </select>
            <label className="mt-3 block text-xs uppercase tracking-wider text-[#8A9099]" htmlFor={`channel-${props.loopId}`}>
              Canal à préparer
            </label>
            <select
              id={`channel-${props.loopId}`}
              name="channel"
              className="mt-1 w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white"
              defaultValue={firstReachableContact.hasSms ? "SMS" : "EMAIL"}
            >
              {props.contacts.some((contact) => contact.hasSms) ? <option value="SMS">SMS</option> : null}
              {props.contacts.some((contact) => contact.hasEmail) ? <option value="EMAIL">Courriel</option> : null}
            </select>
            <textarea
              name="body"
              required
              maxLength={1600}
              rows={3}
              className="mt-3 w-full rounded-md border border-white/15 bg-[#111317] px-3 py-2 text-sm text-white"
              defaultValue="Bonjour, il nous manque la preuve nécessaire pour préparer la facture de cet extra. Pouvez-vous nous la transmettre?"
            />
            <button
              disabled={requestPending}
              className="mt-3 rounded-md border border-[#C9A76A] px-4 py-2 text-sm font-semibold text-[#E2C486] disabled:opacity-50"
            >
              {requestPending ? "Préparation…" : "Préparer sans envoyer"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm text-[#FF9A8B]">Aucun contact du chantier n’a de canal disponible.</p>
        )}
        <p aria-live="polite" className={`mt-3 text-sm ${requestState.ok ? "text-[#A1A8B3]" : "text-[#FF9A8B]"}`}>
          {requestState.message}
        </p>
      </form>
    </div>
  );
}

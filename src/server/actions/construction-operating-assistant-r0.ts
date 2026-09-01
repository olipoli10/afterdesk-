"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import {
  addInvoiceReadinessEvidence,
  prepareInvoiceEvidenceRequest,
} from "@/server/construction-operating-assistant-r0/open-loops";

const evidenceFormSchema = z
  .object({
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    expectedStateVersion: z.coerce.number().int().positive(),
    eventId: z.string().uuid(),
    kind: z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]),
    sourceRef: z.string().trim().min(1).max(500),
    contentHash: z.union([z.literal(""), z.string().regex(/^[0-9a-f]{64}$/)]),
  })
  .strict();

const requestFormSchema = z
  .object({
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    expectedStateVersion: z.coerce.number().int().positive(),
    requestId: z.string().uuid(),
    contactId: z.string().min(1).max(160),
    channel: z.enum(["SMS", "EMAIL"]),
    body: z.string().trim().min(1).max(1600),
  })
  .strict();

export type OpenLoopActionResult = {
  ok: boolean;
  message: string;
};

function refreshOpenLoopPages(projectId: string) {
  revalidatePath("/client/projects");
  revalidatePath(`/client/projects/${projectId}`);
  revalidatePath("/client/inbox");
}

export async function confirmInvoiceEvidence(
  _previous: OpenLoopActionResult,
  formData: FormData,
): Promise<OpenLoopActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = evidenceFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "La preuve est incomplète ou invalide." };
  try {
    const result = await addInvoiceReadinessEvidence({
      schemaVersion: 1,
      eventId: parsed.data.eventId,
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      loopId: parsed.data.loopId,
      expectedStateVersion: parsed.data.expectedStateVersion,
      kind: parsed.data.kind,
      state: "VERIFIED",
      sourceRef: parsed.data.sourceRef,
      contentHash: parsed.data.contentHash || null,
    });
    refreshOpenLoopPages(parsed.data.projectId);
    return {
      ok: true,
      message: result.decision.ready
        ? "Preuve enregistrée. Le dossier est maintenant prêt à facturer."
        : `Preuve enregistrée. Prochaine action: ${result.decision.nextAction}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return {
      ok: false,
      message:
        message === "OPEN_LOOP_STALE_STATE_VERSION"
          ? "Le dossier a changé. Rechargez la page avant de confirmer cette preuve."
          : "ENDVERA a refusé la preuve sans modifier le dossier.",
    };
  }
}

export async function prepareEvidenceFollowUp(
  _previous: OpenLoopActionResult,
  formData: FormData,
): Promise<OpenLoopActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = requestFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "La demande de suivi est invalide." };
  try {
    const result = await prepareInvoiceEvidenceRequest({
      schemaVersion: 1,
      requestId: parsed.data.requestId,
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      loopId: parsed.data.loopId,
      expectedStateVersion: parsed.data.expectedStateVersion,
      contactId: parsed.data.contactId,
      channel: parsed.data.channel,
      body: parsed.data.body,
    });
    refreshOpenLoopPages(parsed.data.projectId);
    return {
      ok: true,
      message: result.replayed
        ? "La même demande était déjà préparée. Aucun deuxième effet."
        : "Demande préparée, mais non envoyée. Aucun transport externe n’est autorisé.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return {
      ok: false,
      message:
        message === "OPEN_LOOP_STALE_STATE_VERSION"
          ? "Le dossier a changé. Rechargez la page avant de préparer le suivi."
          : message === "OPEN_LOOP_PREPARED_ACTION_CONFLICT"
            ? "Un autre suivi est déjà lié à cette version du dossier."
            : "ENDVERA a refusé la demande sans préparer ni envoyer de message.",
    };
  }
}

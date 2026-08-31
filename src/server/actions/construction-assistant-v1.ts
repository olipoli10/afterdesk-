"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { localInboundEnvelopeSchema } from "@/lib/construction-assistant-v1/messaging";
import {
  createConstructionContact,
  createConstructionProject,
  constructionWorkspaceForUser,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  portalIdempotencyKey,
  processConstructionMessage,
} from "@/server/construction-assistant-v1/intake";
import { simulateInboundMessage } from "@/server/construction-assistant-v1/simulator";
import { approveAndSimulateOutbound } from "@/server/construction-assistant-v1/outbound";

const messageSchema = z.object({
  workspaceId: z.string().uuid(),
  body: z.string().trim().min(1).max(4_000),
  requestId: z.string().uuid(),
});

const simulationSchema = z.object({
  workspaceId: z.string().uuid(),
  channel: z.enum(["SMS", "EMAIL"]),
  providerMessageId: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4_000),
});

const approvalSchema = z.object({
  workspaceId: z.string().uuid(),
  actionId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ConstructionActionResult = {
  ok: boolean;
  message: string;
  actionId?: string;
};

function refreshConstructionPortal() {
  revalidatePath("/client/projects");
  revalidatePath("/client/calendar");
  revalidatePath("/client/inbox");
}

export async function initializeConstructionDemo(): Promise<void> {
  const user = await requireRole("CLIENT");
  let workspace = await constructionWorkspaceForUser(user.id);
  if (!workspace) {
    const created = await initializeConstructionWorkspace({
      userId: user.id,
      name: "ENDVERA Construction — Olivier",
      timezone: "America/Toronto",
      locale: "fr-CA",
    });
    const project = await createConstructionProject({
      userId: user.id,
      workspaceId: created.workspaceId,
      code: "LAVAL-001",
      name: "Rénovation Laval",
      address: "Laval, Québec — dossier synthétique",
    });
    await createConstructionContact({
      userId: user.id,
      workspaceId: created.workspaceId,
      projectId: project.id,
      displayName: "Marc",
      role: "Fournisseur",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc@example.invalid",
    });
    workspace = await constructionWorkspaceForUser(user.id);
  }
  refreshConstructionPortal();
}

export async function submitA2ConstructionMessage(
  _previous: ConstructionActionResult,
  formData: FormData,
): Promise<ConstructionActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Message ou contexte invalide." };
  try {
    const result = await processConstructionMessage({
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      channel: "portal",
      body: parsed.data.body,
      idempotencyKey: portalIdempotencyKey({
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
        requestId: parsed.data.requestId,
      }),
      referenceNow: new Date(),
    });
    refreshConstructionPortal();
    return { ok: true, message: result.reply, actionId: result.actionId };
  } catch {
    return { ok: false, message: "ENDVERA a refusé la demande sans modifier le dossier." };
  }
}

export async function submitLocalConstructionSimulation(
  _previous: ConstructionActionResult,
  formData: FormData,
): Promise<ConstructionActionResult> {
  const user = await requireRole("CLIENT");
  const parsed = simulationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enveloppe locale invalide." };
  const workspace = await constructionWorkspaceForUser(user.id);
  if (!workspace || workspace.id !== parsed.data.workspaceId) return { ok: false, message: "Espace introuvable." };
  const sender = `${parsed.data.channel === "SMS" ? "sim-sms" : "sim-email"}:${user.id}`;
  const envelope = localInboundEnvelopeSchema.parse({
    schemaVersion: 1,
    provider: "ENDVERA_LOCAL_SIMULATOR",
    providerMessageId: parsed.data.providerMessageId,
    channel: parsed.data.channel,
    normalizedSender: sender,
    body: parsed.data.body,
    receivedAt: new Date().toISOString(),
    signatureValid: true,
  });
  const result = await simulateInboundMessage({ workspaceId: workspace.id, envelope });
  refreshConstructionPortal();
  if (!result.admitted) return { ok: false, message: `Refusé: ${result.reason}.` };
  return { ok: true, message: result.result.replayed ? `Rejeu refusé proprement. ${result.result.reply}` : result.result.reply };
}

export async function approveLocalOutboundSimulation(formData: FormData): Promise<void> {
  const user = await requireRole("CLIENT");
  const parsed = approvalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await approveAndSimulateOutbound({ userId: user.id, ...parsed.data });
  refreshConstructionPortal();
}

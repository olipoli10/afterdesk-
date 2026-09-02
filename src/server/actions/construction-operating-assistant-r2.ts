"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { operatingCommandEnvelopeSchema } from "@/lib/construction-operating-assistant-r2/contracts";
import { processAuthenticatedPortalCommand } from "@/server/construction-operating-assistant-r36c/orchestrator";
import {
  constructionWorkspaceForUser,
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const commandFormSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  body: z.string().trim().min(1).max(10_000),
  commandId: z.string().uuid(),
});

const onboardingSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  projectCode: z.string().trim().min(2).max(40),
  projectName: z.string().trim().min(2).max(160),
  projectAddress: z.string().trim().max(240).optional(),
  contactName: z.string().trim().min(2).max(120),
  contactRole: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(40).optional(),
});

export type OperatingAssistantActionState = {
  ok: boolean;
  reply: string;
  status?: "APPLIED" | "PREPARED_UNSENT" | "CLARIFICATION_REQUIRED" | "ANSWERED" | "REFUSED";
};

function refreshAssistant() {
  revalidatePath("/client/assistant");
  revalidatePath("/client/projects");
  revalidatePath("/client/calendar");
  revalidatePath("/client/inbox");
}
export async function submitOperatingAssistantCommand(
  _previous: OperatingAssistantActionState,
  formData: FormData,
): Promise<OperatingAssistantActionState> {
  const user = await requireRole("CLIENT");
  const parsed = commandFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, reply: "La demande est incomplète." };
  try {
    const now = new Date();
    const result = await processAuthenticatedPortalCommand({
      userId: user.id,
      envelope: operatingCommandEnvelopeSchema.parse({
        schemaVersion: 1,
        commandId: parsed.data.commandId,
        workspaceId: parsed.data.workspaceId,
        channel: "PORTAL",
        body: parsed.data.body,
        occurredAt: now.toISOString(),
        senderAddress: `user:${user.id}`,
      }),
    });
    refreshAssistant();
    return { ok: true, reply: result.reply, status: result.status };
  } catch {
    return { ok: false, reply: "ENDVERA a refusé la demande sans modifier vos dossiers." };
  }
}

export async function initializeOperatingAssistant(formData: FormData): Promise<void> {
  const user = await requireRole("CLIENT");
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const existing = await constructionWorkspaceForUser(user.id);
  if (existing) return;
  const workspace = await initializeConstructionWorkspace({
    userId: user.id,
    name: parsed.data.companyName,
    timezone: "America/Toronto",
    locale: "fr-CA",
  });
  const project = await createConstructionProject({
    userId: user.id,
    workspaceId: workspace.workspaceId,
    code: parsed.data.projectCode,
    name: parsed.data.projectName,
    address: parsed.data.projectAddress,
  });
  await createConstructionContact({
    userId: user.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: parsed.data.contactName,
    role: parsed.data.contactRole,
    normalizedPhone: parsed.data.contactPhone || undefined,
  });
  refreshAssistant();
}

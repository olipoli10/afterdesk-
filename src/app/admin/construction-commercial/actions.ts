"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { processCommercialCommand } from "@/server/construction-operating-assistant-r34/commercial";

export async function applyCommercialAdminAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const expectedAccountVersion = Number(formData.get("expectedAccountVersion") ?? 0);
  const action = String(formData.get("action") ?? "");
  if (action === "assign") {
    await processCommercialCommand({ actorId: admin.id, command: {
      commandId: randomUUID(), workspaceId, kind: "ASSIGN_PLAN", expectedAccountVersion,
      planKey: "EARLY_ACCESS", planVersion: 1,
    } });
  } else if (["INTERNAL_TRIAL", "SUSPENDED", "CANCELLED"].includes(action)) {
    await processCommercialCommand({ actorId: admin.id, command: {
      commandId: randomUUID(), workspaceId, kind: "CHANGE_STATE", expectedAccountVersion, nextState: action,
    } });
  } else {
    throw new Error("COMMERCIAL_ADMIN_ACTION_INVALID");
  }
  revalidatePath("/admin/construction-commercial");
  revalidatePath("/client/account");
}

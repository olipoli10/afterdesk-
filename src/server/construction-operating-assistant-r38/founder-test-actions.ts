"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import {
  FOUNDER_TEST_COOKIE,
  FOUNDER_TEST_ROUTE,
  addContradictionStep,
  addPhotoStep,
  addWrittenApprovalStep,
  assertLoopbackHost,
  completeReloadCheckpoint,
  humanObservationInputSchema,
  loadFounderTestProjection,
  markReloadStep,
  prepareFollowUpStep,
  reportWorkFinishedStep,
  requireFounderTestSession,
  resolveContradictionStep,
  sealFounderObservation,
  startFounderSession,
  testReplayStep,
  verifyFieldViewStep,
  type FounderTestProjection,
} from "./founder-test";

export type FounderTestActionState = {
  ok: boolean;
  message: string;
  projection: FounderTestProjection | null;
};

const EMPTY_FOUNDER_TEST_STATE: FounderTestActionState = {
  ok: true,
  message: "Le dossier synthétique est prêt. Aucun vrai message ni aucune facture ne sera envoyé.",
  projection: null,
};

const stepInputSchema = z
  .object({
    action: z.enum([
      "START",
      "REPORT_WORK",
      "ADD_CONTRADICTION",
      "RESOLVE_CONTRADICTION",
      "ADD_WRITTEN_APPROVAL",
      "ADD_PHOTO",
      "TEST_REPLAY",
      "MARK_RELOAD",
      "PREPARE_FOLLOW_UP",
      "VERIFY_FIELD_VIEW",
    ]),
    message: z.string().max(500).optional(),
  })
  .strict();

async function guardedSession() {
  const h = await headers();
  assertLoopbackHost(h.get("host"));
  const user = await requireRole("CLIENT");
  if (user.email !== "olivier.r38@example.invalid") throw new Error("COA_R1_SYNTHETIC_USER_REQUIRED");
  const cookie = (await cookies()).get(FOUNDER_TEST_COOKIE)?.value;
  return requireFounderTestSession(cookie);
}
function refresh() {
  revalidatePath(FOUNDER_TEST_ROUTE);
}

export async function loadFounderTestState(options?: { completeReload?: boolean }) {
  let session = await guardedSession();
  if (options?.completeReload) session = await completeReloadCheckpoint(session);
  return {
    ...EMPTY_FOUNDER_TEST_STATE,
    projection: await loadFounderTestProjection(session),
  };
}

export async function runFounderTestStep(
  previous: FounderTestActionState,
  formData: FormData,
): Promise<FounderTestActionState> {
  try {
    const raw = Object.fromEntries(formData);
    const parsed = stepInputSchema.parse(raw);
    let session = await guardedSession();
    switch (parsed.action) {
      case "START":
        session = await startFounderSession(session);
        break;
      case "REPORT_WORK":
        session = await reportWorkFinishedStep(session, parsed.message ?? "");
        break;
      case "ADD_CONTRADICTION":
        session = await addContradictionStep(session);
        break;
      case "RESOLVE_CONTRADICTION":
        session = await resolveContradictionStep(session);
        break;
      case "ADD_WRITTEN_APPROVAL":
        session = await addWrittenApprovalStep(session);
        break;
      case "ADD_PHOTO":
        session = await addPhotoStep(session);
        break;
      case "TEST_REPLAY":
        session = await testReplayStep(session);
        break;
      case "MARK_RELOAD":
        session = await markReloadStep(session);
        break;
      case "PREPARE_FOLLOW_UP":
        session = await prepareFollowUpStep(session);
        break;
      case "VERIFY_FIELD_VIEW":
        session = await verifyFieldViewStep(session);
        break;
    }
    refresh();
    return {
      ok: true,
      message: "Étape vérifiée. ENDVERA a conservé le dossier et la prochaine action.",
      projection: await loadFounderTestProjection(session),
    };
  } catch (error) {
    return {
      ...previous,
      ok: false,
      message: `Cette étape a été refusée sans modifier le dossier: ${(error as Error).message}`,
    };
  }
}

export async function submitFounderObservation(
  previous: FounderTestActionState,
  formData: FormData,
): Promise<FounderTestActionState> {
  try {
    const parsed = humanObservationInputSchema.parse(Object.fromEntries(formData));
    const session = await guardedSession();
    const result = await sealFounderObservation(session, parsed);
    refresh();
    return {
      ok: true,
      message: "Ton test réel est terminé et scellé. Aucune deuxième session ne peut être créée.",
      projection: await loadFounderTestProjection({
        ...session,
        stage: "SEALED",
        completedAtUtc: result.observation.completedAtUtc,
      }),
    };
  } catch (error) {
    return {
      ...previous,
      ok: false,
      message: `Le scellement a été refusé: ${(error as Error).message}`,
    };
  }
}

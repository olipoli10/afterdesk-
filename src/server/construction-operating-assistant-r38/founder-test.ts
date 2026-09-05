import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@prisma-client";
import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { prisma } from "@/lib/db";
import {
  addInvoiceReadinessEvidence,
  openLoopProjectionForUser,
  prepareInvoiceEvidenceRequest,
  recordOpenLoopContradiction,
  recordWorkFinished,
  resolveOpenLoopContradiction,
} from "@/server/construction-operating-assistant-r0/open-loops";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";

export const FOUNDER_TEST_ROUTE = "/founder-full-loop";
export const FOUNDER_TEST_COOKIE = "endvera-r38-founder-session";
export const FOUNDER_EMAIL = "olivier.r38@example.invalid";
export const FOUNDER_PASSWORD = "Endvera-R38-Full-Loop-Local-Only-2026!";
export const EXACT_REPORT =
  "Le travail du dosseret est terminé pour Rénovation Laval. Le montant est de 1 200 $.";
export const APPROVED_CLAIM = "Le client a approuvé l’extra.";
export const NO_WRITTEN_CLAIM = "Aucune approbation écrite n’est disponible.";
export const EXACT_RESOLUTION =
  "Approbation non vérifiée tant que la preuve écrite n’est pas fournie.";
export const FOLLOW_UP_BODY =
  "Bonjour Marc, peux-tu fournir la preuve écrite liée au dosseret de cuisine du chantier Rénovation Laval?";
export const HUMAN_STATEMENT =
  "OLIVIER_COMPLETED_THIS_LOCAL_SESSION_AND_THE_RATINGS_ARE_HIS_OWN";
export const PASS_VERDICT = "FOUNDER_OWNED_FULL_LOOP_OBSERVED_PASS";

const FEATURE = "specs/196-r38-founder-full-loop-preparation";
const SESSION_PATH = path.join(process.cwd(), "storage", "founder-tests", "coa-r38", "session.json");
const OBSERVATION_PATH = path.join(process.cwd(), FEATURE, "evidence", "founder-observation.json");
const MEASUREMENTS_PATH = path.join(process.cwd(), FEATURE, "evidence", "postgresql-measurements.json");

const OWNER_ID = "coa-r1-founder-owner";
const FIELD_ID = "coa-r1-founder-field";
const OUTSIDER_ID = "coa-r1-founder-outsider";
const WORKSPACE_ID = "coa-r1-workspace";
const PROJECT_ID = "coa-r1-project-laval";
const CONTACT_ID = "coa-r1-contact-marc";
const SOURCE_MESSAGE_ID = "coa-r1-source-work-finished";
const REPORT_COMMAND_ID = "coa-r1-report-work-finished-001";
const CONTRADICTION_EVENT_ID = "coa-r1-contradiction-001";
const RESOLUTION_EVENT_ID = "coa-r1-resolution-001";
const APPROVAL_EVIDENCE_ID = "coa-r1-written-approval-001";
const PHOTO_EVIDENCE_ID = "coa-r1-photo-001";
const FOLLOW_UP_REQUEST_ID = "00000000-0000-4000-8000-000000000811";
const CLAIM_APPROVED_ID = "claim-client-approved-extra";
const CLAIM_UNVERIFIED_ID = "claim-approval-unverified-until-written";

const STAGES = [
  "NOT_STARTED",
  "ENTER_REPORT",
  "MISSING_EVIDENCE",
  "CONTRADICTION_VISIBLE",
  "CONTRADICTION_RESOLVED",
  "WRITTEN_APPROVAL_ADDED",
  "READY_TO_INVOICE",
  "REPLAY_REFUSED",
  "AWAITING_RELOAD",
  "RELOAD_VERIFIED",
  "FOLLOW_UP_PREPARED",
  "FIELD_VIEW_VERIFIED",
  "HUMAN_OBSERVATION",
  "SEALED",
] as const;

const stageSchema = z.enum(STAGES);
export type FounderTestStage = z.infer<typeof stageSchema>;

const transcriptEntrySchema = z
  .object({
    sequence: z.number().int().positive(),
    code: z.string().min(1).max(120),
    atUtc: z.string().datetime(),
  })
  .strict();

const storedSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().uuid(),
    accessTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
    accessExpiresAtUtc: z.string().datetime(),
    accessConsumedAtUtc: z.string().datetime().nullable(),
    stage: stageSchema,
    startedAtUtc: z.string().datetime().nullable(),
    completedAtUtc: z.string().datetime().nullable(),
    loopId: z.string().nullable(),
    contradictionId: z.string().nullable(),
    missingAfterReport: z.array(z.string()).max(20),
    readyStateVersion: z.number().int().positive().nullable(),
    duplicateCanonicalEffectCount: z.number().int().min(0),
    replayCanonicalEffectCount: z.number().int().min(0),
    stateHashBeforeReload: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    stateHashAfterReload: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    crossWorkspaceDenied: z.boolean(),
    fieldWorkerFinancialLeakCount: z.number().int().min(0),
    transcript: z.array(transcriptEntrySchema).max(40),
  })
  .strict();

type StoredSession = z.infer<typeof storedSessionSchema>;

const founderStepInputSchema = z
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

export const humanObservationInputSchema = z
  .object({
    founderCorrectionCount: z.coerce.number().int().min(0).max(100),
    manualContextRestatementCount: z.coerce.number().int().min(0).max(100),
    missingEvidenceClarityRating: z.coerce.number().int().min(1).max(5),
    contradictionClarityRating: z.coerce.number().int().min(1).max(5),
    nextActorClarityRating: z.coerce.number().int().min(1).max(5),
    actionabilityRating: z.coerce.number().int().min(1).max(5),
    confidenceBeforeInvoicingRating: z.coerce.number().int().min(1).max(5),
    wouldUseBeforeInvoicing: z.enum(["yes", "no"]).transform((value) => value === "yes"),
    economicValueExplanation: z.string().trim().min(1).max(2000),
    activeVisibleMilliseconds: z.coerce.number().int().min(0).max(86_400_000),
    hiddenOrInactiveMilliseconds: z.coerce.number().int().min(0).max(86_400_000),
    humanConfirmation: z.literal("confirmed"),
  })
  .strict();

export type HumanObservationInput = z.infer<typeof humanObservationInputSchema>;

export function parseFounderStepFormData(formData: FormData) {
  const message = formData.get("message");
  return founderStepInputSchema.parse({
    action: formData.get("action"),
    ...(typeof message === "string" ? { message } : {}),
  });
}

export function parseFounderObservationFormData(formData: FormData) {
  return humanObservationInputSchema.parse({
    founderCorrectionCount: formData.get("founderCorrectionCount"),
    manualContextRestatementCount: formData.get("manualContextRestatementCount"),
    missingEvidenceClarityRating: formData.get("missingEvidenceClarityRating"),
    contradictionClarityRating: formData.get("contradictionClarityRating"),
    nextActorClarityRating: formData.get("nextActorClarityRating"),
    actionabilityRating: formData.get("actionabilityRating"),
    confidenceBeforeInvoicingRating: formData.get("confidenceBeforeInvoicingRating"),
    wouldUseBeforeInvoicing: formData.get("wouldUseBeforeInvoicing"),
    economicValueExplanation: formData.get("economicValueExplanation"),
    activeVisibleMilliseconds: formData.get("activeVisibleMilliseconds"),
    hiddenOrInactiveMilliseconds: formData.get("hiddenOrInactiveMilliseconds"),
    humanConfirmation: formData.get("humanConfirmation"),
  });
}

const sealedFounderObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().uuid(),
    scenarioId: z.literal("LAVAL-001-DOSSERET-1200-CAD"),
    founderObserver: z.literal("Olivier"),
    startedAtUtc: z.string().datetime(),
    completedAtUtc: z.string().datetime(),
    elapsedMinutes: z.number().nonnegative(),
    activeVisibleMinutes: z.number().nonnegative(),
    hiddenOrInactiveMinutes: z.number().nonnegative(),
    founderCorrectionCount: z.number().int().nonnegative(),
    manualContextRestatementCount: z.number().int().nonnegative(),
    missingEvidenceClarityRating: z.number().int().min(1).max(5),
    contradictionClarityRating: z.number().int().min(1).max(5),
    nextActorClarityRating: z.number().int().min(1).max(5),
    actionabilityRating: z.number().int().min(1).max(5),
    confidenceBeforeInvoicingRating: z.number().int().min(1).max(5),
    wouldUseBeforeInvoicing: z.boolean(),
    economicValueExplanation: z.string().trim().min(1).max(2000),
    humanConfirmed: z.literal(true),
    statement: z.literal(HUMAN_STATEMENT),
    actionTranscriptSha256: z.string().regex(/^[0-9a-f]{64}$/),
    postgresqlMeasurementsSha256: z.string().regex(/^[0-9a-f]{64}$/),
    verdict: z.enum([PASS_VERDICT, "REWORK", "REJECT"]),
    sealedAtUtc: z.string().datetime(),
  })
  .strict();

export type FounderTestProjection = {
  workspaceName: string;
  projectCode: string;
  projectName: string;
  extraName: string;
  amountLabel: string;
  contactName: string;
  stage: FounderTestStage;
  startedAtUtc: string | null;
  status: string;
  ready: boolean;
  missing: string[];
  evidence: Array<{ kind: string; state: string }>;
  claims: string[];
  contradictionResolved: boolean;
  nextResponsible: string;
  preparedFollowUp: null | {
    recipient: string;
    channel: string;
    body: string;
    status: "PREPARED_UNSENT";
    transportAuthorized: false;
  };
  fieldWorkerView: null | {
    workVisible: boolean;
    nextActionVisible: boolean;
    amountVisible: boolean;
  };
  duplicateCanonicalEffectCount: number;
  replayCanonicalEffectCount: number;
  reloadVerified: boolean;
  sealedVerdict: string | null;
};

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertLocalDatabase() {
  if (process.env.NODE_ENV === "production" || process.env.ENDVERA_R38_FOUNDER_TEST_MODE !== "ENABLED") {
    throw new Error("COA_R1_TEST_MODE_DISABLED");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("COA_R1_DATABASE_URL_MISSING");
  const url = new URL(raw);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    process.env.ENDVERA_R38_DISPOSABLE_DB_NAME !== "endvera-construction-operating-assistant-r38"
  ) {
    throw new Error("COA_R1_DATABASE_NOT_DISPOSABLE_LOCAL");
  }
}

export function assertLoopbackHost(host: string | null) {
  if (!host) throw new Error("COA_R1_LOOPBACK_HOST_REQUIRED");
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("COA_R1_NON_LOOPBACK_REFUSED");
  }
}

async function readSession(): Promise<StoredSession | null> {
  try {
    return storedSessionSchema.parse(JSON.parse(await readFile(SESSION_PATH, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeSession(session: StoredSession) {
  await mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await writeFile(SESSION_PATH, `${JSON.stringify(storedSessionSchema.parse(session), null, 2)}\n`, "utf8");
}

async function createOnlyJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filePath);
}

function appendTranscript(session: StoredSession, code: string): StoredSession {
  return storedSessionSchema.parse({
    ...session,
    transcript: [
      ...session.transcript,
      { sequence: session.transcript.length + 1, code, atUtc: new Date().toISOString() },
    ],
  });
}

async function seedSyntheticDossier() {
  assertLocalDatabase();
  const password = await hashPassword(FOUNDER_PASSWORD);
  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: OWNER_ID },
      update: { emailVerified: true, role: "CLIENT", name: "Olivier — test synthétique" },
      create: {
        id: OWNER_ID,
        name: "Olivier — test synthétique",
        email: FOUNDER_EMAIL,
        emailVerified: true,
        role: "CLIENT",
      },
    });
    await tx.user.upsert({
      where: { id: FIELD_ID },
      update: {},
      create: {
        id: FIELD_ID,
        name: "Employé de chantier synthétique",
        email: "field.invoice-r1@example.invalid",
        emailVerified: true,
        role: "CLIENT",
      },
    });
    await tx.user.upsert({
      where: { id: OUTSIDER_ID },
      update: {},
      create: {
        id: OUTSIDER_ID,
        name: "Compte hors espace synthétique",
        email: "outsider.invoice-r1@example.invalid",
        emailVerified: true,
        role: "CLIENT",
      },
    });
    await tx.account.upsert({
      where: { id: "coa-r1-founder-credential" },
      update: { password },
      create: {
        id: "coa-r1-founder-credential",
        accountId: OWNER_ID,
        providerId: "credential",
        userId: OWNER_ID,
        password,
      },
    });
    await tx.constructionWorkspace.upsert({
      where: { id: WORKSPACE_ID },
      update: {},
      create: {
        id: WORKSPACE_ID,
        ownerUserId: OWNER_ID,
        name: "ENDVERA Construction — Olivier",
        defaultTimezone: "America/Toronto",
        defaultLocale: "fr-CA",
        status: "active",
      },
    });
    await tx.constructionWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
      update: { role: "owner", status: "active" },
      create: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "owner", status: "active" },
    });
    await tx.constructionWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: FIELD_ID } },
      update: { role: "member", status: "active" },
      create: { workspaceId: WORKSPACE_ID, userId: FIELD_ID, role: "member", status: "active" },
    });
    await tx.constructionProject.upsert({
      where: { id: PROJECT_ID },
      update: {},
      create: {
        id: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        code: "LAVAL-001",
        name: "Rénovation Laval",
        address: "Laval, Québec — dossier synthétique",
        timezone: "America/Toronto",
        status: "active",
      },
    });
    await tx.constructionContact.upsert({
      where: { id: CONTACT_ID },
      update: {},
      create: {
        id: CONTACT_ID,
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        displayName: "Marc",
        role: "Fournisseur",
        normalizedPhone: "+15555550184",
        normalizedEmail: "marc.invoice-r1@example.invalid",
        preferredLanguage: "fr",
        status: "active",
      },
    });
    await tx.constructionMessage.upsert({
      where: { id: SOURCE_MESSAGE_ID },
      update: {},
      create: {
        id: SOURCE_MESSAGE_ID,
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        direction: "inbound",
        channel: "portal",
        idempotencyKey: "coa-r1-source-message-001",
        sender: `user:${OWNER_ID}`,
        recipients: ["ENDVERA_LOCAL"],
        originalBody: EXACT_REPORT,
        normalizedBody: EXACT_REPORT,
        status: "received",
        receivedAt: new Date("2026-09-01T13:00:00.000Z"),
      },
    });
  });
}

export async function prepareFounderTestAccess() {
  assertLocalDatabase();
  await seedSyntheticDossier();
  const tokenHash = process.env.ENDVERA_R38_FOUNDER_TOKEN_SHA256;
  const expiresAt = process.env.ENDVERA_R38_FOUNDER_TOKEN_EXPIRES_AT;
  if (!tokenHash || !/^[0-9a-f]{64}$/.test(tokenHash) || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("COA_R1_ACCESS_CONFIGURATION_INVALID");
  }
  const existing = await readSession();
  if (existing) {
    if (existing.stage !== "NOT_STARTED" || existing.startedAtUtc || existing.transcript.length > 0) {
      throw new Error("COA_R1_SECOND_FOUNDER_SESSION_REFUSED");
    }
    // A consumed admission token is not a founder test session until START is
    // recorded. Rotate both the token and cookie-bound id so a broken local
    // admission can be repaired without creating a second human observation
    // or leaving the previous browser cookie usable.
    const refreshed = storedSessionSchema.parse({
      ...existing,
      sessionId: randomUUID(),
      accessTokenHash: tokenHash,
      accessExpiresAtUtc: expiresAt,
      accessConsumedAtUtc: null,
    });
    await writeSession(refreshed);
    return refreshed;
  }
  const session = storedSessionSchema.parse({
    schemaVersion: 1,
    sessionId: randomUUID(),
    accessTokenHash: tokenHash,
    accessExpiresAtUtc: expiresAt,
    accessConsumedAtUtc: null,
    stage: "NOT_STARTED",
    startedAtUtc: null,
    completedAtUtc: null,
    loopId: null,
    contradictionId: null,
    missingAfterReport: [],
    readyStateVersion: null,
    duplicateCanonicalEffectCount: 0,
    replayCanonicalEffectCount: 0,
    stateHashBeforeReload: null,
    stateHashAfterReload: null,
    crossWorkspaceDenied: false,
    fieldWorkerFinancialLeakCount: 0,
    transcript: [],
  });
  await writeSession(session);
  return session;
}

export async function consumeFounderAccessToken(rawToken: string) {
  assertLocalDatabase();
  const session = (await readSession()) ?? (await prepareFounderTestAccess());
  if (session.accessConsumedAtUtc || Date.now() >= Date.parse(session.accessExpiresAtUtc)) {
    throw new Error("COA_R1_ACCESS_TOKEN_EXPIRED_OR_REPLAYED");
  }
  if (sha256Text(rawToken) !== session.accessTokenHash) throw new Error("COA_R1_ACCESS_TOKEN_INVALID");
  const updated = storedSessionSchema.parse({
    ...session,
    accessConsumedAtUtc: new Date().toISOString(),
  });
  await writeSession(updated);
  return updated;
}

export async function requireFounderTestSession(sessionId: string | undefined) {
  assertLocalDatabase();
  const session = await readSession();
  if (!session || !sessionId || session.sessionId !== sessionId || !session.accessConsumedAtUtc) {
    throw new Error("COA_R1_FOUNDER_SESSION_REFUSED");
  }
  return session;
}

function reportCommand() {
  return {
    schemaVersion: 1 as const,
    commandId: REPORT_COMMAND_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    actorId: OWNER_ID,
    sourceMessageId: SOURCE_MESSAGE_ID,
    commandType: "REPORT_WORK_FINISHED" as const,
    claims: {
      billingBasis: "CHANGE_ORDER" as const,
      workDescription: "Dosseret de cuisine",
      amountMinor: 120000,
      currency: "CAD" as const,
      completion: true,
      approvalState: "UNKNOWN" as const,
    },
  };
}

async function currentLoop() {
  return prisma.constructionOpenLoop.findFirstOrThrow({
    where: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID },
    select: { id: true, stateVersion: true, status: true },
  });
}

async function currentSnapshotHash(loopId: string) {
  const loop = await prisma.constructionOpenLoop.findUniqueOrThrow({
    where: { id: loopId },
    select: { stateVersion: true },
  });
  return prisma.constructionOpenLoopSnapshot.findUniqueOrThrow({
    where: { loopId_stateVersion: { loopId, stateVersion: loop.stateVersion } },
    select: { canonicalHash: true },
  });
}

export async function startFounderSession(session: StoredSession) {
  if (session.stage !== "NOT_STARTED" || session.startedAtUtc) throw new Error("COA_R1_SECOND_FOUNDER_SESSION_REFUSED");
  const startedAtUtc = new Date().toISOString();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.constructionAuditEvent.count({
      where: { workspaceId: WORKSPACE_ID, action: "founder_invoice_readiness_session_started" },
    });
    if (existing !== 0) throw new Error("COA_R1_SECOND_FOUNDER_SESSION_REFUSED");
    await appendConstructionAudit(tx, {
      workspaceId: WORKSPACE_ID,
      actorUserId: OWNER_ID,
      entityType: "founder_observation",
      entityId: session.sessionId,
      action: "founder_invoice_readiness_session_started",
      reasonCode: "OLIVIER_PRESENT_LOCAL",
      metadata: { scenarioId: "LAVAL-001-DOSSERET-1200-CAD", providerUsed: false },
    });
  });
  const updated = appendTranscript(
    storedSessionSchema.parse({ ...session, stage: "ENTER_REPORT", startedAtUtc }),
    "FOUNDER_SESSION_STARTED",
  );
  await writeSession(updated);
  return updated;
}

export async function reportWorkFinishedStep(session: StoredSession, message: string) {
  if (session.stage !== "ENTER_REPORT" || message.trim() !== EXACT_REPORT) {
    throw new Error("COA_R1_EXACT_REPORT_REQUIRED");
  }
  const result = await recordWorkFinished(reportCommand());
  if (result.replayed || result.decision.ready) throw new Error("COA_R1_INITIAL_REPORT_INVALID");
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "MISSING_EVIDENCE",
      loopId: result.loopId,
      missingAfterReport: result.decision.missing,
    }),
    "MISSING_EVIDENCE_OBSERVED",
  );
  await writeSession(updated);
  return updated;
}

export async function addContradictionStep(session: StoredSession) {
  if (session.stage !== "MISSING_EVIDENCE" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const loop = await currentLoop();
  await prisma.constructionOpenLoopFact.upsert({
    where: { id: "coa-r1-approval-claim-fact" },
    update: {},
    create: {
      id: "coa-r1-approval-claim-fact",
      loopId: loop.id,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      field: "APPROVAL_STATE",
      value: { value: "APPROVED" },
      state: "claimed",
      sourceType: "synthetic_claim",
      sourceId: CLAIM_APPROVED_ID,
      suppliedById: OWNER_ID,
      observedAt: new Date("2026-09-01T13:05:00.000Z"),
    },
  });
  const result = await recordOpenLoopContradiction({
    schemaVersion: 1,
    eventId: CONTRADICTION_EVENT_ID,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    loopId: loop.id,
    expectedStateVersion: loop.stateVersion,
    field: "APPROVAL_STATE",
    claimIds: [CLAIM_APPROVED_ID, CLAIM_UNVERIFIED_ID],
  });
  const contradiction = await prisma.constructionOpenLoopContradiction.findFirstOrThrow({
    where: { loopId: loop.id, claimIds: { hasEvery: [CLAIM_APPROVED_ID, CLAIM_UNVERIFIED_ID] } },
    select: { id: true },
  });
  if (result.decision.ready || result.decision.contradictions.length !== 1) {
    throw new Error("COA_R1_CONTRADICTION_NOT_PRESERVED");
  }
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "CONTRADICTION_VISIBLE",
      contradictionId: contradiction.id,
    }),
    "CONTRADICTORY_CLAIMS_VISIBLE",
  );
  await writeSession(updated);
  return updated;
}

export async function resolveContradictionStep(session: StoredSession) {
  if (session.stage !== "CONTRADICTION_VISIBLE" || !session.loopId || !session.contradictionId) {
    throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  }
  const loop = await currentLoop();
  const result = await resolveOpenLoopContradiction({
    schemaVersion: 1,
    eventId: RESOLUTION_EVENT_ID,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    loopId: loop.id,
    contradictionId: session.contradictionId,
    expectedStateVersion: loop.stateVersion,
    acceptedClaimId: CLAIM_UNVERIFIED_ID,
    reason: EXACT_RESOLUTION,
  });
  if (result.decision.ready || result.decision.contradictions.length !== 0) {
    throw new Error("COA_R1_OWNER_RESOLUTION_FAILED");
  }
  const updated = appendTranscript(
    storedSessionSchema.parse({ ...session, stage: "CONTRADICTION_RESOLVED" }),
    "OWNER_RESOLUTION_RECORDED",
  );
  await writeSession(updated);
  return updated;
}

export async function addWrittenApprovalStep(session: StoredSession) {
  if (session.stage !== "CONTRADICTION_RESOLVED" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const loop = await currentLoop();
  const result = await addInvoiceReadinessEvidence({
    schemaVersion: 1,
    eventId: APPROVAL_EVIDENCE_ID,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    loopId: loop.id,
    expectedStateVersion: loop.stateVersion,
    kind: "WRITTEN_APPROVAL",
    state: "VERIFIED",
    sourceRef: "synthetic://coa-r1/laval/written-approval.txt",
    contentHash: sha256Text("Synthetic written approval for LAVAL-001 backsplash 1200 CAD"),
  });
  if (result.decision.ready) throw new Error("COA_R1_READY_WITHOUT_PHOTO");
  const updated = appendTranscript(
    storedSessionSchema.parse({ ...session, stage: "WRITTEN_APPROVAL_ADDED" }),
    "WRITTEN_APPROVAL_VERIFIED",
  );
  await writeSession(updated);
  return updated;
}

export async function addPhotoStep(session: StoredSession) {
  if (session.stage !== "WRITTEN_APPROVAL_ADDED" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const loop = await currentLoop();
  const result = await addInvoiceReadinessEvidence({
    schemaVersion: 1,
    eventId: PHOTO_EVIDENCE_ID,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    loopId: loop.id,
    expectedStateVersion: loop.stateVersion,
    kind: "PHOTO",
    state: "VERIFIED",
    sourceRef: "synthetic://coa-r1/laval/completed-backsplash.jpg",
    contentHash: sha256Text("Synthetic photo proving completed LAVAL-001 backsplash"),
  });
  if (!result.decision.ready || result.decision.status !== "READY_TO_INVOICE") {
    throw new Error("COA_R1_READY_TO_INVOICE_NOT_REACHED");
  }
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "READY_TO_INVOICE",
      readyStateVersion: result.decision.stateVersion,
    }),
    "READY_TO_INVOICE_REACHED",
  );
  await writeSession(updated);
  return updated;
}

export async function testReplayStep(session: StoredSession) {
  if (session.stage !== "READY_TO_INVOICE" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const before = await Promise.all([
    prisma.constructionOpenLoop.count({ where: { workspaceId: WORKSPACE_ID } }),
    prisma.constructionOpenLoopTransition.count({ where: { loopId: session.loopId } }),
    prisma.constructionOpenLoopEvidence.count({ where: { loopId: session.loopId } }),
  ]);
  const reportReplay = await recordWorkFinished(reportCommand());
  const evidenceReplay = await addInvoiceReadinessEvidence({
    schemaVersion: 1,
    eventId: APPROVAL_EVIDENCE_ID,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    loopId: session.loopId,
    expectedStateVersion: 3,
    kind: "WRITTEN_APPROVAL",
    state: "VERIFIED",
    sourceRef: "synthetic://coa-r1/laval/written-approval.txt",
    contentHash: sha256Text("Synthetic written approval for LAVAL-001 backsplash 1200 CAD"),
  });
  const after = await Promise.all([
    prisma.constructionOpenLoop.count({ where: { workspaceId: WORKSPACE_ID } }),
    prisma.constructionOpenLoopTransition.count({ where: { loopId: session.loopId } }),
    prisma.constructionOpenLoopEvidence.count({ where: { loopId: session.loopId } }),
  ]);
  if (!reportReplay.replayed || !evidenceReplay.replayed) throw new Error("COA_R1_REPLAY_NOT_REFUSED");
  const duplicateCanonicalEffectCount = Math.max(0, after[0] - before[0]);
  const replayCanonicalEffectCount = Math.max(0, after[1] - before[1]) + Math.max(0, after[2] - before[2]);
  if (duplicateCanonicalEffectCount !== 0 || replayCanonicalEffectCount !== 0) {
    throw new Error("COA_R1_REPLAY_CREATED_EFFECT");
  }
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "REPLAY_REFUSED",
      duplicateCanonicalEffectCount,
      replayCanonicalEffectCount,
    }),
    "DUPLICATE_AND_REPLAY_REFUSED",
  );
  await writeSession(updated);
  return updated;
}

export async function markReloadStep(session: StoredSession) {
  if (session.stage !== "REPLAY_REFUSED" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const before = await currentSnapshotHash(session.loopId);
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "AWAITING_RELOAD",
      stateHashBeforeReload: before.canonicalHash,
    }),
    "RELOAD_REQUESTED",
  );
  await writeSession(updated);
  return updated;
}

export async function completeReloadCheckpoint(session: StoredSession) {
  if (session.stage !== "AWAITING_RELOAD" || !session.loopId || !session.stateHashBeforeReload) {
    return session;
  }
  const after = await currentSnapshotHash(session.loopId);
  if (after.canonicalHash !== session.stateHashBeforeReload) throw new Error("COA_R1_RELOAD_STATE_HASH_DRIFT");
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "RELOAD_VERIFIED",
      stateHashAfterReload: after.canonicalHash,
    }),
    "FULL_RELOAD_STATE_VERIFIED",
  );
  await writeSession(updated);
  return updated;
}

export async function prepareFollowUpStep(session: StoredSession) {
  if (session.stage !== "RELOAD_VERIFIED" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const loop = await currentLoop();
  const result = await prepareInvoiceEvidenceRequest({
    schemaVersion: 1,
    requestId: FOLLOW_UP_REQUEST_ID,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    loopId: session.loopId,
    expectedStateVersion: loop.stateVersion,
    contactId: CONTACT_ID,
    channel: "SMS",
    body: FOLLOW_UP_BODY,
  });
  if (result.disposition !== "PREPARED_UNSENT") throw new Error("COA_R1_FOLLOW_UP_NOT_UNSENT");
  const updated = appendTranscript(
    storedSessionSchema.parse({ ...session, stage: "FOLLOW_UP_PREPARED" }),
    "FOLLOW_UP_PREPARED_UNSENT",
  );
  await writeSession(updated);
  return updated;
}

export async function verifyFieldViewStep(session: StoredSession) {
  if (session.stage !== "FOLLOW_UP_PREPARED" || !session.loopId) throw new Error("COA_R1_STEP_SEQUENCE_REFUSED");
  const fieldProjection = await openLoopProjectionForUser({
    userId: FIELD_ID,
    workspaceId: WORKSPACE_ID,
    loopId: session.loopId,
  });
  const fieldWorkerFinancialLeakCount =
    "amountMinor" in fieldProjection || "currency" in fieldProjection ? 1 : 0;
  let crossWorkspaceDenied = false;
  try {
    await openLoopProjectionForUser({ userId: OUTSIDER_ID, workspaceId: WORKSPACE_ID, loopId: session.loopId });
  } catch (error) {
    crossWorkspaceDenied = (error as Error).message === "CONSTRUCTION_RESOURCE_NOT_FOUND";
  }
  if (fieldWorkerFinancialLeakCount !== 0 || !crossWorkspaceDenied) {
    throw new Error("COA_R1_ROLE_OR_WORKSPACE_BOUNDARY_FAILED");
  }
  const updated = appendTranscript(
    storedSessionSchema.parse({
      ...session,
      stage: "HUMAN_OBSERVATION",
      crossWorkspaceDenied,
      fieldWorkerFinancialLeakCount,
    }),
    "FIELD_WORKER_AND_WORKSPACE_BOUNDARIES_VERIFIED",
  );
  await writeSession(updated);
  return updated;
}

function humanPass(input: HumanObservationInput) {
  return (
    input.missingEvidenceClarityRating >= 4 &&
    input.contradictionClarityRating >= 4 &&
    input.nextActorClarityRating >= 4 &&
    input.actionabilityRating >= 4 &&
    input.confidenceBeforeInvoicingRating >= 4 &&
    input.wouldUseBeforeInvoicing &&
    input.manualContextRestatementCount === 0 &&
    input.economicValueExplanation.trim().length > 0
  );
}

export async function computePostgresqlMeasurements(session: StoredSession) {
  if (!session.loopId || !session.startedAtUtc) throw new Error("COA_R1_SESSION_INCOMPLETE");
  const [loop, loops, contradiction, evidence, transitions, snapshots, actions, auditSessions, providerInvocations] =
    await Promise.all([
      prisma.constructionOpenLoop.findUniqueOrThrow({
        where: { id: session.loopId },
        select: { projectId: true, status: true, stateVersion: true, nextResponsibleRole: true, nextAction: true },
      }),
      prisma.constructionOpenLoop.count({ where: { workspaceId: WORKSPACE_ID } }),
      prisma.constructionOpenLoopContradiction.findFirstOrThrow({
        where: { loopId: session.loopId },
        select: { claimIds: true, status: true, resolvedById: true },
      }),
      prisma.constructionOpenLoopEvidence.findMany({
        where: { loopId: session.loopId },
        select: { kind: true, state: true },
      }),
      prisma.constructionOpenLoopTransition.findMany({
        where: { loopId: session.loopId },
        select: { nextVersion: true },
      }),
      prisma.constructionOpenLoopSnapshot.findMany({
        where: { loopId: session.loopId },
        orderBy: { stateVersion: "asc" },
        select: { stateVersion: true, snapshot: true },
      }),
      prisma.constructionAction.findMany({
        where: { openLoopId: session.loopId, type: "follow_up" },
        select: { status: true, payload: true, simulatedDeliveryCount: true },
      }),
      prisma.constructionAuditEvent.count({
        where: { workspaceId: WORKSPACE_ID, action: "founder_invoice_readiness_session_started" },
      }),
      prisma.constructionMessage.count({
        where: { workspaceId: WORKSPACE_ID, provider: { not: null } },
      }),
    ]);
  const action = actions[0];
  const payload = action?.payload as Record<string, unknown> | undefined;
  const readyBeforeRequiredEvidenceCount = snapshots.filter((snapshot) => {
    const value = snapshot.snapshot as Record<string, unknown>;
    return value.ready === true && snapshot.stateVersion < (session.readyStateVersion ?? Number.MAX_SAFE_INTEGER);
  }).length;
  const facts = await prisma.constructionOpenLoopFact.findMany({
    where: { loopId: session.loopId },
    select: { field: true, sourceId: true },
  });
  const allowedFields = new Set([
    "PROJECT_ASSOCIATION",
    "WORK_DESCRIPTION",
    "AMOUNT",
    "COMPLETION_ASSERTION",
    "APPROVAL_STATE",
  ]);
  const inventedFactCount = facts.filter((fact) => !allowedFields.has(fact.field)).length;
  const transportAuthorized = payload?.transportAuthorized === true;
  const externalTransportCount = actions.reduce((sum, item) => sum + item.simulatedDeliveryCount, 0);
  return {
    schemaVersion: 1,
    projectAssociationAccuracyPercent: loop.projectId === PROJECT_ID ? 100 : 0,
    canonicalOpenLoopCount: loops,
    duplicateCanonicalEffectCount: session.duplicateCanonicalEffectCount,
    replayCanonicalEffectCount: session.replayCanonicalEffectCount,
    stateHashBeforeReload: session.stateHashBeforeReload,
    stateHashAfterReload: session.stateHashAfterReload,
    restartProjectionIdentical:
      Boolean(session.stateHashBeforeReload) && session.stateHashBeforeReload === session.stateHashAfterReload,
    missingEvidenceDetectedCount: session.missingAfterReport.length,
    contradictionClaimCount: contradiction.claimIds.length,
    contradictionClaimsPreserved:
      contradiction.claimIds.includes(CLAIM_APPROVED_ID) && contradiction.claimIds.includes(CLAIM_UNVERIFIED_ID),
    contradictionResolutionAuthorized: contradiction.status === "resolved" && contradiction.resolvedById === OWNER_ID,
    readyBeforeRequiredEvidenceCount,
    readyToInvoiceReached: loop.status === "ready_to_invoice",
    nextResponsibleActorCorrect:
      loop.nextResponsibleRole === "OFFICE_OR_ACCOUNTING" && loop.nextAction === "PREPARE_INVOICE",
    preparedFollowUpCount: actions.length,
    preparedFollowUpStatus: payload?.disposition ?? null,
    transportAuthorized,
    externalTransportCount,
    providerInvocationCount: providerInvocations,
    crossWorkspaceReadCount: session.crossWorkspaceDenied ? 0 : 1,
    fieldWorkerFinancialLeakCount: session.fieldWorkerFinancialLeakCount,
    inventedFactCount,
    humanSessionCount: auditSessions,
    evidenceKinds: evidence.map((item) => `${item.kind}:${item.state}`).sort(),
    transitionCount: transitions.length,
  };
}

function technicalPass(measurements: Awaited<ReturnType<typeof computePostgresqlMeasurements>>) {
  return (
    measurements.projectAssociationAccuracyPercent === 100 &&
    measurements.canonicalOpenLoopCount === 1 &&
    measurements.duplicateCanonicalEffectCount === 0 &&
    measurements.replayCanonicalEffectCount === 0 &&
    measurements.restartProjectionIdentical &&
    measurements.stateHashBeforeReload === measurements.stateHashAfterReload &&
    measurements.contradictionClaimCount >= 2 &&
    measurements.contradictionClaimsPreserved &&
    measurements.contradictionResolutionAuthorized &&
    measurements.readyBeforeRequiredEvidenceCount === 0 &&
    measurements.readyToInvoiceReached &&
    measurements.nextResponsibleActorCorrect &&
    measurements.preparedFollowUpCount === 1 &&
    measurements.preparedFollowUpStatus === "PREPARED_UNSENT" &&
    measurements.transportAuthorized === false &&
    measurements.externalTransportCount === 0 &&
    measurements.providerInvocationCount === 0 &&
    measurements.crossWorkspaceReadCount === 0 &&
    measurements.fieldWorkerFinancialLeakCount === 0 &&
    measurements.inventedFactCount === 0 &&
    measurements.humanSessionCount === 1
  );
}

function boundaryViolation(measurements: Awaited<ReturnType<typeof computePostgresqlMeasurements>>) {
  return (
    measurements.canonicalOpenLoopCount > 1 ||
    measurements.readyBeforeRequiredEvidenceCount > 0 ||
    !measurements.contradictionClaimsPreserved ||
    measurements.transportAuthorized ||
    measurements.externalTransportCount > 0 ||
    measurements.providerInvocationCount > 0 ||
    measurements.crossWorkspaceReadCount > 0 ||
    measurements.fieldWorkerFinancialLeakCount > 0 ||
    measurements.inventedFactCount > 0 ||
    measurements.humanSessionCount > 1
  );
}

export async function sealFounderObservation(session: StoredSession, input: HumanObservationInput) {
  if (process.env.ENDVERA_R38_HUMAN_OBSERVATION !== "OLIVIER_PRESENT") {
    throw new Error("COA_R1_REAL_FOUNDER_PRESENCE_REQUIRED");
  }
  if (session.stage !== "HUMAN_OBSERVATION" || session.completedAtUtc) {
    throw new Error("COA_R1_FOUNDER_SUBMISSION_REFUSED");
  }
  const parsed = humanObservationInputSchema.parse(input);
  const measurements = await computePostgresqlMeasurements(session);
  const verdict = boundaryViolation(measurements)
    ? "REJECT"
    : technicalPass(measurements) && humanPass(parsed)
      ? PASS_VERDICT
      : "REWORK";
  const completedAtUtc = new Date().toISOString();
  const measurementsHash = sha256Canonical(measurements);
  const transcriptHash = sha256Canonical(session.transcript);
  const elapsedMinutes = Math.max(
    0,
    (Date.parse(completedAtUtc) - Date.parse(session.startedAtUtc as string)) / 60_000,
  );
  const observation = {
    schemaVersion: 1,
    sessionId: session.sessionId,
    scenarioId: "LAVAL-001-DOSSERET-1200-CAD",
    founderObserver: "Olivier",
    startedAtUtc: session.startedAtUtc,
    completedAtUtc,
    elapsedMinutes,
    activeVisibleMinutes: parsed.activeVisibleMilliseconds / 60_000,
    hiddenOrInactiveMinutes: parsed.hiddenOrInactiveMilliseconds / 60_000,
    founderCorrectionCount: parsed.founderCorrectionCount,
    manualContextRestatementCount: parsed.manualContextRestatementCount,
    missingEvidenceClarityRating: parsed.missingEvidenceClarityRating,
    contradictionClarityRating: parsed.contradictionClarityRating,
    nextActorClarityRating: parsed.nextActorClarityRating,
    actionabilityRating: parsed.actionabilityRating,
    confidenceBeforeInvoicingRating: parsed.confidenceBeforeInvoicingRating,
    wouldUseBeforeInvoicing: parsed.wouldUseBeforeInvoicing,
    economicValueExplanation: parsed.economicValueExplanation,
    humanConfirmed: true,
    statement: HUMAN_STATEMENT,
    actionTranscriptSha256: transcriptHash,
    postgresqlMeasurementsSha256: measurementsHash,
    verdict,
    sealedAtUtc: completedAtUtc,
  };
  await createOnlyJson(MEASUREMENTS_PATH, measurements);
  await createOnlyJson(OBSERVATION_PATH, observation);
  const sealed = appendTranscript(
    storedSessionSchema.parse({ ...session, stage: "SEALED", completedAtUtc }),
    "FOUNDER_OBSERVATION_SEALED",
  );
  await writeSession(sealed);
  return { verdict, observation, measurements };
}

export async function validateSealedFounderEvidence() {
  assertLocalDatabase();
  const session = storedSessionSchema.parse(JSON.parse(await readFile(SESSION_PATH, "utf8")));
  const observation = sealedFounderObservationSchema.parse(
    JSON.parse(await readFile(OBSERVATION_PATH, "utf8")),
  );
  const persistedMeasurements = JSON.parse(await readFile(MEASUREMENTS_PATH, "utf8")) as Awaited<
    ReturnType<typeof computePostgresqlMeasurements>
  >;
  if (session.stage !== "SEALED" || !session.completedAtUtc) {
    throw new Error("COA_R1_SESSION_NOT_SEALED");
  }
  if (observation.sessionId !== session.sessionId) {
    throw new Error("COA_R1_OBSERVATION_SESSION_DRIFT");
  }
  if (observation.completedAtUtc !== session.completedAtUtc || observation.sealedAtUtc !== session.completedAtUtc) {
    throw new Error("COA_R1_OBSERVATION_SEAL_TIME_DRIFT");
  }
  if (observation.actionTranscriptSha256 !== sha256Canonical(session.transcript.slice(0, -1))) {
    throw new Error("COA_R1_TRANSCRIPT_HASH_DRIFT");
  }
  const recomputedMeasurements = await computePostgresqlMeasurements(session);
  const recomputedHash = sha256Canonical(recomputedMeasurements);
  if (
    recomputedHash !== observation.postgresqlMeasurementsSha256 ||
    recomputedHash !== sha256Canonical(persistedMeasurements)
  ) {
    throw new Error("COA_R1_POSTGRESQL_MEASUREMENTS_DRIFT");
  }
  const expectedVerdict = boundaryViolation(recomputedMeasurements)
    ? "REJECT"
    : technicalPass(recomputedMeasurements) &&
        humanPass({
          founderCorrectionCount: observation.founderCorrectionCount,
          manualContextRestatementCount: observation.manualContextRestatementCount,
          missingEvidenceClarityRating: observation.missingEvidenceClarityRating,
          contradictionClarityRating: observation.contradictionClarityRating,
          nextActorClarityRating: observation.nextActorClarityRating,
          actionabilityRating: observation.actionabilityRating,
          confidenceBeforeInvoicingRating: observation.confidenceBeforeInvoicingRating,
          wouldUseBeforeInvoicing: observation.wouldUseBeforeInvoicing,
          economicValueExplanation: observation.economicValueExplanation,
          activeVisibleMilliseconds: Math.round(observation.activeVisibleMinutes * 60_000),
          hiddenOrInactiveMilliseconds: Math.round(observation.hiddenOrInactiveMinutes * 60_000),
          humanConfirmation: "confirmed",
        })
      ? PASS_VERDICT
      : "REWORK";
  if (observation.verdict !== expectedVerdict) {
    throw new Error("COA_R1_VERDICT_DRIFT");
  }
  return {
    verdict: observation.verdict,
    sessionId: observation.sessionId,
    measurementsSha256: recomputedHash,
    humanSealValid: true,
    postgresqlRecomputed: true,
  };
}

export async function loadFounderTestProjection(session: StoredSession): Promise<FounderTestProjection> {
  let status = "NOT_STARTED";
  let ready = false;
  let missing: string[] = [];
  let evidence: Array<{ kind: string; state: string }> = [];
  let contradictionResolved = false;
  let nextResponsible = "Olivier — propriétaire ou bureau";
  let preparedFollowUp: FounderTestProjection["preparedFollowUp"] = null;
  let fieldWorkerView: FounderTestProjection["fieldWorkerView"] = null;
  if (session.loopId) {
    const loop = await prisma.constructionOpenLoop.findUniqueOrThrow({
      where: { id: session.loopId },
      include: {
        evidence: { orderBy: { createdAt: "asc" } },
        contradictions: true,
        actions: { where: { type: "follow_up" }, orderBy: { createdAt: "desc" }, take: 1 },
        snapshots: { orderBy: { stateVersion: "desc" }, take: 1 },
      },
    });
    const decision = loop.snapshots[0]?.snapshot as {
      ready?: boolean;
      status?: string;
      missing?: string[];
      nextResponsible?: { role?: string };
    };
    status = decision.status ?? loop.status;
    ready = decision.ready === true;
    missing = decision.missing ?? [];
    evidence = loop.evidence.map((item) => ({ kind: item.kind, state: item.state }));
    contradictionResolved = loop.contradictions.some((item) => item.status === "resolved");
    const role = decision.nextResponsible?.role;
    nextResponsible =
      role === "OFFICE_OR_ACCOUNTING"
        ? "Olivier ou la personne responsable de la facturation"
        : role === "AUTHORIZED_VERIFIER"
          ? "Olivier — propriétaire autorisé"
          : role === "ASSIGNED_FIELD_ROLE"
            ? "Employé de chantier responsable de la preuve"
            : "Olivier — propriétaire ou bureau";
    const action = loop.actions[0];
    if (action) {
      const payload = action.payload as Record<string, unknown>;
      preparedFollowUp = {
        recipient: "Marc",
        channel: "SMS simulé",
        body: String(payload.body ?? ""),
        status: "PREPARED_UNSENT",
        transportAuthorized: false,
      };
    }
    if (["FIELD_VIEW_VERIFIED", "HUMAN_OBSERVATION", "SEALED"].includes(session.stage)) {
      fieldWorkerView = { workVisible: true, nextActionVisible: true, amountVisible: false };
    }
  }
  let sealedVerdict: string | null = null;
  if (session.stage === "SEALED") {
    const observation = JSON.parse(await readFile(OBSERVATION_PATH, "utf8")) as { verdict: string };
    sealedVerdict = observation.verdict;
  }
  return {
    workspaceName: "ENDVERA Construction — Olivier",
    projectCode: "LAVAL-001",
    projectName: "Rénovation Laval",
    extraName: "Dosseret de cuisine",
    amountLabel: "1 200 CAD",
    contactName: "Marc",
    stage: session.stage,
    startedAtUtc: session.startedAtUtc,
    status,
    ready,
    missing,
    evidence,
    claims:
      STAGES.indexOf(session.stage) >= STAGES.indexOf("CONTRADICTION_VISIBLE")
        ? [APPROVED_CLAIM, NO_WRITTEN_CLAIM]
        : [],
    contradictionResolved,
    nextResponsible,
    preparedFollowUp,
    fieldWorkerView,
    duplicateCanonicalEffectCount: session.duplicateCanonicalEffectCount,
    replayCanonicalEffectCount: session.replayCanonicalEffectCount,
    reloadVerified:
      Boolean(session.stateHashBeforeReload) && session.stateHashBeforeReload === session.stateHashAfterReload,
    sealedVerdict,
  };
}

export async function sessionStatus() {
  const session = await readSession();
  return session ? { stage: session.stage, sessionId: session.sessionId } : null;
}

export function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

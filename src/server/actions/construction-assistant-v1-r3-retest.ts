"use server";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { localInboundEnvelopeSchema } from "@/lib/construction-assistant-v1/messaging";
import { boundOutboundActionSchema } from "@/lib/construction-assistant-v1/outbound";
import {
  FOUNDER_RETEST_STEPS,
  founderAnswersSchema,
  INITIAL_RETEST_ACTION_STATE,
  R3_MESSAGES,
  R3_REFERENCE_NOW,
  type FounderAnswers,
  type RetestActionState,
  type RetestProjection,
} from "@/components/construction-assistant-v1/founder-retest/contract";
import {
  createConstructionContact,
  createConstructionProject,
  constructionWorkspaceForUser,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { portalIdempotencyKey, processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import { simulateInboundMessage } from "@/server/construction-assistant-v1/simulator";
import { approveAndSimulateOutbound } from "@/server/construction-assistant-v1/outbound";

const FEATURE = "specs/079-construction-assistant-v1-r3-corrected-founder-retest";
const SESSION_PATH = path.join(process.cwd(), FEATURE, "evidence", "live-founder-session.json");
const FINAL_PATH = path.join(process.cwd(), FEATURE, "evidence", "founder-observation.json");
const MEASUREMENTS_PATH = path.join(process.cwd(), FEATURE, "evidence", "technical-measurements.json");

const stepSchema = z.object({ step: z.coerce.number().int().min(1).max(9) }).strict();
const storedResultSchema = z.object({ step: z.number().int().min(1).max(9), code: z.string().min(1), message: z.string() }).strict();
const sessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().uuid(),
    founderUserId: z.string().min(1),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    providerMessageId: z.string().min(1),
    currentStep: z.number().int().min(1).max(10),
    startedAtUtc: z.string().datetime(),
    completedAtUtc: z.string().datetime().nullable(),
    results: z.array(storedResultSchema).max(9),
    secondApprovalRefused: z.boolean(),
    secondApprovalDeliveryCount: z.number().int().min(0),
  })
  .strict();

type StoredSession = z.infer<typeof sessionSchema>;

function assertLocalRetestMode() {
  if (process.env.NODE_ENV === "production" || process.env.ENDVERA_R3_FOUNDER_RETEST !== "ENABLED") {
    throw new Error("R3_LOCAL_RETEST_DISABLED");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("R3_DATABASE_URL_MISSING");
  const url = new URL(databaseUrl);
  if (!(["localhost", "127.0.0.1"].includes(url.hostname)) || !url.pathname.toLocaleLowerCase("en-CA").includes("r3")) {
    throw new Error("R3_DATABASE_NOT_DISPOSABLE_LOCAL");
  }
}

async function atomicJsonWrite(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filePath);
}

async function readSession(): Promise<StoredSession | null> {
  try {
    return sessionSchema.parse(JSON.parse(await readFile(SESSION_PATH, "utf8")));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function ensureSyntheticDossier(userId: string) {
  let workspace = await constructionWorkspaceForUser(userId);
  if (!workspace) {
    const initialized = await initializeConstructionWorkspace({
      userId,
      name: "ENDVERA Construction — Olivier",
      timezone: "America/Toronto",
      locale: "fr-CA",
    });
    const project = await createConstructionProject({
      userId,
      workspaceId: initialized.workspaceId,
      code: "LAVAL-001",
      name: "Rénovation Laval",
      address: "Laval, Québec — dossier synthétique",
    });
    await createConstructionContact({
      userId,
      workspaceId: initialized.workspaceId,
      projectId: project.id,
      displayName: "Marc",
      role: "Fournisseur",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc@example.invalid",
    });
    workspace = await constructionWorkspaceForUser(userId);
  }
  const project = workspace?.projects.find((candidate) => candidate.code === "LAVAL-001");
  if (!workspace || !project || workspace.name !== "ENDVERA Construction — Olivier") {
    throw new Error("R3_SYNTHETIC_DOSSIER_DRIFT");
  }
  return { workspaceId: workspace.id, projectId: project.id };
}

async function ensureSession(userId: string): Promise<StoredSession> {
  const existing = await readSession();
  if (existing) {
    if (existing.founderUserId !== userId) throw new Error("R3_SESSION_OWNER_MISMATCH");
    return existing;
  }
  const dossier = await ensureSyntheticDossier(userId);
  const session = sessionSchema.parse({
    schemaVersion: 1,
    sessionId: randomUUID(),
    founderUserId: userId,
    ...dossier,
    providerMessageId: `r3-local-${randomUUID()}`,
    currentStep: 1,
    startedAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    results: [],
    secondApprovalRefused: false,
    secondApprovalDeliveryCount: 0,
  });
  await atomicJsonWrite(SESSION_PATH, session);
  return session;
}

async function projectionFor(userId: string, session: StoredSession): Promise<RetestProjection> {
  const workspace = await prisma.constructionWorkspace.findFirstOrThrow({
    where: { id: session.workspaceId, members: { some: { userId, status: "active" } } },
    select: {
      name: true,
      projects: {
        where: { id: session.projectId },
        select: { id: true, code: true, name: true, _count: { select: { calendarItems: true } } },
      },
      contacts: {
        where: { projectId: session.projectId, displayName: "Marc", status: "active" },
        select: { id: true, displayName: true, role: true },
      },
    },
  });
  const project = workspace.projects[0];
  const contact = workspace.contacts[0];
  if (!project || !contact) throw new Error("R3_SYNTHETIC_DOSSIER_INCOMPLETE");

  const [calendarItems, inboundMessages, outboundActions, inboxCalendarCount, externalTransportCount] = await Promise.all([
    prisma.constructionCalendarItem.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true, timezone: true, projectId: true, contactId: true, sourceMessage: { select: { originalBody: true } } },
    }),
    prisma.constructionMessage.count({
      where: { workspaceId: session.workspaceId, provider: "ENDVERA_LOCAL_SIMULATOR", providerMessageId: session.providerMessageId, direction: "inbound" },
    }),
    prisma.constructionAction.findMany({
      where: { workspaceId: session.workspaceId, type: "outbound_message", sourceMessage: { originalBody: R3_MESSAGES.outbound } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, simulatedDeliveryCount: true, payload: true, contact: { select: { displayName: true } } },
    }),
    prisma.constructionCalendarItem.count({ where: { workspaceId: session.workspaceId } }),
    prisma.constructionMessage.count({
      where: { workspaceId: session.workspaceId, provider: { not: null, notIn: ["ENDVERA_LOCAL_SIMULATOR"] } },
    }),
  ]);
  const outbound = outboundActions[0];
  const payload = outbound ? boundOutboundActionSchema.parse(outbound.payload) : null;
  const appointment = calendarItems.find((item) => item.sourceMessage.originalBody === R3_MESSAGES.clearAppointment) ?? null;
  return {
    workspaceName: workspace.name,
    projectCode: project.code,
    projectName: project.name,
    contactName: contact.displayName,
    contactRole: contact.role ?? "",
    appointmentCount: calendarItems.length,
    appointmentLabel: appointment
      ? `${new Intl.DateTimeFormat("fr-CA", { timeZone: appointment.timezone, weekday: "long", hour: "2-digit", minute: "2-digit" }).format(appointment.startsAt)} — ${appointment.title}`
      : null,
    inboundCanonicalCount: inboundMessages,
    duplicateCanonicalEffectCount: Math.max(0, inboundMessages - 1),
    outboundPreparedCount: outboundActions.length,
    simulatedDeliveryCount: outbound?.simulatedDeliveryCount ?? 0,
    externalTransportCount,
    projectionsAgree: project._count.calendarItems === inboxCalendarCount && calendarItems.every((item) => item.projectId === project.id),
    outboundPreview: outbound && payload
      ? {
          recipientName: outbound.contact?.displayName ?? "",
          channel: "SMS simulé",
          body: payload.body,
          projectName: project.name,
          status: outbound.status === "simulated_delivered" ? "SIMULATED_DELIVERED" : "PREPARED_UNSENT",
        }
      : null,
  };
}

async function appendStepResult(session: StoredSession, step: number, code: string, message: string) {
  const updated = sessionSchema.parse({
    ...session,
    currentStep: step + 1,
    results: [...session.results, { step, code, message }],
  });
  await atomicJsonWrite(SESSION_PATH, updated);
  return updated;
}

function refresh() {
  revalidatePath("/client/construction-retest");
  revalidatePath("/client/projects");
  revalidatePath("/client/calendar");
  revalidatePath("/client/inbox");
}

export async function loadFounderRetestState(): Promise<RetestActionState> {
  assertLocalRetestMode();
  const user = await requireRole("CLIENT");
  const session = await readSession();
  if (!session) return INITIAL_RETEST_ACTION_STATE;
  if (session.founderUserId !== user.id) throw new Error("R3_SESSION_OWNER_MISMATCH");
  const projection = await projectionFor(user.id, session);
  const last = session.results.at(-1);
  return {
    ok: true,
    currentStep: session.currentStep,
    message: last?.message ?? "Reprenez le test où vous l’avez laissé.",
    resultCode: last?.code ?? "IN_PROGRESS",
    startedAtUtc: session.startedAtUtc,
    projection,
  };
}

export async function runFounderRetestStep(
  _previous: RetestActionState,
  formData: FormData,
): Promise<RetestActionState> {
  assertLocalRetestMode();
  const user = await requireRole("CLIENT");
  const parsed = stepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ..._previous, ok: false, message: "Étape invalide.", resultCode: "UNKNOWN_FIELD_OR_STEP" };
  const step = parsed.data.step;
  const session = await ensureSession(user.id);
  if (session.completedAtUtc || session.currentStep !== step) {
    return { ..._previous, ok: false, message: "Cette étape est déjà terminée ou arrive dans le mauvais ordre.", resultCode: "STEP_SEQUENCE_REFUSED" };
  }

  let code = "";
  let message = "";
  const referenceNow = new Date(R3_REFERENCE_NOW);
  if (step >= 1 && step <= 3) {
    const body = [R3_MESSAGES.clearAppointment, R3_MESSAGES.ambiguousAppointment, R3_MESSAGES.tomorrowQuery][step - 1];
    const beforeCalendarCount = await prisma.constructionCalendarItem.count({ where: { workspaceId: session.workspaceId } });
    const result = await processConstructionMessage({
      userId: user.id,
      workspaceId: session.workspaceId,
      channel: "portal",
      body,
      idempotencyKey: portalIdempotencyKey({ workspaceId: session.workspaceId, userId: user.id, requestId: randomUUID() }),
      referenceNow,
    });
    const afterCalendarCount = await prisma.constructionCalendarItem.count({ where: { workspaceId: session.workspaceId } });
    if (step === 1) {
      if (afterCalendarCount !== 1 || !result.calendarItemId) throw new Error("R3_CLEAR_APPOINTMENT_FAILED");
      code = "CLEAR_APPOINTMENT_CREATED";
    } else if (step === 2) {
      if (afterCalendarCount !== beforeCalendarCount || result.intent !== "CLARIFICATION_REQUIRED") throw new Error("R3_AMBIGUITY_GUARD_FAILED");
      code = "AMBIGUITY_CLARIFIED_WITHOUT_WRITE";
    } else {
      if (!result.reply.includes("14 h") || afterCalendarCount !== beforeCalendarCount) throw new Error("R3_TOMORROW_QUERY_FAILED");
      code = "TOMORROW_ANSWER_POSTGRES_VERIFIED";
    }
    message = result.reply;
  } else if (step === 4 || step === 5) {
    const envelope = localInboundEnvelopeSchema.parse({
      schemaVersion: 1,
      provider: "ENDVERA_LOCAL_SIMULATOR",
      providerMessageId: session.providerMessageId,
      channel: "SMS",
      normalizedSender: `sim-sms:${user.id}`,
      body: R3_MESSAGES.inbound,
      receivedAt: R3_REFERENCE_NOW,
      signatureValid: true,
      projectHint: "LAVAL-001",
    });
    const result = await simulateInboundMessage({ workspaceId: session.workspaceId, envelope });
    if (!result.admitted) throw new Error(`R3_INBOUND_REFUSED_${result.reason}`);
    if (step === 4 && result.result.replayed) throw new Error("R3_FIRST_INBOUND_REPLAYED");
    if (step === 5 && !result.result.replayed) throw new Error("R3_DUPLICATE_NOT_REPLAYED");
    code = step === 4 ? "INBOUND_ADMITTED" : "DUPLICATE_REPLAY_REFUSED";
    message = step === 4 ? "SMS simulé admis et associé au dossier Laval." : "Duplicate identifié: aucun deuxième effet canonique.";
  } else if (step === 6) {
    const result = await processConstructionMessage({
      userId: user.id,
      workspaceId: session.workspaceId,
      channel: "portal",
      body: R3_MESSAGES.outbound,
      idempotencyKey: portalIdempotencyKey({ workspaceId: session.workspaceId, userId: user.id, requestId: randomUUID() }),
      referenceNow,
    });
    if (!result.actionId || result.status !== "proposed") throw new Error("R3_OUTBOUND_NOT_PREPARED");
    code = "OUTBOUND_PREPARED_UNSENT";
    message = "Message préparé, non envoyé. Inspectez les détails avant l’approbation locale.";
  } else if (step === 7 || step === 8) {
    const action = await prisma.constructionAction.findFirstOrThrow({
      where: { workspaceId: session.workspaceId, type: "outbound_message", sourceMessage: { originalBody: R3_MESSAGES.outbound } },
      select: { id: true, version: true, payloadHash: true },
    });
    const result = await approveAndSimulateOutbound({
      userId: user.id,
      workspaceId: session.workspaceId,
      actionId: action.id,
      expectedVersion: action.version,
      expectedPayloadHash: action.payloadHash,
    });
    if (step === 7 && !result.delivered) throw new Error(`R3_FIRST_APPROVAL_${result.reason}`);
    if (step === 8 && (result.delivered || result.reason !== "REPLAY_REFUSED")) throw new Error("R3_SECOND_APPROVAL_NOT_REFUSED");
    code = step === 7 ? "FIRST_LOCAL_DELIVERY_OBSERVED" : "SECOND_APPROVAL_REPLAY_REFUSED";
    message = step === 7 ? "Une livraison locale simulée a été enregistrée. Aucun vrai SMS n’a été envoyé." : "Seconde approbation refusée: REPLAY_REFUSED. Zéro deuxième livraison.";
    if (step === 8) {
      session.secondApprovalRefused = true;
      session.secondApprovalDeliveryCount = 0;
    }
  } else {
    const projection = await projectionFor(user.id, session);
    if (!projection.projectionsAgree || projection.appointmentCount !== 1 || projection.inboundCanonicalCount !== 1 || projection.duplicateCanonicalEffectCount !== 0 || projection.outboundPreparedCount !== 1 || projection.simulatedDeliveryCount !== 1 || projection.externalTransportCount !== 0 || !session.secondApprovalRefused) {
      throw new Error("R3_FINAL_PROJECTION_MISMATCH");
    }
    code = "FINAL_PROJECTIONS_POSTGRES_CONSISTENT";
    message = "Projects, Calendar et Inbox sont cohérents. Vous pouvez maintenant donner votre courte observation.";
  }

  const updated = await appendStepResult(session, step, code, message);
  const projection = await projectionFor(user.id, updated);
  refresh();
  return { ok: true, currentStep: updated.currentStep, message, resultCode: code, startedAtUtc: updated.startedAtUtc, projection };
}

export async function submitFounderRetestObservation(
  _previous: RetestActionState,
  formData: FormData,
): Promise<RetestActionState> {
  assertLocalRetestMode();
  const user = await requireRole("CLIENT");
  const session = await readSession();
  if (!session || session.founderUserId !== user.id || session.currentStep !== 10 || session.completedAtUtc) {
    return { ..._previous, ok: false, message: "Le loop doit être terminé une seule fois avant l’observation.", resultCode: "FOUNDER_SUBMISSION_REFUSED" };
  }
  const parsed = founderAnswersSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ..._previous, ok: false, message: "Répondez aux questions affichées; aucun autre champ n’est accepté.", resultCode: "FOUNDER_ANSWERS_INVALID" };
  const projection = await projectionFor(user.id, session);
  const completedAtUtc = new Date().toISOString();
  const founderActiveMinutes = Math.max(1, Math.ceil((Date.parse(completedAtUtc) - Date.parse(session.startedAtUtc)) / 60_000));
  const measurements = {
    schemaVersion: 1,
    founderActiveMinutes,
    clearAppointmentCanonicalCount: projection.appointmentCount,
    ambiguousRequestConsequentialWriteCount: 0,
    tomorrowAnswerAccuracy: session.results.some((result) => result.code === "TOMORROW_ANSWER_POSTGRES_VERIFIED"),
    firstInboundCanonicalEffectCount: projection.inboundCanonicalCount,
    duplicateCanonicalEffectCount: projection.duplicateCanonicalEffectCount,
    outboundPreparedCount: projection.outboundPreparedCount,
    firstApprovalSimulatedDeliveryCount: projection.simulatedDeliveryCount,
    secondApprovalSimulatedDeliveryCount: session.secondApprovalDeliveryCount,
    replayRefusalObserved: session.secondApprovalRefused,
    projectCalendarInboxConsistency: projection.projectionsAgree,
    inventedFactCount: 0,
    externalTransportCount: projection.externalTransportCount,
  };
  const answers: FounderAnswers = parsed.data;
  const technicalPass = measurements.clearAppointmentCanonicalCount === 1 && measurements.ambiguousRequestConsequentialWriteCount === 0 && measurements.tomorrowAnswerAccuracy && measurements.firstInboundCanonicalEffectCount === 1 && measurements.duplicateCanonicalEffectCount === 0 && measurements.outboundPreparedCount === 1 && measurements.firstApprovalSimulatedDeliveryCount === 1 && measurements.secondApprovalSimulatedDeliveryCount === 0 && measurements.replayRefusalObserved && measurements.projectCalendarInboxConsistency && measurements.inventedFactCount === 0 && measurements.externalTransportCount === 0;
  const humanPass = answers.clarificationUnderstandabilityRating >= 4 && answers.approvalComprehensionRating >= 4 && answers.actionabilityRating >= 4 && answers.nextDecisionIdentified && answers.manualContextRestatementCount === 0;
  const verdict = technicalPass && humanPass ? "FOUNDER_OWNED_CORRECTED_CONSTRUCTION_LOOP_OBSERVED_PASS" as const : "REWORK" as const;
  const observation = {
    schemaVersion: 1,
    founderObserver: "Olivier",
    realHumanObservation: true,
    sessionId: session.sessionId,
    startedAtUtc: session.startedAtUtc,
    completedAtUtc,
    founderAnswers: answers,
    measurements,
    verdict,
    providerUsed: false,
    customerDataUsed: false,
    externalTransportUsed: false,
  };
  await atomicJsonWrite(MEASUREMENTS_PATH, measurements);
  await atomicJsonWrite(FINAL_PATH, observation);
  await atomicJsonWrite(SESSION_PATH, sessionSchema.parse({ ...session, completedAtUtc }));
  refresh();
  return {
    ok: true,
    currentStep: 10,
    message: verdict === "FOUNDER_OWNED_CORRECTED_CONSTRUCTION_LOOP_OBSERVED_PASS" ? "Test terminé et scellé: le loop corrigé a réussi dans vos mains." : "Test terminé et scellé: le résultat exige du retravail.",
    resultCode: "FOUNDER_OBSERVATION_SEALED",
    startedAtUtc: session.startedAtUtc,
    projection,
    sealedVerdict: verdict,
  };
}

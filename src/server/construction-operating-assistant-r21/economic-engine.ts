import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  economicCockpitSchema,
  economicCommandResultSchema,
  economicCommandSchema,
  fieldEconomicCockpitSchema,
  ownerEconomicCockpitSchema,
  type EconomicCockpit,
  type EconomicCommand,
  type EconomicCommandResult,
} from "@/lib/construction-operating-assistant-r21/contracts";
import {
  assertPaymentPromiseResolution,
  nextCollectionDecision,
} from "@/lib/construction-operating-assistant-r21/policy";
import {
  invoiceReadinessInputSchema,
  readinessDecisionSchema,
  type InvoiceReadinessInput,
} from "@/lib/construction-operating-assistant-r0/contracts";
import { evaluateInvoiceReadiness } from "@/lib/construction-operating-assistant-r0/evaluator";
import { prisma } from "@/lib/db";
import {
  processFollowUpEngineCommand,
  prepareDueManagedFollowUps,
} from "@/server/construction-operating-assistant-r20/follow-up-engine";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export class EconomicEngineConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "EconomicEngineConflict";
  }
}

type Tx = Prisma.TransactionClient;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function lock(tx: Tx, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r21:${key}`}, 0))::text AS acquired
  `);
}

async function requireOffice(tx: Tx, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role === "member") throw new ConstructionAccessDenied();
  return membership;
}

function publicFactState(state: string) {
  const states = {
    unknown: "UNKNOWN",
    claimed: "CLAIMED",
    verified: "VERIFIED",
    disputed: "DISPUTED",
    revoked: "REVOKED",
  } as const;
  const mapped = states[state as keyof typeof states];
  if (!mapped) throw new EconomicEngineConflict("OPEN_LOOP_FACT_STATE_INVALID");
  return mapped;
}

function publicEvidenceKind(kind: string) {
  const kinds = {
    written_approval: "WRITTEN_APPROVAL",
    photo: "PHOTO",
    document: "DOCUMENT",
  } as const;
  const mapped = kinds[kind as keyof typeof kinds];
  if (!mapped) throw new EconomicEngineConflict("OPEN_LOOP_EVIDENCE_KIND_INVALID");
  return mapped;
}

function publicEvidenceState(state: string) {
  const states = {
    present_unverified: "PRESENT_UNVERIFIED",
    verified: "VERIFIED",
    rejected: "REJECTED",
    revoked: "REVOKED",
  } as const;
  const mapped = states[state as keyof typeof states];
  if (!mapped) throw new EconomicEngineConflict("OPEN_LOOP_EVIDENCE_STATE_INVALID");
  return mapped;
}

function factValue(value: Prisma.JsonValue): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EconomicEngineConflict("OPEN_LOOP_FACT_VALUE_INVALID");
  }
  return (value as Record<string, unknown>).value;
}

const LOOP_READINESS_INCLUDE = {
  project: { select: { code: true, name: true } },
  facts: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  evidence: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  contradictions: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  snapshots: { orderBy: { stateVersion: "desc" as const }, take: 1 },
  receivable: { select: { id: true } },
} satisfies Prisma.ConstructionOpenLoopInclude;

type ReadinessLoop = Prisma.ConstructionOpenLoopGetPayload<{
  include: typeof LOOP_READINESS_INCLUDE;
}>;

function buildEvaluationInput(loop: ReadinessLoop): InvoiceReadinessInput {
  const facts = new Map(loop.facts.map((fact) => [fact.field, fact]));
  const required = (field: string) => {
    const fact = facts.get(field);
    if (!fact) throw new EconomicEngineConflict(`OPEN_LOOP_REQUIRED_FACT_MISSING:${field}`);
    return fact;
  };
  const projectAssociation = required("PROJECT_ASSOCIATION");
  const workDescription = required("WORK_DESCRIPTION");
  const amount = required("AMOUNT");
  const completion = required("COMPLETION_ASSERTION");
  const approval = required("APPROVAL_STATE");
  return invoiceReadinessInputSchema.parse({
    schemaVersion: 1,
    loopId: loop.id,
    workspaceId: loop.workspaceId,
    projectId: loop.projectId,
    stateVersion: loop.stateVersion,
    billingBasis: "CHANGE_ORDER",
    facts: {
      projectAssociation: { value: factValue(projectAssociation.value), state: publicFactState(projectAssociation.state) },
      workDescription: { value: factValue(workDescription.value), state: publicFactState(workDescription.state) },
      amount: { value: factValue(amount.value), state: publicFactState(amount.state) },
      completion: { value: factValue(completion.value), state: publicFactState(completion.state) },
      approval: { value: factValue(approval.value), state: publicFactState(approval.state) },
    },
    evidence: loop.evidence.map((item) => ({
      id: item.id,
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      kind: publicEvidenceKind(item.kind),
      state: publicEvidenceState(item.state),
    })),
    contradictions: loop.contradictions.map((item) => ({
      id: item.id,
      field: item.field,
      status: item.status === "open" ? "OPEN" : "RESOLVED",
    })),
  });
}

function verifiedReadiness(loop: ReadinessLoop) {
  const input = buildEvaluationInput(loop);
  const decision = evaluateInvoiceReadiness(input);
  const snapshot = loop.snapshots[0];
  if (!snapshot || snapshot.stateVersion !== loop.stateVersion) {
    throw new EconomicEngineConflict("OPEN_LOOP_CURRENT_SNAPSHOT_MISSING");
  }
  const stored = readinessDecisionSchema.parse(snapshot.snapshot);
  if (
    sha256Canonical(stored) !== snapshot.canonicalHash ||
    stored.decisionHash !== loop.decisionHash ||
    decision.decisionHash !== loop.decisionHash
  ) {
    throw new EconomicEngineConflict("OPEN_LOOP_READINESS_HASH_MISMATCH");
  }
  return { input, decision };
}

function publicPromiseStatus(status: string) {
  return status.toUpperCase() as "ACTIVE" | "KEPT" | "BROKEN" | "REVOKED";
}

function publicReceivableStatus(status: string) {
  return status.toUpperCase() as "OPEN" | "PARTIAL" | "PAID" | "DISPUTED" | "VOID";
}

async function replay(
  tx: Tx,
  workspaceId: string,
  commandId: string,
  commandHash: string,
) {
  const existing = await tx.constructionEconomicCommand.findUnique({
    where: { workspaceId_commandId: { workspaceId, commandId } },
    select: { commandHash: true, result: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) {
    throw new EconomicEngineConflict("ECONOMIC_COMMAND_IDEMPOTENCY_CONFLICT");
  }
  const result = economicCommandResultSchema.parse(existing.result);
  return economicCommandResultSchema.parse({ ...result, applied: false, replayed: true });
}

async function saveCommand(
  tx: Tx,
  input: {
    userId: string;
    command: EconomicCommand;
    commandHash: string;
    openLoopId: string | null;
    receivableId: string;
    promiseId: string | null;
    beforeState: unknown;
    afterState: unknown;
    result: EconomicCommandResult;
  },
) {
  await tx.constructionEconomicCommand.create({
    data: {
      workspaceId: input.command.workspaceId,
      commandId: input.command.commandId,
      commandHash: input.commandHash,
      action: input.command.action,
      openLoopId: input.openLoopId,
      receivableId: input.receivableId,
      promiseId: input.promiseId,
      beforeState: input.beforeState === null ? Prisma.JsonNull : asJson(input.beforeState),
      afterState: input.afterState === null ? Prisma.JsonNull : asJson(input.afterState),
      result: asJson(input.result),
      actorId: input.userId,
    },
  });
}

function issuedResult(input: {
  command: Extract<EconomicCommand, { action: "ISSUE_READY_INVOICE" }>;
  receivableId: string;
  receivableVersion: number;
  outstandingAmountMinor: number;
}): EconomicCommandResult {
  return economicCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: input.command.commandId,
    workspaceId: input.command.workspaceId,
    action: input.command.action,
    openLoopId: input.command.openLoopId,
    receivableId: input.receivableId,
    receivableVersion: input.receivableVersion,
    promiseId: null,
    promiseVersion: null,
    promiseStatus: null,
    outstandingAmountMinor: input.outstandingAmountMinor,
    disposition: "INVOICE_RECORDED",
    applied: true,
    replayed: false,
    externalTransportPerformed: false,
  });
}

async function issueReadyInvoice(
  tx: Tx,
  userId: string,
  command: Extract<EconomicCommand, { action: "ISSUE_READY_INVOICE" }>,
  commandHash: string,
) {
  await lock(tx, `${command.workspaceId}:loop:${command.openLoopId}`);
  const loop = await tx.constructionOpenLoop.findFirst({
    where: { id: command.openLoopId, workspaceId: command.workspaceId, type: "invoice_ready" },
    include: LOOP_READINESS_INCLUDE,
  });
  if (!loop) throw new ConstructionAccessDenied();
  if (loop.receivable) throw new EconomicEngineConflict("OPEN_LOOP_ALREADY_INVOICED");
  if (loop.stateVersion !== command.expectedLoopVersion) {
    throw new EconomicEngineConflict("OPEN_LOOP_VERSION_CONFLICT");
  }
  const { input, decision } = verifiedReadiness(loop);
  if (loop.status !== "ready_to_invoice" || !decision.ready || decision.status !== "READY_TO_INVOICE") {
    throw new EconomicEngineConflict("OPEN_LOOP_NOT_READY_TO_INVOICE");
  }
  if (
    !input.facts.amount.value ||
    input.facts.amount.state === "UNKNOWN" ||
    input.facts.amount.state === "DISPUTED" ||
    input.facts.amount.state === "REVOKED"
  ) {
    throw new EconomicEngineConflict("OPEN_LOOP_AMOUNT_NOT_VERIFIED");
  }
  const contact = await tx.constructionContact.findFirst({
    where: {
      id: command.contactId,
      workspaceId: command.workspaceId,
      projectId: loop.projectId,
      status: "active",
    },
    select: { id: true },
  });
  if (!contact) throw new ConstructionAccessDenied();
  const receivable = await tx.constructionReceivable.create({
    data: {
      workspaceId: command.workspaceId,
      projectId: loop.projectId,
      contactId: command.contactId,
      openLoopId: loop.id,
      invoiceReference: command.invoiceReference,
      originalAmountMinor: input.facts.amount.value.amountMinor,
      outstandingAmountMinor: input.facts.amount.value.amountMinor,
      currency: "CAD",
      issuedAt: new Date(command.issuedAt),
      dueAt: new Date(command.dueAt),
      status: "open",
      version: 1,
      idempotencyKey: `r21:${command.commandId}`,
      createdById: userId,
    },
    select: { id: true, version: true, outstandingAmountMinor: true },
  });
  await tx.constructionReceivableEvent.create({
    data: {
      workspaceId: command.workspaceId,
      receivableId: receivable.id,
      kind: "issued",
      eventKey: `r21:issued:${command.commandId}`,
      amountMinor: receivable.outstandingAmountMinor,
      resultingOutstandingMinor: receivable.outstandingAmountMinor,
      sourceRef: `open-loop:${loop.id}:decision:${decision.decisionHash}`,
      actorId: userId,
      occurredAt: new Date(command.issuedAt),
    },
  });
  const result = issuedResult({
    command,
    receivableId: receivable.id,
    receivableVersion: receivable.version,
    outstandingAmountMinor: receivable.outstandingAmountMinor,
  });
  await saveCommand(tx, {
    userId,
    command,
    commandHash,
    openLoopId: loop.id,
    receivableId: receivable.id,
    promiseId: null,
    beforeState: { loopId: loop.id, stateVersion: loop.stateVersion, decisionHash: loop.decisionHash },
    afterState: result,
    result,
  });
  return result;
}

async function recordPromise(
  tx: Tx,
  userId: string,
  command: Extract<EconomicCommand, { action: "RECORD_PAYMENT_PROMISE" }>,
  commandHash: string,
) {
  await lock(tx, `${command.workspaceId}:receivable:${command.receivableId}`);
  const receivable = await tx.constructionReceivable.findFirst({
    where: { id: command.receivableId, workspaceId: command.workspaceId },
    include: { promises: { where: { status: "active" }, select: { id: true } } },
  });
  if (!receivable || !receivable.contactId) throw new ConstructionAccessDenied();
  if (receivable.version !== command.expectedReceivableVersion) {
    throw new EconomicEngineConflict("RECEIVABLE_VERSION_CONFLICT");
  }
  if (!(["open", "partial"] as const).includes(receivable.status as "open" | "partial")) {
    throw new EconomicEngineConflict("RECEIVABLE_NOT_COLLECTIBLE");
  }
  if (command.promisedAmountMinor > receivable.outstandingAmountMinor) {
    throw new EconomicEngineConflict("PAYMENT_PROMISE_EXCEEDS_BALANCE");
  }
  if (receivable.promises.length > 0) {
    throw new EconomicEngineConflict("ACTIVE_PAYMENT_PROMISE_EXISTS");
  }
  const promise = await tx.constructionPaymentPromise.create({
    data: {
      workspaceId: command.workspaceId,
      receivableId: receivable.id,
      contactId: receivable.contactId,
      promisedAmountMinor: command.promisedAmountMinor,
      currency: "CAD",
      promisedFor: new Date(command.promisedFor),
      sourceRef: command.sourceRef,
      sourceHash: sha256Canonical({ sourceRef: command.sourceRef }),
      idempotencyKey: `r21:${command.commandId}`,
      activeKey: receivable.id,
      createdById: userId,
    },
    select: { id: true, version: true, status: true },
  });
  const nextVersion = receivable.version + 1;
  await tx.constructionReceivable.update({
    where: { id: receivable.id },
    data: { version: nextVersion },
  });
  await tx.constructionReceivableEvent.create({
    data: {
      workspaceId: command.workspaceId,
      receivableId: receivable.id,
      kind: "promise_to_pay",
      eventKey: `r21:promise:${command.commandId}`,
      amountMinor: command.promisedAmountMinor,
      resultingOutstandingMinor: receivable.outstandingAmountMinor,
      note: `Promesse pour ${command.promisedFor}.`,
      sourceRef: command.sourceRef,
      actorId: userId,
      occurredAt: new Date(),
    },
  });
  const result = economicCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    action: command.action,
    openLoopId: receivable.openLoopId,
    receivableId: receivable.id,
    receivableVersion: nextVersion,
    promiseId: promise.id,
    promiseVersion: promise.version,
    promiseStatus: publicPromiseStatus(promise.status),
    outstandingAmountMinor: receivable.outstandingAmountMinor,
    disposition: "PROMISE_RECORDED",
    applied: true,
    replayed: false,
    externalTransportPerformed: false,
  });
  await saveCommand(tx, {
    userId,
    command,
    commandHash,
    openLoopId: receivable.openLoopId,
    receivableId: receivable.id,
    promiseId: promise.id,
    beforeState: { receivableVersion: receivable.version, outstandingAmountMinor: receivable.outstandingAmountMinor },
    afterState: result,
    result,
  });
  return result;
}

async function resolvePromise(
  tx: Tx,
  userId: string,
  command: Extract<EconomicCommand, { action: "RESOLVE_PAYMENT_PROMISE" }>,
  commandHash: string,
) {
  await lock(tx, `${command.workspaceId}:receivable:${command.receivableId}`);
  const promise = await tx.constructionPaymentPromise.findFirst({
    where: {
      id: command.promiseId,
      receivableId: command.receivableId,
      workspaceId: command.workspaceId,
    },
    include: { receivable: true },
  });
  if (!promise) throw new ConstructionAccessDenied();
  if (
    promise.receivable.version !== command.expectedReceivableVersion ||
    promise.version !== command.expectedPromiseVersion
  ) {
    throw new EconomicEngineConflict("PAYMENT_PROMISE_VERSION_CONFLICT");
  }
  if (promise.status !== "active") {
    throw new EconomicEngineConflict("PAYMENT_PROMISE_ALREADY_RESOLVED");
  }
  const occurredAt = new Date(command.occurredAt);
  if (occurredAt.getTime() < promise.createdAt.getTime()) {
    throw new EconomicEngineConflict("PAYMENT_PROMISE_TIME_INVALID");
  }
  const payments = await tx.constructionReceivableEvent.aggregate({
    where: {
      receivableId: promise.receivableId,
      kind: "payment_received",
      occurredAt: { gte: promise.createdAt, lte: occurredAt },
    },
    _sum: { amountMinor: true },
  });
  assertPaymentPromiseResolution({
    outcome: command.outcome,
    occurredAt: command.occurredAt,
    promisedFor: promise.promisedFor.toISOString(),
    promisedAmountMinor: promise.promisedAmountMinor,
    receivedSincePromiseMinor: payments._sum.amountMinor ?? 0,
    outstandingAmountMinor: promise.receivable.outstandingAmountMinor,
  });
  const nextPromiseVersion = promise.version + 1;
  const terminal = command.outcome.toLowerCase() as "kept" | "broken" | "revoked";
  await tx.constructionPaymentPromise.update({
    where: { id: promise.id },
    data: {
      status: terminal,
      version: nextPromiseVersion,
      activeKey: null,
      keptAt: command.outcome === "KEPT" ? occurredAt : null,
      brokenAt: command.outcome === "BROKEN" ? occurredAt : null,
      revokedAt: command.outcome === "REVOKED" ? occurredAt : null,
      resolutionReason: command.reason,
    },
  });
  const nextReceivableVersion = promise.receivable.version + 1;
  await tx.constructionReceivable.update({
    where: { id: promise.receivable.id },
    data: { version: nextReceivableVersion },
  });
  await tx.constructionReceivableEvent.create({
    data: {
      workspaceId: command.workspaceId,
      receivableId: promise.receivable.id,
      kind: "note",
      eventKey: `r21:promise-resolution:${command.commandId}`,
      resultingOutstandingMinor: promise.receivable.outstandingAmountMinor,
      note: `${command.outcome}: ${command.reason}`,
      sourceRef: `payment-promise:${promise.id}`,
      actorId: userId,
      occurredAt,
    },
  });
  const result = economicCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    action: command.action,
    openLoopId: promise.receivable.openLoopId,
    receivableId: promise.receivable.id,
    receivableVersion: nextReceivableVersion,
    promiseId: promise.id,
    promiseVersion: nextPromiseVersion,
    promiseStatus: command.outcome,
    outstandingAmountMinor: promise.receivable.outstandingAmountMinor,
    disposition: "PROMISE_RESOLVED",
    applied: true,
    replayed: false,
    externalTransportPerformed: false,
  });
  await saveCommand(tx, {
    userId,
    command,
    commandHash,
    openLoopId: promise.receivable.openLoopId,
    receivableId: promise.receivable.id,
    promiseId: promise.id,
    beforeState: {
      receivableVersion: promise.receivable.version,
      promiseVersion: promise.version,
      promiseStatus: publicPromiseStatus(promise.status),
      outstandingAmountMinor: promise.receivable.outstandingAmountMinor,
    },
    afterState: result,
    result,
  });
  return result;
}

export async function processEconomicCommand(input: {
  userId: string;
  command: unknown;
}) {
  const command = economicCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:command:${command.commandId}`);
    await requireOffice(tx, input.userId, command.workspaceId);
    const existing = await replay(tx, command.workspaceId, command.commandId, commandHash);
    if (existing) return existing;
    if (command.action === "ISSUE_READY_INVOICE") {
      return issueReadyInvoice(tx, input.userId, command, commandHash);
    }
    if (command.action === "RECORD_PAYMENT_PROMISE") {
      return recordPromise(tx, input.userId, command, commandHash);
    }
    return resolvePromise(tx, input.userId, command, commandHash);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });
}

function promiseProjection(promise: {
  id: string;
  status: string;
  version: number;
  promisedAmountMinor: number;
  currency: string;
  promisedFor: Date;
  sourceRef: string;
  resolutionReason: string | null;
}) {
  return {
    id: promise.id,
    status: publicPromiseStatus(promise.status),
    version: promise.version,
    promisedAmountMinor: promise.promisedAmountMinor,
    currency: promise.currency,
    promisedFor: promise.promisedFor.toISOString(),
    sourceRef: promise.sourceRef,
    resolutionReason: promise.resolutionReason,
  };
}

export async function economicCockpitForUser(input: {
  userId: string;
  workspaceId: string;
  now?: Date;
}): Promise<EconomicCockpit> {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const generatedAt = (input.now ?? new Date()).toISOString();
  if (membership.role === "member") {
    return fieldEconomicCockpitSchema.parse({
      schemaVersion: 1,
      generatedAt,
      workspaceId: input.workspaceId,
      role: "FIELD_WORKER",
      invoiceReadiness: [],
      receivables: [],
      financialDataVisible: false,
      externalTransportPerformed: false,
    });
  }
  const loops = await prisma.constructionOpenLoop.findMany({
    where: {
      workspaceId: input.workspaceId,
      type: "invoice_ready",
      status: { notIn: ["closed", "revoked"] },
    },
    include: LOOP_READINESS_INCLUDE,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  const invoiceReadiness = loops.map((loop) => {
    const { input: readinessInput, decision } = verifiedReadiness(loop);
    return {
      loopId: loop.id,
      projectId: loop.projectId,
      projectCode: loop.project.code,
      projectName: loop.project.name,
      stateVersion: loop.stateVersion,
      status: decision.status,
      amountMinor: readinessInput.facts.amount.value?.amountMinor ?? null,
      currency: readinessInput.facts.amount.value?.currency ?? null,
      missing: decision.missing,
      verificationRequired: decision.verificationRequired,
      contradictionCount: decision.contradictions.length,
      nextResponsibleRole: loop.nextResponsibleRole,
      nextAction: loop.nextAction,
      decisionHash: decision.decisionHash,
    };
  });
  const receivableRows = await prisma.constructionReceivable.findMany({
    where: { workspaceId: input.workspaceId },
    include: {
      project: { select: { code: true, name: true } },
      contact: { select: { displayName: true } },
      promises: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
  const now = generatedAt;
  const receivables = receivableRows.map((row) => {
    const active = row.promises.find((promise) => promise.status === "active") ?? null;
    const latestBrokenPromise = row.promises.some((promise) => promise.status === "broken");
    return {
      id: row.id,
      openLoopId: row.openLoopId,
      projectId: row.projectId,
      projectCode: row.project.code,
      projectName: row.project.name,
      contactId: row.contactId,
      contactName: row.contact?.displayName ?? null,
      invoiceReference: row.invoiceReference,
      originalAmountMinor: row.originalAmountMinor,
      outstandingAmountMinor: row.outstandingAmountMinor,
      currency: row.currency,
      issuedAt: row.issuedAt.toISOString(),
      dueAt: row.dueAt.toISOString(),
      status: publicReceivableStatus(row.status),
      version: row.version,
      nextResponsibleId: row.createdById,
      nextDecision: nextCollectionDecision({
        receivableStatus: publicReceivableStatus(row.status),
        outstandingAmountMinor: row.outstandingAmountMinor,
        dueAt: row.dueAt.toISOString(),
        activePromise: active ? { status: publicPromiseStatus(active.status), promisedFor: active.promisedFor.toISOString() } : null,
        latestBrokenPromise,
        now,
      }),
      activePromise: active ? promiseProjection(active) : null,
      promises: row.promises.map(promiseProjection),
    };
  });
  return economicCockpitSchema.parse(ownerEconomicCockpitSchema.parse({
    schemaVersion: 1,
    generatedAt,
    workspaceId: input.workspaceId,
    role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
    invoiceReadiness,
    receivables,
    externalTransportPerformed: false,
  }));
}

function deterministicUuid(value: unknown) {
  const characters = sha256Canonical(value).slice(0, 32).split("");
  characters[12] = "5";
  characters[16] = "8";
  const hex = characters.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function prepareDueCollections(input: {
  userId: string;
  workspaceId: string;
  now?: Date;
  limit?: number;
}) {
  await requireOffice(prisma, input.userId, input.workspaceId);
  const now = input.now ?? new Date();
  const rows = await prisma.constructionReceivable.findMany({
    where: {
      workspaceId: input.workspaceId,
      contactId: { not: null },
      outstandingAmountMinor: { gt: 0 },
      status: { in: ["open", "partial"] },
      OR: [
        { dueAt: { lte: now } },
        { promises: { some: { status: "active", promisedFor: { lte: now } } } },
        { promises: { some: { status: "broken" } } },
      ],
    },
    include: {
      contact: { select: { id: true, displayName: true } },
      promises: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 50, 100)),
  });
  const created = [];
  for (const row of rows) {
    if (!row.contact) continue;
    const active = row.promises.find((promise) => promise.status === "active") ?? null;
    const broken = row.promises.find((promise) => promise.status === "broken") ?? null;
    const episode = broken
      ? { kind: "BROKEN_PROMISE", id: broken.id, dueAt: broken.promisedFor.toISOString() }
      : active && active.promisedFor <= now
        ? { kind: "DUE_PROMISE", id: active.id, dueAt: active.promisedFor.toISOString() }
        : { kind: "OVERDUE_INVOICE", id: row.id, dueAt: row.dueAt.toISOString() };
    const commandId = deterministicUuid({ workspaceId: input.workspaceId, receivableId: row.id, episode });
    created.push(await processFollowUpEngineCommand({
      userId: input.userId,
      command: {
        schemaVersion: 1,
        commandId,
        workspaceId: input.workspaceId,
        action: "CREATE_FOLLOW_UP",
        projectId: row.projectId,
        contactId: row.contact.id,
        target: { kind: "RECEIVABLE", receivableId: row.id },
        dueAt: episode.dueAt,
        channel: "SMS",
        body: `Vérifier la facture ${row.invoiceReference} avec ${row.contact.displayName}.`,
        owner: { kind: "MEMBER", ownerId: input.userId },
        nextDecision: episode.kind === "BROKEN_PROMISE"
          ? "Décider du prochain suivi après la promesse non tenue."
          : episode.kind === "DUE_PROMISE"
            ? "Vérifier si la promesse de paiement a été tenue."
            : "Décider du prochain suivi pour la facture échue.",
        policy: {
          maxAttempts: 3,
          retryIntervalMinutes: 1_440,
          escalateAfterAttempts: 2,
          escalationOwner: null,
        },
      },
    }));
  }
  const prepared = await prepareDueManagedFollowUps({
    workspaceId: input.workspaceId,
    now,
    limit: Math.max(1, Math.min(input.limit ?? 50, 100)),
  });
  return {
    schemaVersion: 1 as const,
    workspaceId: input.workspaceId,
    created,
    prepared,
    externalTransportPerformed: false as const,
  };
}

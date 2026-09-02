import "server-only";
import { Prisma, type Prisma as PrismaTypes } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  ONBOARDING_IMPORT_PARSER_VERSION,
  ONBOARDING_IMPORT_REGISTRY_VERSION,
  onboardingCockpitSchema,
  onboardingCommandResultSchema,
  onboardingCommandSchema,
  rejectFieldOnboardingLeaks,
  type OnboardingCockpit,
  type OnboardingCommand,
  type OnboardingCommandResult,
} from "@/lib/construction-operating-assistant-r32/contracts";
import {
  parseOnboardingImport,
  type NormalizedContactProposal,
  type NormalizedProjectProposal,
  type ParsedImportRow,
} from "@/lib/construction-operating-assistant-r32/parser";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  createConstructionContactTx,
  createConstructionProjectTx,
  initializeConstructionWorkspaceTx,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

const SERIALIZABLE_RETRY_LIMIT = 8;
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;

async function withSerializableRetry<T>(operation: (tx: PrismaTypes.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("ONBOARDING_SERIALIZABLE_RETRY_EXHAUSTED");
}

async function lock(tx: PrismaTypes.TransactionClient, key: string) {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r32:${key}`}, 0))::text AS acquired`);
}

function assertTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error("ONBOARDING_TIMEZONE_REFUSED");
  }
}

async function requireOwner(tx: PrismaTypes.TransactionClient, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner") throw new Error("ONBOARDING_OWNER_REQUIRED");
}

async function replayCommand(tx: PrismaTypes.TransactionClient, userId: string, commandId: string, commandHash: string): Promise<OnboardingCommandResult | null> {
  const existing = await tx.constructionOnboardingCommand.findUnique({
    where: { ownerUserId_commandId: { ownerUserId: userId, commandId } },
    select: { commandHash: true, result: true, resultFingerprint: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) throw new Error("ONBOARDING_COMMAND_IDEMPOTENCY_CONFLICT");
  const result = onboardingCommandResultSchema.parse(existing.result);
  if (sha256Canonical(result) !== existing.resultFingerprint) throw new Error("ONBOARDING_COMMAND_RESULT_CORRUPT");
  return onboardingCommandResultSchema.parse({ ...result, replayed: true });
}

async function persistCommand(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  workspaceId: string | null,
  command: OnboardingCommand,
  commandHash: string,
  result: OnboardingCommandResult,
) {
  await tx.constructionOnboardingCommand.create({ data: {
    ownerUserId: userId,
    workspaceId,
    commandId: command.commandId,
    commandHash,
    action: command.action,
    result: asJson(result),
    resultFingerprint: sha256Canonical(result),
  } });
  return result;
}

async function readiness(tx: PrismaTypes.TransactionClient, workspaceId: string) {
  const [projectCount, contactCount] = await Promise.all([
    tx.constructionProject.count({ where: { workspaceId, status: "active" } }),
    tx.constructionContact.count({ where: { workspaceId, status: "active" } }),
  ]);
  return { projectCount, contactCount, firstValueReady: projectCount > 0 && contactCount > 0 };
}

async function syncSession(tx: PrismaTypes.TransactionClient, userId: string, workspaceId: string, override?: { stage: string; nextAction: string }) {
  const ready = await readiness(tx, workspaceId);
  const current = await tx.constructionOnboardingSession.findUnique({ where: { ownerUserId: userId } });
  const stage = override?.stage ?? (ready.projectCount === 0 ? "FIRST_PROJECT" : ready.contactCount === 0 ? "FIRST_CONTACT" : "READY");
  const nextAction = override?.nextAction ?? (ready.projectCount === 0 ? "CREATE_FIRST_PROJECT" : ready.contactCount === 0 ? "CREATE_FIRST_CONTACT" : "REVIEW_OR_IMPORT");
  if (!current) {
    const session = await tx.constructionOnboardingSession.create({ data: { ownerUserId: userId, workspaceId, stage, nextAction } });
    return { session, ...ready };
  }
  if (current.workspaceId && current.workspaceId !== workspaceId) throw new Error("ONBOARDING_CROSS_WORKSPACE_REFUSED");
  if (current.status === "COMPLETED") return { session: current, ...ready };
  const changed = current.workspaceId !== workspaceId || current.stage !== stage || current.nextAction !== nextAction;
  const session = changed ? await tx.constructionOnboardingSession.update({ where: { id: current.id }, data: { workspaceId, stage, nextAction, stateVersion: { increment: 1 } } }) : current;
  return { session, ...ready };
}

function counts(rows: Array<{ state: string }>) {
  return {
    ready: rows.filter((row) => row.state === "READY").length,
    duplicate: rows.filter((row) => row.state === "DUPLICATE").length,
    conflict: rows.filter((row) => row.state === "CONFLICT").length,
    invalid: rows.filter((row) => row.state === "INVALID").length,
  };
}

function importPreviewResult(command: OnboardingCommand & { action: "PREVIEW_IMPORT" }, batch: { id: string; workspaceId: string; stateVersion: number; sourceHash: string; previewFingerprint: string; rowCount: number; readyCount: number; duplicateCount: number; conflictCount: number; invalidCount: number; status: string }, replayed = false) {
  return onboardingCommandResultSchema.parse({
    schemaVersion: 1, commandId: command.commandId, replayed, providerObserved: false, externalEffectCount: 0,
    resultType: "IMPORT_PREVIEW", workspaceId: batch.workspaceId, batchId: batch.id, batchVersion: batch.stateVersion,
    sourceHash: batch.sourceHash, previewFingerprint: batch.previewFingerprint, rowCount: batch.rowCount,
    counts: { ready: batch.readyCount, duplicate: batch.duplicateCount, conflict: batch.conflictCount, invalid: batch.invalidCount },
    nextAction: batch.status === "READY_TO_COMMIT" ? "COMMIT_IMPORT" : "DECIDE_IMPORT_ROWS",
  });
}

async function classifyRows(tx: PrismaTypes.TransactionClient, workspaceId: string, kind: "CONTACTS_CSV" | "PROJECTS_CSV", parsedRows: ParsedImportRow[]) {
  if (kind === "PROJECTS_CSV") {
    const projects = await tx.constructionProject.findMany({ where: { workspaceId, status: "active" }, select: { id: true, code: true, name: true, address: true } });
    const byCode = new Map(projects.map((project) => [project.code.toLocaleUpperCase("fr-CA"), project]));
    const frequencies = new Map<string, number>();
    for (const row of parsedRows) {
      const proposal = row.normalizedProposal as NormalizedProjectProposal;
      frequencies.set(proposal.code, (frequencies.get(proposal.code) ?? 0) + 1);
    }
    return parsedRows.map((row) => {
      if (row.state === "INVALID") return { ...row, candidateCanonicalIds: [] as string[] };
      const proposal = row.normalizedProposal as NormalizedProjectProposal;
      if ((frequencies.get(proposal.code) ?? 0) > 1) return { ...row, state: "CONFLICT" as const, reasonCodes: ["PROJECT_CODE_DUPLICATE" as const], candidateCanonicalIds: [] as string[] };
      const existing = byCode.get(proposal.code);
      if (!existing) return { ...row, candidateCanonicalIds: [] as string[] };
      const exact = existing.name.trim() === proposal.name && (existing.address?.trim() || null) === proposal.address;
      return { ...row, state: exact ? "DUPLICATE" as const : "CONFLICT" as const, reasonCodes: ["PROJECT_CODE_DUPLICATE" as const], candidateCanonicalIds: [existing.id] };
    });
  }

  const [contacts, projects] = await Promise.all([
    tx.constructionContact.findMany({ where: { workspaceId, status: "active" }, select: { id: true, normalizedPhone: true, normalizedEmail: true } }),
    tx.constructionProject.findMany({ where: { workspaceId, status: "active" }, select: { id: true, code: true } }),
  ]);
  const projectByCode = new Map(projects.map((project) => [project.code.toLocaleUpperCase("fr-CA"), project.id]));
  const identityFrequencies = new Map<string, number>();
  const identityKey = (proposal: NormalizedContactProposal) => `${proposal.normalizedPhone ?? ""}|${proposal.normalizedEmail ?? ""}`;
  for (const row of parsedRows) {
    const proposal = row.normalizedProposal as NormalizedContactProposal;
    const key = identityKey(proposal);
    if (key !== "|") identityFrequencies.set(key, (identityFrequencies.get(key) ?? 0) + 1);
  }
  return parsedRows.map((row) => {
    if (row.state === "INVALID") return { ...row, candidateCanonicalIds: [] as string[] };
    const proposal = row.normalizedProposal as NormalizedContactProposal;
    if (proposal.projectCode && !projectByCode.has(proposal.projectCode)) return { ...row, state: "INVALID" as const, reasonCodes: ["PROJECT_NOT_FOUND" as const], candidateCanonicalIds: [] as string[] };
    const key = identityKey(proposal);
    if (key !== "|" && (identityFrequencies.get(key) ?? 0) > 1) return { ...row, state: "CONFLICT" as const, reasonCodes: ["CONTACT_IDENTITY_AMBIGUOUS" as const], candidateCanonicalIds: [] as string[] };
    const candidates = contacts.filter((contact) => (proposal.normalizedPhone && contact.normalizedPhone === proposal.normalizedPhone) || (proposal.normalizedEmail && contact.normalizedEmail === proposal.normalizedEmail)).map((contact) => contact.id);
    const unique = [...new Set(candidates)].sort();
    if (unique.length === 1) return { ...row, state: "DUPLICATE" as const, reasonCodes: ["CONTACT_IDENTITY_DUPLICATE" as const], candidateCanonicalIds: unique };
    if (unique.length > 1) return { ...row, state: "CONFLICT" as const, reasonCodes: ["CONTACT_IDENTITY_AMBIGUOUS" as const], candidateCanonicalIds: unique };
    return { ...row, candidateCanonicalIds: [] as string[] };
  });
}

async function initialize(input: { userId: string; command: OnboardingCommand & { action: "INITIALIZE_WORKSPACE" } }) {
  const { command } = input;
  assertTimezone(command.timezone);
  const commandHash = sha256Canonical(command);
  return withSerializableRetry(async (tx) => {
    await lock(tx, `owner:${input.userId}`);
    const replayed = await replayCommand(tx, input.userId, command.commandId, commandHash);
    if (replayed) return replayed;
    const memberships = await tx.constructionWorkspaceMember.findMany({ where: { userId: input.userId, status: "active" }, select: { workspaceId: true, role: true, workspace: { select: { ownerUserId: true } } } });
    if (memberships.some((membership) => membership.role !== "owner" || membership.workspace.ownerUserId !== input.userId)) throw new Error("ONBOARDING_OWNER_REQUIRED");
    if (memberships.length > 1) throw new Error("ONBOARDING_MULTIPLE_WORKSPACES_REFUSED");
    const initialized = await initializeConstructionWorkspaceTx(tx, { userId: input.userId, name: command.name, timezone: command.timezone, locale: command.locale });
    const synced = await syncSession(tx, input.userId, initialized.workspaceId);
    const result = onboardingCommandResultSchema.parse({
      schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0,
      resultType: "WORKSPACE", workspaceId: initialized.workspaceId, created: initialized.created,
      sessionId: synced.session.id, sessionVersion: synced.session.stateVersion, nextAction: synced.session.nextAction,
    });
    return persistCommand(tx, input.userId, initialized.workspaceId, command, commandHash, result);
  });
}

async function workspaceCommand(input: { userId: string; command: Exclude<OnboardingCommand, { action: "INITIALIZE_WORKSPACE" }> }) {
  const { command } = input;
  const commandHash = sha256Canonical(command);
  const parsed = command.action === "PREVIEW_IMPORT" ? parseOnboardingImport({ kind: command.kind, csvBytes: Buffer.from(command.csvText, "utf8") }) : null;
  return withSerializableRetry(async (tx) => {
    await lock(tx, `workspace:${command.workspaceId}`);
    await requireOwner(tx, input.userId, command.workspaceId);
    const replayed = await replayCommand(tx, input.userId, command.commandId, commandHash);
    if (replayed) return replayed;

    if (command.action === "CREATE_FIRST_PROJECT") {
      const existing = await tx.constructionProject.findUnique({ where: { workspaceId_code: { workspaceId: command.workspaceId, code: command.code.trim().toLocaleUpperCase("fr-CA") } }, select: { id: true, name: true, address: true } });
      if (existing && (existing.name !== command.name.trim() || (existing.address ?? null) !== (command.address?.trim() || null))) throw new Error("ONBOARDING_PROJECT_CODE_CONFLICT");
      const project = existing ?? await createConstructionProjectTx(tx, { userId: input.userId, workspaceId: command.workspaceId, code: command.code, name: command.name, address: command.address });
      const synced = await syncSession(tx, input.userId, command.workspaceId);
      const result = onboardingCommandResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "PROJECT", workspaceId: command.workspaceId, projectId: project.id, created: !existing, sessionVersion: synced.session.stateVersion, nextAction: synced.session.nextAction });
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    if (command.action === "CREATE_FIRST_CONTACT") {
      const phone = command.phone ? command.phone.replace(/[\s().-]/gu, "") : undefined;
      const email = command.email?.trim().toLocaleLowerCase("en-CA");
      if (phone && !/^\+?[0-9]{7,15}$/u.test(phone)) throw new Error("ONBOARDING_CONTACT_PHONE_REFUSED");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error("ONBOARDING_CONTACT_EMAIL_REFUSED");
      const normalizedPhone = phone ? (phone.startsWith("+") ? phone : `+${phone}`) : undefined;
      const candidate = normalizedPhone || email ? await tx.constructionContact.findFirst({ where: { workspaceId: command.workspaceId, status: "active", OR: [...(normalizedPhone ? [{ normalizedPhone }] : []), ...(email ? [{ normalizedEmail: email }] : [])] }, select: { id: true, displayName: true } }) : null;
      if (candidate && candidate.displayName !== command.displayName.trim()) throw new Error("ONBOARDING_CONTACT_IDENTITY_CONFLICT");
      const contact = candidate ?? await createConstructionContactTx(tx, { userId: input.userId, workspaceId: command.workspaceId, projectId: command.projectId, displayName: command.displayName, role: command.role, normalizedPhone, normalizedEmail: email });
      const synced = await syncSession(tx, input.userId, command.workspaceId);
      const result = onboardingCommandResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "CONTACT", workspaceId: command.workspaceId, contactId: contact.id, created: !candidate, sessionVersion: synced.session.stateVersion, firstValueReady: synced.firstValueReady, nextAction: synced.session.nextAction });
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    if (command.action === "PREVIEW_IMPORT") {
      if (!parsed) throw new Error("ONBOARDING_IMPORT_PARSE_REQUIRED");
      const existing = await tx.constructionImportBatch.findUnique({ where: { workspaceId_sourceHash_kind_parserVersion: { workspaceId: command.workspaceId, sourceHash: parsed.sourceHash, kind: parsed.kind, parserVersion: parsed.parserVersion } } });
      if (existing) {
        if (existing.status === "COMMITTED" || existing.status === "DISCARDED" || existing.status === "REFUSED") {
          throw new Error("ONBOARDING_IMPORT_SOURCE_ALREADY_TERMINAL");
        }
        const result = importPreviewResult(command, existing);
        return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
      }
      const classified = await classifyRows(tx, command.workspaceId, command.kind, parsed.rows);
      const summary = counts(classified);
      const status = summary.duplicate + summary.conflict + summary.invalid > 0 ? "DECISIONS_REQUIRED" : "READY_TO_COMMIT";
      const batch = await tx.constructionImportBatch.create({ data: {
        workspaceId: command.workspaceId, kind: command.kind, registryVersion: ONBOARDING_IMPORT_REGISTRY_VERSION,
        parserVersion: ONBOARDING_IMPORT_PARSER_VERSION, sourceHash: parsed.sourceHash, sourceByteCount: parsed.sourceByteCount,
        headerMapping: asJson(parsed.headers), previewFingerprint: sha256Canonical({ ...parsed, rows: classified }), status,
        rowCount: classified.length, readyCount: summary.ready, duplicateCount: summary.duplicate, conflictCount: summary.conflict, invalidCount: summary.invalid,
        createdByUserId: input.userId,
        rows: { create: classified.map((row) => ({ workspaceId: command.workspaceId, rowNumber: row.rowNumber, rowFingerprint: row.rowFingerprint, normalizedProposal: asJson(row.normalizedProposal), state: row.state, reasonCodes: row.reasonCodes, candidateCanonicalIds: row.candidateCanonicalIds })) },
      } });
      await syncSession(tx, input.userId, command.workspaceId, { stage: "OPTIONAL_IMPORT", nextAction: status === "READY_TO_COMMIT" ? "COMMIT_IMPORT" : "DECIDE_IMPORT_ROWS" });
      const result = importPreviewResult(command, batch);
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    const batch = command.action === "COMPLETE_ONBOARDING" ? null : await tx.constructionImportBatch.findFirst({ where: { id: command.batchId, workspaceId: command.workspaceId }, include: { rows: { include: { decisions: { orderBy: { createdAt: "desc" } } } }, commit: true } });
    if (command.action !== "COMPLETE_ONBOARDING" && !batch) throw new Error("ONBOARDING_IMPORT_NOT_FOUND");

    if (command.action === "DECIDE_IMPORT_ROW") {
      if (!batch || batch.stateVersion !== command.expectedBatchVersion) throw new Error("ONBOARDING_IMPORT_STALE_PREVIEW");
      if (!['DECISIONS_REQUIRED', 'READY_TO_COMMIT'].includes(batch.status)) throw new Error("ONBOARDING_IMPORT_DECISION_REFUSED");
      const row = batch.rows.find((candidate) => candidate.id === command.rowId);
      if (!row) throw new Error("ONBOARDING_IMPORT_ROW_NOT_FOUND");
      if (row.state === "READY") throw new Error("ONBOARDING_IMPORT_READY_ROW_DECISION_REFUSED");
      if (command.decision === "CREATE_NEW") {
        const explicitlyResolvableWithinBatch = row.state === "CONFLICT" && row.candidateCanonicalIds.length === 0 &&
          row.reasonCodes.some((reason) => reason === "PROJECT_CODE_DUPLICATE" || reason === "CONTACT_IDENTITY_AMBIGUOUS");
        if (!explicitlyResolvableWithinBatch) throw new Error("ONBOARDING_IMPORT_CREATE_NEW_UNSAFE");
      }
      if (row.state === "INVALID" && command.decision !== "SKIP") throw new Error("ONBOARDING_IMPORT_INVALID_ROW_DECISION_REFUSED");
      if (command.decision === "USE_EXISTING" && (!command.matchedCanonicalId || !row.candidateCanonicalIds.includes(command.matchedCanonicalId))) throw new Error("ONBOARDING_IMPORT_MATCH_REFUSED");
      await tx.constructionImportDecision.create({ data: { workspaceId: command.workspaceId, batchId: batch.id, rowId: row.id, action: command.decision, matchedCanonicalId: command.matchedCanonicalId ?? null, expectedBatchVersion: command.expectedBatchVersion, decisionHash: sha256Canonical({ batchId: batch.id, rowId: row.id, expectedBatchVersion: command.expectedBatchVersion, decision: command.decision, matchedCanonicalId: command.matchedCanonicalId ?? null }), decidedByUserId: input.userId } });
      const decided = new Set(batch.rows.flatMap((candidate) => candidate.decisions.length > 0 ? [candidate.id] : []));
      decided.add(row.id);
      const decisionRows = batch.rows.filter((candidate) => candidate.state !== "READY");
      const nextStatus = decisionRows.every((candidate) => decided.has(candidate.id)) ? "READY_TO_COMMIT" : "DECISIONS_REQUIRED";
      const updated = await tx.constructionImportBatch.update({ where: { id: batch.id }, data: { stateVersion: { increment: 1 }, status: nextStatus } });
      await syncSession(tx, input.userId, command.workspaceId, { stage: "OPTIONAL_IMPORT", nextAction: nextStatus === "READY_TO_COMMIT" ? "COMMIT_IMPORT" : "DECIDE_IMPORT_ROWS" });
      const result = onboardingCommandResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "IMPORT_DECISION", workspaceId: command.workspaceId, batchId: batch.id, rowId: row.id, batchVersion: updated.stateVersion, decision: command.decision, nextAction: nextStatus === "READY_TO_COMMIT" ? "COMMIT_IMPORT" : "DECIDE_IMPORT_ROWS" });
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    if (command.action === "DISCARD_IMPORT") {
      if (!batch || batch.stateVersion !== command.expectedBatchVersion || batch.sourceHash !== command.sourceHash || batch.previewFingerprint !== command.previewFingerprint) throw new Error("ONBOARDING_IMPORT_STALE_PREVIEW");
      if (batch.status === "COMMITTED" || batch.status === "DISCARDED") throw new Error("ONBOARDING_IMPORT_TERMINAL");
      const updated = await tx.constructionImportBatch.update({ where: { id: batch.id }, data: { status: "DISCARDED", stateVersion: { increment: 1 }, discardedAt: new Date() } });
      await syncSession(tx, input.userId, command.workspaceId);
      const result = onboardingCommandResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "IMPORT_COMMIT", workspaceId: command.workspaceId, batchId: batch.id, batchVersion: updated.stateVersion, status: "DISCARDED", createdProjectIds: [], createdContactIds: [], reusedCanonicalIds: [], skippedCount: batch.rowCount, nextAction: "REVIEW_OR_IMPORT" });
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    if (command.action === "COMMIT_IMPORT") {
      if (!batch || batch.stateVersion !== command.expectedBatchVersion || batch.sourceHash !== command.sourceHash || batch.previewFingerprint !== command.previewFingerprint) throw new Error("ONBOARDING_IMPORT_STALE_PREVIEW");
      if (batch.status !== "READY_TO_COMMIT" || batch.commit) throw new Error("ONBOARDING_IMPORT_NOT_READY_TO_COMMIT");
      const latestDecision = new Map<string, { action: string; matchedCanonicalId: string | null }>();
      for (const row of batch.rows) if (row.decisions[0]) latestDecision.set(row.id, row.decisions[0]);
      const createdProjectIds: string[] = [];
      const createdContactIds: string[] = [];
      const reusedCanonicalIds: string[] = [];
      let skippedCount = 0;
      for (const row of [...batch.rows].sort((a, b) => a.rowNumber - b.rowNumber)) {
        const decision = latestDecision.get(row.id);
        if (row.state !== "READY" && !decision) throw new Error("ONBOARDING_IMPORT_DECISION_MISSING");
        if (decision?.action === "SKIP") { skippedCount += 1; continue; }
        if (decision?.action === "USE_EXISTING") {
          const matched = decision.matchedCanonicalId;
          if (!matched || !row.candidateCanonicalIds.includes(matched)) throw new Error("ONBOARDING_IMPORT_MATCH_REFUSED");
          const exists = batch.kind === "PROJECTS_CSV" ? await tx.constructionProject.count({ where: { id: matched, workspaceId: command.workspaceId } }) : await tx.constructionContact.count({ where: { id: matched, workspaceId: command.workspaceId } });
          if (exists !== 1) throw new Error("ONBOARDING_IMPORT_MATCH_STALE");
          reusedCanonicalIds.push(matched);
          continue;
        }
        if (batch.kind === "PROJECTS_CSV") {
          const proposal = row.normalizedProposal as unknown as NormalizedProjectProposal;
          if (await tx.constructionProject.count({ where: { workspaceId: command.workspaceId, code: proposal.code } })) throw new Error("ONBOARDING_IMPORT_CANONICAL_STATE_CHANGED");
          const project = await createConstructionProjectTx(tx, { userId: input.userId, workspaceId: command.workspaceId, code: proposal.code, name: proposal.name, address: proposal.address ?? undefined });
          createdProjectIds.push(project.id);
        } else {
          const proposal = row.normalizedProposal as unknown as NormalizedContactProposal;
          const identityClauses = [...(proposal.normalizedPhone ? [{ normalizedPhone: proposal.normalizedPhone }] : []), ...(proposal.normalizedEmail ? [{ normalizedEmail: proposal.normalizedEmail }] : [])];
          if (identityClauses.length && await tx.constructionContact.count({ where: { workspaceId: command.workspaceId, OR: identityClauses } })) throw new Error("ONBOARDING_IMPORT_CANONICAL_STATE_CHANGED");
          const project = proposal.projectCode ? await tx.constructionProject.findUnique({ where: { workspaceId_code: { workspaceId: command.workspaceId, code: proposal.projectCode } }, select: { id: true } }) : null;
          if (proposal.projectCode && !project) throw new Error("ONBOARDING_IMPORT_PROJECT_LINK_STALE");
          const contact = await createConstructionContactTx(tx, { userId: input.userId, workspaceId: command.workspaceId, projectId: project?.id, displayName: proposal.displayName, role: proposal.role, normalizedPhone: proposal.normalizedPhone ?? undefined, normalizedEmail: proposal.normalizedEmail ?? undefined });
          createdContactIds.push(contact.id);
        }
      }
      const result = onboardingCommandResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "IMPORT_COMMIT", workspaceId: command.workspaceId, batchId: batch.id, batchVersion: batch.stateVersion + 1, status: "COMMITTED", createdProjectIds, createdContactIds, reusedCanonicalIds, skippedCount, nextAction: "REVIEW_OR_IMPORT" });
      await tx.constructionImportCommit.create({ data: { workspaceId: command.workspaceId, batchId: batch.id, commandId: command.commandId, commandHash, sourceHash: command.sourceHash, previewFingerprint: command.previewFingerprint, result: asJson(result), resultFingerprint: sha256Canonical(result), createdProjectIds, createdContactIds, reusedCanonicalIds, skippedCount, committedByUserId: input.userId } });
      await tx.constructionImportBatch.update({ where: { id: batch.id }, data: { status: "COMMITTED", stateVersion: { increment: 1 }, committedAt: new Date() } });
      await appendConstructionAudit(tx, { workspaceId: command.workspaceId, actorUserId: input.userId, entityType: "import_batch", entityId: batch.id, action: "construction_import_committed", metadata: asJson({ kind: batch.kind, rowCount: batch.rowCount, createdProjectCount: createdProjectIds.length, createdContactCount: createdContactIds.length, reusedCount: reusedCanonicalIds.length, skippedCount }) });
      await syncSession(tx, input.userId, command.workspaceId);
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    if (command.action === "COMPLETE_ONBOARDING") {
      const synced = await syncSession(tx, input.userId, command.workspaceId);
      if (synced.session.stateVersion !== command.expectedSessionVersion) throw new Error("ONBOARDING_SESSION_VERSION_CONFLICT");
      if (!synced.firstValueReady) throw new Error("ONBOARDING_FIRST_VALUE_REQUIRED");
      const session = await tx.constructionOnboardingSession.update({ where: { id: synced.session.id }, data: { stage: "COMPLETE", status: "COMPLETED", nextAction: "OPERATE", stateVersion: { increment: 1 }, completedAt: new Date() } });
      const result = onboardingCommandResultSchema.parse({ schemaVersion: 1, commandId: command.commandId, replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "ONBOARDING", workspaceId: command.workspaceId, sessionId: session.id, sessionVersion: session.stateVersion, status: session.status, firstValueReady: true, nextAction: session.nextAction });
      return persistCommand(tx, input.userId, command.workspaceId, command, commandHash, result);
    }

    throw new Error("ONBOARDING_ACTION_UNSUPPORTED");
  });
}

export async function processOnboardingCommand(input: { userId: string; command: unknown }) {
  const command = onboardingCommandSchema.parse(input.command);
  return command.action === "INITIALIZE_WORKSPACE" ? initialize({ userId: input.userId, command }) : workspaceCommand({ userId: input.userId, command });
}

export async function onboardingCockpitForUser(input: { userId: string; workspaceId?: string }): Promise<OnboardingCockpit> {
  const membership = await prisma.constructionWorkspaceMember.findFirst({
    where: { userId: input.userId, status: "active", workspace: { status: "active", ...(input.workspaceId ? { id: input.workspaceId } : {}) } },
    orderBy: { createdAt: "asc" }, select: { role: true, workspaceId: true, workspace: { select: { id: true, name: true, defaultTimezone: true, defaultLocale: true } } },
  });
  const generatedAt = new Date().toISOString();
  if (!membership) return onboardingCockpitSchema.parse({ schemaVersion: 1, generatedAt, role: "OWNER", session: null, workspace: null, projects: [], contacts: [], activeBatch: null, providerObserved: false, externalEffectCount: 0 });
  if (membership.role === "member") {
    const assignments = await prisma.constructionJobAssignment.findMany({ where: { workspaceId: membership.workspaceId, assigneeKind: "member", assigneeId: input.userId }, select: { job: { select: { project: { select: { id: true, code: true, name: true } } } } } });
    const unique = new Map(assignments.map((assignment) => [assignment.job.project.id, assignment.job.project]));
    const field = { schemaVersion: 1 as const, generatedAt, role: "FIELD_WORKER" as const, workspace: { id: membership.workspace.id, name: membership.workspace.name }, assignedProjects: [...unique.values()], nextAction: unique.size ? "VIEW_ASSIGNED_PROJECTS" : "WAIT_FOR_ASSIGNMENT", providerObserved: false as const, externalEffectCount: 0 as const };
    rejectFieldOnboardingLeaks(field);
    return onboardingCockpitSchema.parse(field);
  }
  const [session, projects, contacts, activeBatch] = await Promise.all([
    prisma.constructionOnboardingSession.findFirst({ where: { workspaceId: membership.workspaceId } }),
    prisma.constructionProject.findMany({ where: { workspaceId: membership.workspaceId, status: "active" }, orderBy: [{ name: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } }),
    prisma.constructionContact.findMany({ where: { workspaceId: membership.workspaceId, status: "active" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, role: true, projectId: true } }),
    prisma.constructionImportBatch.findFirst({ where: { workspaceId: membership.workspaceId, status: { in: ["PREVIEW", "DECISIONS_REQUIRED", "READY_TO_COMMIT"] } }, orderBy: { createdAt: "desc" }, include: { rows: { orderBy: { rowNumber: "asc" }, include: { decisions: { orderBy: { createdAt: "desc" }, take: 1 } } } } }),
  ]);
  const firstValueReady = projects.length > 0 && contacts.length > 0;
  return onboardingCockpitSchema.parse({
    schemaVersion: 1, generatedAt, role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
    session: session ? { id: session.id, workspaceId: session.workspaceId, stage: session.stage, status: session.status, stateVersion: session.stateVersion, firstValueReady, nextAction: session.nextAction } : null,
    workspace: { id: membership.workspace.id, name: membership.workspace.name, timezone: membership.workspace.defaultTimezone, locale: membership.workspace.defaultLocale },
    projects, contacts: contacts.map((contact) => ({ id: contact.id, displayName: contact.displayName, roleLabel: contact.role, projectId: contact.projectId })),
    activeBatch: activeBatch ? { id: activeBatch.id, kind: activeBatch.kind, status: activeBatch.status, stateVersion: activeBatch.stateVersion, sourceHash: activeBatch.sourceHash, previewFingerprint: activeBatch.previewFingerprint, rowCount: activeBatch.rowCount, counts: { ready: activeBatch.readyCount, duplicate: activeBatch.duplicateCount, conflict: activeBatch.conflictCount, invalid: activeBatch.invalidCount }, rows: activeBatch.rows.map((row) => ({ id: row.id, rowNumber: row.rowNumber, state: row.state, reasonCodes: row.reasonCodes, normalizedProposal: row.normalizedProposal, candidateCanonicalIds: row.candidateCanonicalIds, decision: row.decisions[0] ? { action: row.decisions[0].action, matchedCanonicalId: row.decisions[0].matchedCanonicalId } : null })) } : null,
    providerObserved: false, externalEffectCount: 0,
  });
}

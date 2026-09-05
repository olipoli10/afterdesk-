import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  EXACT_REPORT,
  addContradictionStep,
  addPhotoStep,
  addWrittenApprovalStep,
  completeReloadCheckpoint,
  computePostgresqlMeasurements,
  consumeFounderAccessToken,
  markReloadStep,
  prepareFollowUpStep,
  prepareFounderTestAccess,
  reportWorkFinishedStep,
  resolveContradictionStep,
  sealFounderObservation,
  startFounderSession,
  testReplayStep,
  verifyFieldViewStep,
} from "@/server/construction-operating-assistant-r38/founder-test";

const token = "coa-r38-integration-token";
const replacementToken = "coa-r38-replacement-token";
const feature = "specs/196-r38-founder-full-loop-preparation";
const sessionPath = path.join(process.cwd(), "storage/founder-tests/coa-r38/session.json");
const observationPath = path.join(process.cwd(), feature, "evidence/founder-observation.json");
const measurementsPath = path.join(process.cwd(), feature, "evidence/postgresql-measurements.json");

describe.skipIf(!process.env.DATABASE_URL)("Construction Operating Assistant R38 disposable PostgreSQL dry run", () => {
  beforeAll(async () => {
    process.env.ENDVERA_R38_FOUNDER_TEST_MODE = "ENABLED";
    process.env.ENDVERA_R38_DISPOSABLE_DB_NAME = "endvera-construction-operating-assistant-r38";
    process.env.ENDVERA_R38_FOUNDER_TOKEN_SHA256 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((value) => Buffer.from(value).toString("hex"));
    process.env.ENDVERA_R38_FOUNDER_TOKEN_EXPIRES_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    delete process.env.ENDVERA_R38_HUMAN_OBSERVATION;
    await prisma.constructionWorkspace.deleteMany({ where: { id: "coa-r1-workspace" } });
    await rm(sessionPath, { force: true });
    await rm(observationPath, { force: true });
    await rm(measurementsPath, { force: true });
  });

  afterAll(async () => {
    await rm(sessionPath, { force: true });
    await prisma.constructionWorkspace.deleteMany({ where: { id: "coa-r1-workspace" } });
    await prisma.$disconnect();
  });

  it("runs the entire safe loop without creating a founder observation", async () => {
    let session = await prepareFounderTestAccess();
    session = await consumeFounderAccessToken(token);
    await expect(consumeFounderAccessToken(token)).rejects.toThrow("COA_R1_ACCESS_TOKEN_EXPIRED_OR_REPLAYED");
    const consumedSessionId = session.sessionId;
    process.env.ENDVERA_R38_FOUNDER_TOKEN_SHA256 = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(replacementToken))
      .then((value) => Buffer.from(value).toString("hex"));
    session = await prepareFounderTestAccess();
    expect(session.stage).toBe("NOT_STARTED");
    expect(session.accessConsumedAtUtc).toBeNull();
    expect(session.sessionId).not.toBe(consumedSessionId);
    session = await consumeFounderAccessToken(replacementToken);
    session = await startFounderSession(session);
    session = await reportWorkFinishedStep(session, EXACT_REPORT);
    expect(session.missingAfterReport).toEqual(expect.arrayContaining(["WRITTEN_APPROVAL", "SUPPORTING_EVIDENCE"]));
    session = await addContradictionStep(session);
    session = await resolveContradictionStep(session);
    session = await addWrittenApprovalStep(session);
    session = await addPhotoStep(session);
    session = await testReplayStep(session);
    session = await markReloadStep(session);
    session = await completeReloadCheckpoint(session);
    session = await prepareFollowUpStep(session);
    session = await verifyFieldViewStep(session);

    const measurements = await computePostgresqlMeasurements(session);
    expect(measurements).toMatchObject({
      projectAssociationAccuracyPercent: 100,
      canonicalOpenLoopCount: 1,
      duplicateCanonicalEffectCount: 0,
      replayCanonicalEffectCount: 0,
      restartProjectionIdentical: true,
      contradictionClaimCount: 2,
      contradictionClaimsPreserved: true,
      contradictionResolutionAuthorized: true,
      readyBeforeRequiredEvidenceCount: 0,
      readyToInvoiceReached: true,
      nextResponsibleActorCorrect: true,
      preparedFollowUpCount: 1,
      preparedFollowUpStatus: "PREPARED_UNSENT",
      transportAuthorized: false,
      externalTransportCount: 0,
      providerInvocationCount: 0,
      crossWorkspaceReadCount: 0,
      fieldWorkerFinancialLeakCount: 0,
      inventedFactCount: 0,
      humanSessionCount: 1,
    });
    await expect(
      sealFounderObservation(session, {
        founderCorrectionCount: 0,
        manualContextRestatementCount: 0,
        missingEvidenceClarityRating: 5,
        contradictionClarityRating: 5,
        nextActorClarityRating: 5,
        actionabilityRating: 5,
        confidenceBeforeInvoicingRating: 5,
        wouldUseBeforeInvoicing: true,
        economicValueExplanation: "Fixture must not seal.",
        activeVisibleMilliseconds: 1000,
        hiddenOrInactiveMilliseconds: 0,
        humanConfirmation: "confirmed",
      }),
    ).rejects.toThrow("COA_R1_REAL_FOUNDER_PRESENCE_REQUIRED");
    expect(existsSync(observationPath)).toBe(false);
    expect(existsSync(measurementsPath)).toBe(false);
  });
});

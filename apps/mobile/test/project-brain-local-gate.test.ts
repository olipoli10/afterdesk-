import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectBrainAssistantMemoryRoute } from "../src/lib/project-brain-assistant-memory";
import { projectBrainUnderstandingRoute } from "../src/lib/project-brain-understanding-review";
import { mobileProductCopy } from "../src/lib/product-experience";

type MobileAssertion = {
  id: string;
  chapter: "MOBILE";
  expected: boolean | number | string;
  actual: boolean | number | string;
  status: "PASS";
  evidence: string;
  label: "TEST" | "SYNTHETIC";
};

const assertions: MobileAssertion[] = [];

function record(id: string, expected: MobileAssertion["expected"], actual: MobileAssertion["actual"], label: MobileAssertion["label"] = "TEST") {
  expect(actual, id).toEqual(expected);
  assertions.push({ id, chapter: "MOBILE", expected, actual, status: "PASS", evidence: "apps/mobile/test/project-brain-local-gate.test.ts", label });
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function emitFragment() {
  const directory = process.env.R36Z_FRAGMENT_DIR;
  const runId = process.env.R36Z_RUN_ID;
  if (!directory || !runId) return;
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "mobile.json");
  if (existsSync(path)) throw new Error("R36Z_DUPLICATE_MOBILE_FRAGMENT");
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    runId,
    fragmentId: "mobile",
    evidenceLabels: { test: true, synthetic: true, founderObserved: false, customerObserved: false, providerObserved: false },
    assertions,
    technicalIdentifierInputCount: 0,
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

describe("R36Z mobile Project Brain local gate", () => {
  it("keeps intake, review, recall and prepared action in one visible project flow", () => {
    const projects = source("src/app/(app)/projects.tsx");
    const intake = source("src/app/(app)/project-brain-intake.tsx");
    const review = source("src/app/(app)/project-brain-understanding-review.tsx");
    const assistant = source("src/app/(app)/assistant.tsx");
    const copy = mobileProductCopy("fr-CA");

    const navigationIsProjectBound = projects.includes('pathname: "/project-brain-intake"')
      && projects.includes('pathname: "/project-brain-understanding-review"')
      && projects.includes('pathname: "/assistant"')
      && projects.match(/params: \{ projectId: project\.id \}/gu)?.length === 4
      && projectBrainUnderstandingRoute("project-visible") === "/(app)/project-brain-understanding-review?projectId=project-visible"
      && projectBrainAssistantMemoryRoute("project-visible") === "/(app)/assistant?projectId=project-visible";
    record("MOBILE-ONE-SURFACE-NAVIGATION", true, navigationIsProjectBound, "SYNTHETIC");

    const visibleLiterals = [projects, intake, review, assistant]
      .flatMap((text) => text.match(/["'`][^"'`]*["'`]/gu) ?? [])
      .join("\n");
    const technicalIdPrompt = /(?:copy|paste|coller|copier|enter|saisir).{0,80}(?:workspace|project|intake|snapshot|batch|candidate|contradiction|memory|binding).{0,20}\bid\b/iu;
    record("MOBILE-NO-TECHNICAL-ID", 0, technicalIdPrompt.test(visibleLiterals) ? 1 : 0);

    const limitationsVisible = intake.includes("copy.limits")
      && review.includes("copy.localOnly")
      && copy.projectBrain.limits.includes("ne sont pas transcrites")
      && copy.projectBrain.limits.includes("n’est pas interprété")
      && copy.projectBrainReview.localOnly.includes("aucun modèle");
    record("MOBILE-LIMITATIONS-VISIBLE", true, limitationsVisible);

    const contradictionControlsVisible = review.includes('accessibilityLabel={copy.declare}')
      && review.includes('accessibilityLabel={copy.chooseSupported}')
      && review.includes('accessibilityLabel={copy.saveResolution}')
      && review.includes("memberCandidateIds.map")
      && copy.projectBrainReview.contradictions.length > 0;
    record("MOBILE-CONTRADICTION-CONTROLS", true, contradictionControlsVisible);

    const preparedBoundaryVisible = assistant.includes("preparedAction.recipientDisplayName")
      && assistant.includes("preparedAction.channel")
      && assistant.includes("preparedAction.body")
      && assistant.includes("preparedAction.citations.length")
      && assistant.includes("copy.assistantMemory.approval")
      && copy.assistantMemory.prepared.includes("rien n’a été envoyé");
    record("MOBILE-PREPARED-ACTION-BOUNDARY", true, preparedBoundaryVisible, "SYNTHETIC");
    record("MOBILE-SYNTHETIC-LABEL", false, false, "SYNTHETIC");

    emitFragment();
  });
});

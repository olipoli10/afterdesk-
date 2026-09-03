import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(import.meta.dirname, "..");

function futureSource(relativePath: string) {
  const path = resolve(mobileRoot, relativePath);
  expect(existsSync(path), `missing future Project Brain mobile file: ${relativePath}`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("R36V Project Brain mobile RED contract", () => {
  it("defines strict local-only contracts and independently retriable source attempts", () => {
    const source = futureSource("src/lib/project-brain-intake.ts");

    for (const token of [
      '"CREATE_PROJECT_BRAIN_INTAKE"',
      '"ADD_OWNER_BRIEF"',
      '"ADMIT_PROJECT_BRAIN_SOURCE"',
      '"SUBMIT_PROJECT_BRAIN_INTAKE"',
      '"CONFIRM_PROJECT_BRAIN_INTAKE"',
      '"REJECT_PROJECT_BRAIN_INTAKE"',
      '"OUTCOME_UNKNOWN"',
      '"NOT_REQUESTED_LOCAL_ONLY"',
      "externalTransportPerformed",
      "providerExecutionPerformed",
    ]) {
      expect(source, token).toContain(token);
    }

    expect(source).toMatch(/\.strict\(\)/u);
    expect(source).toMatch(/beginProjectBrainSourceAttempt/u);
    expect(source).toMatch(/finishProjectBrainSourceAttempt/u);
    expect(source).toMatch(/state\s*!==\s*["']OUTCOME_UNKNOWN["']/u);
  });

  it("wires a durable queue whose failed item retries without discarding admitted siblings", () => {
    const api = futureSource("src/lib/api.ts");
    const session = futureSource("src/state/mobile-session.tsx");

    expect(api).toMatch(/projectBrainIntake\s*\(/u);
    expect(api).toMatch(/projectBrainCommand\s*\(/u);
    expect(api).toMatch(/uploadProjectBrainSource\s*\(/u);

    expect(session).toContain("projectBrainSourceQueue");
    expect(session).toContain("submitProjectBrainCommand");
    expect(session).toContain("uploadProjectBrainSource");
    expect(session).toContain("retryProjectBrainSource");
    expect(session).toContain("OUTCOME_UNKNOWN");
  });

  it("keeps selection, voice, owner brief, review, limitations and confirmation on one surface", () => {
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");

    expect(surface).toContain("DocumentPicker.getDocumentAsync");
    expect(surface).toMatch(/multiple:\s*true/u);
    expect(surface).toContain("useAudioRecorder");
    expect(surface).toContain("ownerBrief");
    expect(surface).toContain("reviewFingerprint");
    expect(surface).toContain("NOT_REQUESTED_LOCAL_ONLY");
    expect(surface).toContain('accessibilityRole="button"');
    expect(surface).toContain("accessibilityLabel=");
    expect(surface).not.toMatch(/router\.push\([^)]*(evidence|calls|assistant)/u);
  });

  it("exposes the intake as one hidden project route without adding a sixth primary tab", () => {
    const layout = futureSource("src/app/(app)/_layout.tsx");
    const projects = futureSource("src/app/(app)/projects.tsx");

    expect(layout).toMatch(
      /name="project-brain-intake"[^>]*href:\s*null/su,
    );
    expect(projects).toContain('pathname: "/project-brain-intake"');
    expect(projects).toContain("projectId: project.id");

    const visibleTabs = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"\s+options=\{\{(?![^}]*href:\s*null)[^}]*\}\}/gsu)]
      .map((match) => match[1]);
    expect(visibleTabs).toHaveLength(5);
  });
});

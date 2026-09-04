import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  beginProjectBrainSourceAttempt,
  createProjectBrainSourceAttempt,
  createProjectBrainSourceAttempts,
  finishProjectBrainSourceAttempt,
  mobileProjectBrainCommandSchema,
  projectBrainBriefHydrationKey,
  projectBrainFailureStateForApiCode,
  projectBrainIntakeForContext,
  projectBrainOwnerBriefDraft,
  projectBrainOwnerBriefMatches,
  projectBrainSourceQueueForContext,
  rebaseReadyProjectBrainSourceAttempt,
  removeProjectBrainSourceAttempt,
  stageProjectBrainSourceAttempts,
} from "../src/lib/project-brain-intake";
import {
  beginProjectBrainCommandAttempt,
  commandIntent,
  createProjectBrainCommandAttempt,
  enqueueProjectBrainIntent,
  loadProjectBrainIntentSnapshot,
  loadProjectBrainIntents,
  projectBrainCanCreateNewVersion,
  projectBrainIntentPresentation,
  removeProjectBrainIntent,
  replaceReadyProjectBrainSourceIntent,
  sourceIntent,
  transitionProjectBrainIntent,
  type SecureProjectBrainIntentStore,
} from "../src/lib/project-brain-intent-queue";
import {
  reconcileProjectBrainSourceFiles,
  releaseProjectBrainSourceAttempt,
  retainProjectBrainSourceAttempt,
  withProjectBrainSourceLifecycleLock,
  type ProjectBrainSourceFileStore,
} from "../src/lib/project-brain-source-files";

const mobileRoot = resolve(import.meta.dirname, "..");

function futureSource(relativePath: string) {
  const path = resolve(mobileRoot, relativePath);
  expect(existsSync(path), `missing future Project Brain mobile file: ${relativePath}`).toBe(true);
  return readFileSync(path, "utf8");
}

function memoryStore() {
  const values = new Map<string, string>();
  const store: SecureProjectBrainIntentStore = {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
  return { store, values };
}

function faultingStore(
  base: SecureProjectBrainIntentStore,
  failAtSet: number,
  mode: "BEFORE_WRITE" | "AFTER_WRITE",
) {
  let writes = 0;
  const store: SecureProjectBrainIntentStore = {
    getItemAsync: (key) => base.getItemAsync(key),
    deleteItemAsync: (key) => base.deleteItemAsync(key),
    setItemAsync: async (key, value) => {
      writes += 1;
      if (writes === failAtSet && mode === "BEFORE_WRITE") throw new Error("INJECTED_TORN_WRITE");
      await base.setItemAsync(key, value);
      if (writes === failAtSet && mode === "AFTER_WRITE") throw new Error("INJECTED_AMBIGUOUS_WRITE");
    },
  };
  return store;
}

function countingStore(base: SecureProjectBrainIntentStore) {
  let writes = 0;
  const store: SecureProjectBrainIntentStore = {
    getItemAsync: (key) => base.getItemAsync(key),
    deleteItemAsync: (key) => base.deleteItemAsync(key),
    setItemAsync: async (key, value) => {
      writes += 1;
      await base.setItemAsync(key, value);
    },
  };
  return { store, writeCount: () => writes };
}

function memorySourceFileStore() {
  const files = new Map<string, string>();
  const store: ProjectBrainSourceFileStore = {
    retain: async ({ commandId, fileName, sourceUri, expectedSizeBytes }) => {
      const extension = fileName.match(/\.[a-z0-9]{1,10}$/iu)?.[0]?.toLowerCase() ?? "";
      const uri = `app-documents://project-brain/${commandId}${extension}`;
      if (files.has(uri)) return { uri, created: false };
      const bytes = files.get(sourceUri);
      if (bytes === undefined) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_CACHE_MISSING");
      if (new TextEncoder().encode(bytes).byteLength !== expectedSizeBytes) {
        throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_SIZE_MISMATCH");
      }
      files.set(uri, bytes);
      return { uri, created: true };
    },
    release: async ({ uri }) => { files.delete(uri); },
    inventory: async () => [...files.entries()]
      .filter(([uri]) => uri.startsWith("app-documents://project-brain/"))
      .map(([uri]) => ({ uri, name: uri.split("/").at(-1) ?? "" })),
    removeOrphan: async (uri) => { files.delete(uri); },
  };
  return { store, files };
}

function createCommand(commandId = "00000000-0000-4000-8000-000000000180") {
  return {
    schemaVersion: 1 as const,
    action: "CREATE_PROJECT_BRAIN_INTAKE" as const,
    commandId,
    workspaceId: "workspace-1",
    projectId: "project-1",
  };
}

function largeBriefCommand(commandId = "00000000-0000-4000-8000-000000000159") {
  return {
    schemaVersion: 1 as const,
    action: "ADD_OWNER_BRIEF" as const,
    commandId,
    workspaceId: "workspace-1",
    projectId: "project-1",
    intakeId: "intake-1",
    expectedStateVersion: 7,
    brief: {
      summary: "s".repeat(4_000),
      scope: "p".repeat(4_000),
      importantPeople: "i".repeat(4_000),
      importantDates: "d".repeat(4_000),
      blockers: "b".repeat(4_000),
      nextDecision: "n".repeat(4_000),
    },
  };
}

function sourceAttempt(commandId = "00000000-0000-4000-8000-000000000181") {
  return createProjectBrainSourceAttempt({
    schemaVersion: 1,
    action: "ADMIT_PROJECT_BRAIN_SOURCE",
    commandId,
    workspaceId: "workspace-1",
    projectId: "project-1",
    intakeId: "intake-1",
    expectedStateVersion: 2,
    kind: "DOCUMENT",
    fileName: "plan.pdf",
    mimeType: "application/pdf",
    sizeBytes: 128,
    durationMs: null,
    uri: "file:///synthetic/plan.pdf",
  });
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
    expect(surface).toContain("copy.localOnly");
    expect(surface).toContain('accessibilityRole="button"');
    expect(surface).toContain("accessibilityLabel=");
    expect(surface).toMatch(/useEffect\(\(\) => \{ if \(projectId\) void loadProjectBrainIntake\(projectId\)/u);
    expect(surface).toContain('decide("CONFIRM_PROJECT_BRAIN_INTAKE")');
    expect(surface).toContain("reviewFingerprint: intake.reviewFingerprint");
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

  it("retries only an unknown source attempt with the exact same command", () => {
    const attempt = createProjectBrainSourceAttempt({
      schemaVersion: 1,
      action: "ADMIT_PROJECT_BRAIN_SOURCE",
      commandId: "00000000-0000-4000-8000-000000000187",
      workspaceId: "workspace-1",
      projectId: "project-1",
      intakeId: "intake-1",
      expectedStateVersion: 2,
      kind: "DOCUMENT",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
      durationMs: null,
      uri: "file:///synthetic/plan.pdf",
    });
    const unknown = finishProjectBrainSourceAttempt(beginProjectBrainSourceAttempt(attempt), { state: "OUTCOME_UNKNOWN" });
    const retry = beginProjectBrainSourceAttempt(unknown);
    expect(retry.command).toEqual(attempt.command);
    expect(() => beginProjectBrainSourceAttempt(finishProjectBrainSourceAttempt(retry, { state: "CONFIRMED" }))).toThrow(
      "MOBILE_PROJECT_BRAIN_SOURCE_ALREADY_DISPATCHED",
    );
  });

  it.each(["RATE_LIMITED", "SERVER_ERROR"])(
    "keeps a transient %s source failure retryable under the same command identity",
    (code) => {
      const attempt = sourceAttempt();
      const failed = finishProjectBrainSourceAttempt(beginProjectBrainSourceAttempt(attempt), {
        state: projectBrainFailureStateForApiCode(code),
        publicError: code,
      });
      expect(failed).toMatchObject({ state: "OUTCOME_UNKNOWN", command: attempt.command });
      expect(beginProjectBrainSourceAttempt(failed).command.commandId).toBe(attempt.command.commandId);
    },
  );

  it("keeps confirmation body-bound and rejects unknown or provider fields", () => {
    const exact = {
      schemaVersion: 1,
      action: "CONFIRM_PROJECT_BRAIN_INTAKE",
      commandId: "00000000-0000-4000-8000-000000000188",
      workspaceId: "workspace-1",
      projectId: "project-1",
      intakeId: "intake-1",
      expectedStateVersion: 4,
      reviewFingerprint: "a".repeat(64),
    };
    expect(mobileProjectBrainCommandSchema.parse(exact)).toEqual(exact);
    expect(() => mobileProjectBrainCommandSchema.parse({ ...exact, providerExecutionPerformed: true })).toThrow();
    expect(() => mobileProjectBrainCommandSchema.parse({ ...exact, reviewFingerprint: "b" })).toThrow();
  });

  it("keys projections and pending sources to the exact workspace and project", () => {
    const projection = {
      intake: { workspaceId: "workspace-1", projectId: "project-1" },
    } as Parameters<typeof projectBrainIntakeForContext>[0];
    const attempt = createProjectBrainSourceAttempt({
      schemaVersion: 1, action: "ADMIT_PROJECT_BRAIN_SOURCE", commandId: "00000000-0000-4000-8000-000000000189",
      workspaceId: "workspace-1", projectId: "project-1", intakeId: "intake-1", expectedStateVersion: 1,
      kind: "DOCUMENT", fileName: "plan.pdf", mimeType: "application/pdf", sizeBytes: 128, durationMs: null, uri: "file:///plan.pdf",
    });
    expect(projectBrainIntakeForContext(projection, "workspace-1", "project-1")).not.toBeNull();
    expect(projectBrainIntakeForContext(projection, "workspace-1", "project-2")).toBeNull();
    expect(projectBrainSourceQueueForContext([attempt], "workspace-1", "project-2")).toEqual([]);
  });

  it("stages every selected sibling and removes only the terminal row", () => {
    const base = {
      schemaVersion: 1 as const, action: "ADMIT_PROJECT_BRAIN_SOURCE" as const, workspaceId: "workspace-1",
      projectId: "project-1", intakeId: "intake-1", kind: "DOCUMENT" as const, mimeType: "application/pdf" as const,
      sizeBytes: 128, durationMs: null, uri: "file:///plan.pdf",
    };
    const attempts = createProjectBrainSourceAttempts([
      { ...base, commandId: "00000000-0000-4000-8000-000000000190", fileName: "one.pdf" },
      { ...base, commandId: "00000000-0000-4000-8000-000000000191", fileName: "two.pdf" },
    ], 4);
    expect(attempts.map((attempt) => attempt.command.expectedStateVersion)).toEqual([4, 5]);
    const staged = stageProjectBrainSourceAttempts([], attempts);
    expect(removeProjectBrainSourceAttempt(staged, attempts[0]!.command.commandId)).toEqual([attempts[1]]);
    expect(rebaseReadyProjectBrainSourceAttempt(attempts[1]!, 4).command).toMatchObject({
      commandId: attempts[1]!.command.commandId,
      expectedStateVersion: 4,
    });
    expect(() => rebaseReadyProjectBrainSourceAttempt(beginProjectBrainSourceAttempt(attempts[1]!), 4)).toThrow(
      "MOBILE_PROJECT_BRAIN_SOURCE_REBASE_REFUSED",
    );
  });

  it("recognizes unsaved brief drift so exact review cannot use stale server content", () => {
    const brief = { summary: "Laval", scope: "Dosseret", importantPeople: "Marc", importantDates: "Mardi", blockers: "", nextDecision: "Valider" };
    expect(projectBrainOwnerBriefMatches(brief, brief)).toBe(true);
    expect(projectBrainOwnerBriefMatches(brief, { ...brief, summary: "Laval modifié" })).toBe(false);
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(surface).toContain('editable={intake.status === "DRAFT" && !busy}');
    expect(surface).toContain("!briefIsDurable");
  });

  it("resets every brief field when context switches from intake A to B without a brief", () => {
    let visibleDraft = projectBrainOwnerBriefDraft({
      summary: "Projet A",
      scope: "Cuisine A",
      importantPeople: "Marc A",
      importantDates: "Mardi A",
      blockers: "Blocage A",
      nextDecision: "Décision A",
    });
    expect(visibleDraft.summary).toBe("Projet A");

    visibleDraft = projectBrainOwnerBriefDraft(null);
    expect(visibleDraft).toEqual({
      summary: "",
      scope: "",
      importantPeople: "",
      importantDates: "",
      blockers: "",
      nextDecision: "",
    });

    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(surface).toContain("briefHydrationKey");
    expect(surface).toContain("projectBrainBriefHydrationKey({");
    expect(surface).toContain("workspaceId: activeWorkspace?.id");
    expect(surface).toContain("intakeId: intake?.id");
    expect(surface).toContain("durable: intake?.ownerBrief");
    expect(projectBrainBriefHydrationKey({
      workspaceId: "workspace-a",
      projectId: "project-a",
      intakeId: "intake-a",
      durable: { summary: "Projet A", scope: "", importantPeople: "", importantDates: "", blockers: "", nextDecision: "" },
    })).not.toBe(projectBrainBriefHydrationKey({
      workspaceId: "workspace-b",
      projectId: "project-b",
      intakeId: "intake-b",
      durable: null,
    }));
    expect(surface).not.toContain("if (!intake?.ownerBrief) return");
  });

  it("localizes human states and keeps internal fingerprints out of the main surface", () => {
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    const copy = futureSource("src/lib/product-experience.ts");
    expect(copy).toContain('voiceMobileOnly: "Voice recording is available in the iOS or Android app."');
    expect(surface).not.toContain("État:");
    expect(surface).not.toContain("Permission microphone refusée.");
    expect(surface).not.toMatch(/<Text[^>]*>reviewFingerprint:/u);
    expect(surface).not.toContain(" · NOT_REQUESTED_LOCAL_ONLY");
  });

  it("finalizes an automatically stopped native recording and refuses misleading web audio", () => {
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(surface).toContain('Platform.OS === "web"');
    expect(surface).toContain("recordingSeen.current");
    expect(surface).toContain("void finalizeRecordedVoiceRef.current()");
    expect(surface).toContain("const stoppedState = recorder.getStatus()");
    expect(surface).toContain('mimeType: "audio/m4a"');
    expect(surface).toMatch(/disabled=\{busy \|\| hasPendingCommand \|\| intake\.status !== "DRAFT" \|\| Platform\.OS === "web"\}/u);
  });

  it("blocks untouched siblings while an exact unknown outcome must be retried", () => {
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(surface).toContain('hasUnknownSourceOutcome = sourceQueue.some((item) => item.state === "OUTCOME_UNKNOWN")');
    expect(surface).toContain('attempt.state === "READY" && hasUnknownSourceOutcome');
    const session = futureSource("src/state/mobile-session.tsx");
    expect(session).toContain("rebaseReadyProjectBrainSourceAttempt");
  });

  it("rehydrates project memory intents on project entry while isolating workspace state", () => {
    const session = futureSource("src/state/mobile-session.tsx");
    expect(session).toMatch(/loadProjectBrainIntake[\s\S]*?loadProjectBrainIntentSnapshot/u);
    expect(session).toContain("snapshot.allIntents");
    expect(session).toContain("retainedAttempts: globallyRetainedSources");
    expect(session).toContain("requiredAttempts: visibleSources");
    expect(session).toContain("setProjectBrainCommandQueue");
    expect(session.match(/projectBrainContext\.current !== context/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(session.match(/projectBrainContext\.current = null/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(session).toContain("removeProjectBrainSourceAttempt(queue, completed.command.commandId)");
  });

  it("refuses an overlong recording instead of clamping client-reported duration", () => {
    const screen = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(screen).toContain("durationMs > PROJECT_BRAIN_MAX_VOICE_DURATION_MS");
    expect(screen).toContain("setLocalError(copy.voiceTooLong)");
    expect(screen).toMatch(/sizeBytes: blob\.size, durationMs, uri/u);
    expect(screen).not.toContain("Math.min(durationMs, PROJECT_BRAIN_MAX_VOICE_DURATION_MS)");
  });

  it("rehydrates an interrupted command as outcome unknown with the exact same command id", async () => {
    const { store } = memoryStore();
    const command = createCommand();
    const ready = createProjectBrainCommandAttempt(command);
    await enqueueProjectBrainIntent({ intent: commandIntent(ready), store });
    await transitionProjectBrainIntent({ commandId: command.commandId, state: "SENDING", store });

    const afterRemount = await loadProjectBrainIntents({
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      interruptedPublicError: "Interrupted locally",
      store,
    });

    expect(afterRemount).toHaveLength(1);
    expect(afterRemount[0]).toMatchObject({
      kind: "COMMAND",
      attempt: { state: "OUTCOME_UNKNOWN", publicError: "Interrupted locally", command },
    });
    const restored = afterRemount[0];
    if (!restored || restored.kind !== "COMMAND") throw new Error("expected command intent");
    const retry = beginProjectBrainCommandAttempt(restored.attempt);
    expect(retry.command).toEqual(command);
    expect(retry.command.commandId).toBe(command.commandId);
  });

  it("linearizes concurrent enqueues so both durable intentions remain indexed", async () => {
    const { store } = memoryStore();
    const first = createCommand("00000000-0000-4000-8000-000000000150");
    const second = createCommand("00000000-0000-4000-8000-000000000151");
    await Promise.all([
      enqueueProjectBrainIntent({
        intent: commandIntent(createProjectBrainCommandAttempt(first)),
        store,
      }),
      enqueueProjectBrainIntent({
        intent: commandIntent(createProjectBrainCommandAttempt(second)),
        store,
      }),
    ]);

    const restored = await loadProjectBrainIntents({
      workspaceId: first.workspaceId,
      projectId: first.projectId,
      interruptedPublicError: "Interrupted locally",
      store,
    });
    expect(restored.map((intent) => intent.attempt.command.commandId).sort()).toEqual([
      first.commandId,
      second.commandId,
    ].sort());
  });

  it.each([1, 2, 3])(
    "keeps the old generation when a replacement write fails before boundary %i commits",
    async (failAtSet) => {
      const { store } = memoryStore();
      const command = createCommand("00000000-0000-4000-8000-000000000160");
      await enqueueProjectBrainIntent({ intent: commandIntent(createProjectBrainCommandAttempt(command)), store });

      await expect(transitionProjectBrainIntent({
        commandId: command.commandId,
        state: "SENDING",
        store: faultingStore(store, failAtSet, "BEFORE_WRITE"),
      })).rejects.toThrow("INJECTED_TORN_WRITE");

      const restored = await loadProjectBrainIntents({
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        interruptedPublicError: "Interrupted locally",
        store,
      });
      expect(restored).toHaveLength(1);
      expect(restored[0]).toMatchObject({
        kind: "COMMAND",
        attempt: { state: "READY", command },
      });
    },
  );

  it("recovers the exact new generation when the atomic pointer commits but reports an error", async () => {
    const { store } = memoryStore();
    const command = createCommand("00000000-0000-4000-8000-000000000161");
    await enqueueProjectBrainIntent({ intent: commandIntent(createProjectBrainCommandAttempt(command)), store });

    await expect(transitionProjectBrainIntent({
      commandId: command.commandId,
      state: "SENDING",
      store: faultingStore(store, 3, "AFTER_WRITE"),
    })).rejects.toThrow("INJECTED_AMBIGUOUS_WRITE");

    const restored = await loadProjectBrainIntents({
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      interruptedPublicError: "Interrupted locally",
      store,
    });
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      kind: "COMMAND",
      attempt: { state: "OUTCOME_UNKNOWN", publicError: "Interrupted locally", command },
    });
  });

  it("keeps the same hydration key when a refreshed projection recreates the same durable brief", () => {
    const durable = {
      summary: "Projet A",
      scope: "Cuisine A",
      importantPeople: "Marc A",
      importantDates: "Mardi A",
      blockers: "Blocage A",
      nextDecision: "Décision A",
    };
    const first = projectBrainBriefHydrationKey({
      workspaceId: "workspace-1",
      projectId: "project-1",
      intakeId: "intake-1",
      durable,
    });
    const refreshed = projectBrainBriefHydrationKey({
      workspaceId: "workspace-1",
      projectId: "project-1",
      intakeId: "intake-1",
      durable: { ...durable },
    });
    expect(refreshed).toBe(first);
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(surface).toContain("lastBriefHydrationKey.current === briefHydrationKey");
    expect(surface).toContain('editable={intake.status === "DRAFT" && !busy}');
  });

  it("recovers an initial enqueue across every journal, entry and index write boundary", async () => {
    const probe = memoryStore();
    const command = createCommand("00000000-0000-4000-8000-000000000158");
    const counted = countingStore(probe.store);
    await enqueueProjectBrainIntent({
      intent: commandIntent(createProjectBrainCommandAttempt(command)),
      store: counted.store,
    });
    const enqueueWriteCount = counted.writeCount();
    expect(enqueueWriteCount).toBe(5);

    for (const mode of ["BEFORE_WRITE", "AFTER_WRITE"] as const) {
      for (let failAtSet = 1; failAtSet <= enqueueWriteCount; failAtSet += 1) {
        const current = memoryStore();
        await expect(enqueueProjectBrainIntent({
          intent: commandIntent(createProjectBrainCommandAttempt(command)),
          store: faultingStore(current.store, failAtSet, mode),
        })).rejects.toThrow(mode === "BEFORE_WRITE" ? "INJECTED_TORN_WRITE" : "INJECTED_AMBIGUOUS_WRITE");
        const restored = await loadProjectBrainIntents({
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          interruptedPublicError: "Interrupted locally",
          store: current.store,
        });
        const entryCommitted = mode === "AFTER_WRITE"
          ? failAtSet >= enqueueWriteCount - 1
          : failAtSet === enqueueWriteCount;
        if (entryCommitted) {
          expect(restored).toHaveLength(1);
          expect(restored[0]).toMatchObject({ kind: "COMMAND", attempt: { state: "READY", command } });
        } else {
          expect(restored).toEqual([]);
          expect([...current.values.keys()].some((key) => key.includes(".entry.") || key.endsWith(".journal"))).toBe(false);
        }
      }
    }
  });

  it("atomically rebases a READY source at every replacement write boundary", async () => {
    const original = sourceAttempt("00000000-0000-4000-8000-000000000157");
    const replacement = rebaseReadyProjectBrainSourceAttempt(original, 9);
    const probe = memoryStore();
    await enqueueProjectBrainIntent({ intent: sourceIntent(original), store: probe.store });
    const counted = countingStore(probe.store);
    await replaceReadyProjectBrainSourceIntent({ expected: original, replacement, store: counted.store });
    const replaceWriteCount = counted.writeCount();
    expect(replaceWriteCount).toBe(3);

    for (const mode of ["BEFORE_WRITE", "AFTER_WRITE"] as const) {
      for (let failAtSet = 1; failAtSet <= replaceWriteCount; failAtSet += 1) {
        const current = memoryStore();
        await enqueueProjectBrainIntent({ intent: sourceIntent(original), store: current.store });
        await expect(replaceReadyProjectBrainSourceIntent({
          expected: original,
          replacement,
          store: faultingStore(current.store, failAtSet, mode),
        })).rejects.toThrow(mode === "BEFORE_WRITE" ? "INJECTED_TORN_WRITE" : "INJECTED_AMBIGUOUS_WRITE");
        const restored = await loadProjectBrainIntents({
          workspaceId: original.command.workspaceId,
          projectId: original.command.projectId,
          interruptedPublicError: "Interrupted locally",
          store: current.store,
        });
        const replacementCommitted = mode === "AFTER_WRITE" && failAtSet === replaceWriteCount;
        expect(restored[0]?.attempt.command).toEqual(
          replacementCommitted ? replacement.command : original.command,
        );
      }
    }

    const bodyDrift = createProjectBrainSourceAttempt({ ...replacement.command, fileName: "other.pdf" });
    await expect(replaceReadyProjectBrainSourceIntent({
      expected: replacement,
      replacement: bodyDrift,
      store: probe.store,
    })).rejects.toThrow("MOBILE_PROJECT_BRAIN_SOURCE_REPLACE_BODY_REFUSED");
  });

  it("recovers the old multi-chunk generation at every pre-pointer write boundary", async () => {
    const probe = memoryStore();
    const probeCommand = largeBriefCommand();
    const probeReady = createProjectBrainCommandAttempt(probeCommand);
    await enqueueProjectBrainIntent({ intent: commandIntent(probeReady), store: probe.store });
    const counted = countingStore(probe.store);
    await transitionProjectBrainIntent({
      commandId: probeCommand.commandId,
      state: "SENDING",
      store: counted.store,
    });
    const replacementWriteCount = counted.writeCount();
    expect(replacementWriteCount).toBeGreaterThan(3);

    for (let failAtSet = 1; failAtSet <= replacementWriteCount; failAtSet += 1) {
      const current = memoryStore();
      const command = largeBriefCommand();
      await enqueueProjectBrainIntent({
        intent: commandIntent(createProjectBrainCommandAttempt(command)),
        store: current.store,
      });
      await expect(transitionProjectBrainIntent({
        commandId: command.commandId,
        state: "SENDING",
        store: faultingStore(current.store, failAtSet, "BEFORE_WRITE"),
      })).rejects.toThrow("INJECTED_TORN_WRITE");
      const restored = await loadProjectBrainIntents({
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        interruptedPublicError: "Interrupted locally",
        store: current.store,
      });
      expect(restored[0]).toMatchObject({
        kind: "COMMAND",
        attempt: { state: "READY", command },
      });
    }
  });

  it("persists exact command identity for create, brief, submit, confirm and reject", async () => {
    const { store } = memoryStore();
    const commands = [
      createCommand("00000000-0000-4000-8000-000000000170"),
      {
        schemaVersion: 1 as const,
        action: "ADD_OWNER_BRIEF" as const,
        commandId: "00000000-0000-4000-8000-000000000171",
        workspaceId: "workspace-1",
        projectId: "project-1",
        intakeId: "intake-1",
        expectedStateVersion: 2,
        brief: {
          summary: "Rénovation Laval",
          scope: "Cuisine",
          importantPeople: "Marc",
          importantDates: "Mardi",
          blockers: "Aucun",
          nextDecision: "Confirmer",
        },
      },
      {
        schemaVersion: 1 as const,
        action: "SUBMIT_PROJECT_BRAIN_INTAKE" as const,
        commandId: "00000000-0000-4000-8000-000000000172",
        workspaceId: "workspace-1",
        projectId: "project-1",
        intakeId: "intake-1",
        expectedStateVersion: 3,
      },
      {
        schemaVersion: 1 as const,
        action: "CONFIRM_PROJECT_BRAIN_INTAKE" as const,
        commandId: "00000000-0000-4000-8000-000000000173",
        workspaceId: "workspace-1",
        projectId: "project-1",
        intakeId: "intake-1",
        expectedStateVersion: 4,
        reviewFingerprint: "a".repeat(64),
      },
      {
        schemaVersion: 1 as const,
        action: "REJECT_PROJECT_BRAIN_INTAKE" as const,
        commandId: "00000000-0000-4000-8000-000000000174",
        workspaceId: "workspace-1",
        projectId: "project-1",
        intakeId: "intake-1",
        expectedStateVersion: 4,
        reviewFingerprint: "b".repeat(64),
      },
    ];

    for (const command of commands) {
      await enqueueProjectBrainIntent({
        intent: commandIntent(createProjectBrainCommandAttempt(command)),
        store,
      });
      await transitionProjectBrainIntent({ commandId: command.commandId, state: "SENDING", store });
    }

    const restored = await loadProjectBrainIntents({
      workspaceId: "workspace-1",
      projectId: "project-1",
      interruptedPublicError: "Interrupted locally",
      store,
    });
    expect(restored.map((intent) => intent.attempt.command)).toEqual(commands);
    expect(restored.map((intent) => intent.attempt.state)).toEqual(Array(5).fill("OUTCOME_UNKNOWN"));
  });

  it("rehydrates each selected source independently and retains terminal refusal evidence", async () => {
    const { store } = memoryStore();
    const refused = sourceAttempt("00000000-0000-4000-8000-000000000182");
    const waiting = sourceAttempt("00000000-0000-4000-8000-000000000183");
    await enqueueProjectBrainIntent({ intent: sourceIntent(refused), store });
    await enqueueProjectBrainIntent({ intent: sourceIntent(waiting), store });
    await transitionProjectBrainIntent({ commandId: refused.command.commandId, state: "SENDING", store });
    await transitionProjectBrainIntent({
      commandId: refused.command.commandId,
      state: "REFUSED",
      publicError: "Type de fichier refusé",
      store,
    });

    const afterRemount = await loadProjectBrainIntents({
      workspaceId: "workspace-1",
      projectId: "project-1",
      interruptedPublicError: "Interrupted locally",
      store,
    });

    expect(afterRemount.map((intent) => ({
      id: intent.attempt.command.commandId,
      state: intent.attempt.state,
      error: intent.attempt.publicError,
    }))).toEqual([
      { id: refused.command.commandId, state: "REFUSED", error: "Type de fichier refusé" },
      { id: waiting.command.commandId, state: "READY", error: null },
    ]);
  });

  it("retains source bytes outside picker cache through remount and exact unknown retry", async () => {
    const { store: intentStore } = memoryStore();
    const { store: fileStore, files } = memorySourceFileStore();
    const original = sourceAttempt("00000000-0000-4000-8000-000000000162");
    const syntheticBytes = "x".repeat(original.command.sizeBytes);
    files.set(original.command.uri, syntheticBytes);

    const retained = await retainProjectBrainSourceAttempt(original, fileStore);
    expect(retained.created).toBe(true);
    expect(retained.attempt.command.uri).not.toBe(original.command.uri);
    await expect(releaseProjectBrainSourceAttempt(
      retained.attempt,
      { reason: "TERMINAL_DISMISS" },
      fileStore,
    )).rejects.toThrow("MOBILE_PROJECT_BRAIN_SOURCE_RELEASE_STATE_REFUSED");
    expect(files.get(retained.attempt.command.uri)).toBe(syntheticBytes);
    await enqueueProjectBrainIntent({ intent: sourceIntent(retained.attempt), store: intentStore });
    await transitionProjectBrainIntent({
      commandId: retained.attempt.command.commandId,
      state: "SENDING",
      store: intentStore,
    });
    files.delete(original.command.uri);

    const restored = await loadProjectBrainIntents({
      workspaceId: retained.attempt.command.workspaceId,
      projectId: retained.attempt.command.projectId,
      interruptedPublicError: "Interrupted locally",
      store: intentStore,
    });
    const restoredSource = restored[0];
    expect(restoredSource).toMatchObject({
      kind: "SOURCE",
      attempt: {
        state: "OUTCOME_UNKNOWN",
        command: {
          commandId: original.command.commandId,
          uri: retained.attempt.command.uri,
        },
      },
    });
    expect(files.get(retained.attempt.command.uri)).toBe(syntheticBytes);
    expect(files.has(original.command.uri)).toBe(false);

    if (!restoredSource || restoredSource.kind !== "SOURCE") throw new Error("expected source intent");
    const exactRetry = beginProjectBrainSourceAttempt(restoredSource.attempt);
    expect(exactRetry.command).toEqual(retained.attempt.command);
    await transitionProjectBrainIntent({
      commandId: exactRetry.command.commandId,
      state: "SENDING",
      store: intentStore,
    });
    await transitionProjectBrainIntent({
      commandId: exactRetry.command.commandId,
      state: "REFUSED",
      publicError: "Terminal refusal",
      store: intentStore,
    });
    await releaseProjectBrainSourceAttempt(
      { ...restoredSource.attempt, state: "REFUSED", publicError: "Terminal refusal" },
      { reason: "TERMINAL_DISMISS" },
      fileStore,
    );
    await removeProjectBrainIntent({ commandId: exactRetry.command.commandId, store: intentStore });
    expect(files.has(retained.attempt.command.uri)).toBe(false);
  });

  it("reconciles staging and orphan files while preserving every source retained by the durable queue", async () => {
    const { store, files } = memorySourceFileStore();
    const original = sourceAttempt("00000000-0000-4000-8000-000000000156");
    files.set(original.command.uri, "x".repeat(original.command.sizeBytes));
    const retained = await retainProjectBrainSourceAttempt(original, store);
    const stagingUri = "app-documents://project-brain/abandoned.staging";
    const orphanUri = "app-documents://project-brain/00000000-0000-4000-8000-000000000155.pdf";
    files.set(stagingUri, "partial");
    files.set(orphanUri, "orphan");

    const plan = await reconcileProjectBrainSourceFiles({
      retainedAttempts: [retained.attempt],
      requiredAttempts: [retained.attempt],
    }, store);
    expect(plan).toEqual({
      deleteUris: [stagingUri, orphanUri],
      missingUris: [],
    });
    expect(files.has(retained.attempt.command.uri)).toBe(true);
    expect(files.has(stagingUri)).toBe(false);
    expect(files.has(orphanUri)).toBe(false);

    files.delete(retained.attempt.command.uri);
    await expect(reconcileProjectBrainSourceFiles({
      retainedAttempts: [retained.attempt],
      requiredAttempts: [retained.attempt],
    }, store)).rejects.toThrow(
      "MOBILE_PROJECT_BRAIN_SOURCE_DURABLE_FILE_MISSING",
    );
  });

  it("linearizes retain plus enqueue against startup reconciliation", async () => {
    const intentMemory = memoryStore();
    const sourceMemory = memorySourceFileStore();
    const original = sourceAttempt("00000000-0000-4000-8000-000000000152");
    sourceMemory.files.set(original.command.uri, "x".repeat(original.command.sizeBytes));

    let signalRetained: (() => void) | undefined;
    const retained = new Promise<void>((resolvePromise) => { signalRetained = resolvePromise; });
    let resumeRetain: (() => void) | undefined;
    const resume = new Promise<void>((resolvePromise) => { resumeRetain = resolvePromise; });
    const pausedFileStore: ProjectBrainSourceFileStore = {
      ...sourceMemory.store,
      retain: async (input) => {
        const result = await sourceMemory.store.retain(input);
        signalRetained?.();
        await resume;
        return result;
      },
    };

    const stagePromise = withProjectBrainSourceLifecycleLock(async () => {
      const durable = await retainProjectBrainSourceAttempt(original, pausedFileStore);
      try {
        const stored = await enqueueProjectBrainIntent({
          intent: sourceIntent(durable.attempt),
          store: intentMemory.store,
        });
        if (stored.kind !== "SOURCE") throw new Error("expected source intent");
        return stored.attempt;
      } catch (error) {
        if (durable.created) {
          await releaseProjectBrainSourceAttempt(
            durable.attempt,
            { reason: "UNQUEUED_ROLLBACK" },
            pausedFileStore,
          );
        }
        throw error;
      }
    });
    await retained;

    let reconciliationFinished = false;
    const reconcilePromise = withProjectBrainSourceLifecycleLock(async () => {
      const snapshot = await loadProjectBrainIntentSnapshot({
        workspaceId: original.command.workspaceId,
        projectId: original.command.projectId,
        interruptedPublicError: "Interrupted locally",
        store: intentMemory.store,
      });
      const sources = snapshot.allIntents.flatMap((intent) =>
        intent.kind === "SOURCE" ? [intent.attempt] : []);
      return reconcileProjectBrainSourceFiles({
        retainedAttempts: sources,
        requiredAttempts: sources,
      }, sourceMemory.store);
    }).then((result) => {
      reconciliationFinished = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(reconciliationFinished).toBe(false);
    expect([...sourceMemory.files.keys()].some((uri) => uri.includes(original.command.commandId))).toBe(true);

    resumeRetain?.();
    const [stored, plan] = await Promise.all([stagePromise, reconcilePromise]);
    expect(plan.missingUris).toEqual([]);
    expect(sourceMemory.files.has(stored.command.uri)).toBe(true);
    const restored = await loadProjectBrainIntents({
      workspaceId: stored.command.workspaceId,
      projectId: stored.command.projectId,
      interruptedPublicError: "Interrupted locally",
      store: intentMemory.store,
    });
    expect(restored).toEqual([
      expect.objectContaining({
        kind: "SOURCE",
        attempt: expect.objectContaining({ command: stored.command }),
      }),
    ]);

    const session = futureSource("src/state/mobile-session.tsx");
    expect(session).toMatch(
      /withProjectBrainSourceLifecycleLock\(async \(\) => \{[\s\S]*?retainProjectBrainSourceAttempt[\s\S]*?enqueueProjectBrainIntent[\s\S]*?UNQUEUED_ROLLBACK/u,
    );
    expect(session).toMatch(
      /withProjectBrainSourceLifecycleLock\(async \(\) => \{[\s\S]*?loadProjectBrainIntentSnapshot[\s\S]*?releaseProjectBrainSourceAttempt[\s\S]*?reconcileProjectBrainSourceFiles/u,
    );
  });

  it("opening project A preserves pending source files from B and scopes missing-file refusal to the open project", async () => {
    const intentMemory = memoryStore();
    const sourceMemory = memorySourceFileStore();
    const sourceA = sourceAttempt("00000000-0000-4000-8000-000000000153");
    const sourceB = createProjectBrainSourceAttempt({
      ...sourceA.command,
      commandId: "00000000-0000-4000-8000-000000000154",
      projectId: "project-2",
      uri: "file:///synthetic/project-b.pdf",
    });
    sourceMemory.files.set(sourceA.command.uri, "a".repeat(sourceA.command.sizeBytes));
    sourceMemory.files.set(sourceB.command.uri, "b".repeat(sourceB.command.sizeBytes));
    const retainedA = await retainProjectBrainSourceAttempt(sourceA, sourceMemory.store);
    const retainedB = await retainProjectBrainSourceAttempt(sourceB, sourceMemory.store);
    await enqueueProjectBrainIntent({ intent: sourceIntent(retainedA.attempt), store: intentMemory.store });
    await enqueueProjectBrainIntent({ intent: sourceIntent(retainedB.attempt), store: intentMemory.store });

    const openA = await loadProjectBrainIntentSnapshot({
      workspaceId: "workspace-1",
      projectId: "project-1",
      interruptedPublicError: "Interrupted locally",
      store: intentMemory.store,
    });
    const globalSources = openA.allIntents.flatMap((intent) => intent.kind === "SOURCE" ? [intent.attempt] : []);
    const projectASources = openA.contextIntents.flatMap((intent) => intent.kind === "SOURCE" ? [intent.attempt] : []);
    expect(projectASources.map((attempt) => attempt.command.projectId)).toEqual(["project-1"]);
    expect(globalSources.map((attempt) => attempt.command.projectId)).toEqual(["project-1", "project-2"]);
    await expect(reconcileProjectBrainSourceFiles({
      retainedAttempts: globalSources,
      requiredAttempts: projectASources,
    }, sourceMemory.store)).resolves.toMatchObject({ missingUris: [] });
    expect(sourceMemory.files.has(retainedA.attempt.command.uri)).toBe(true);
    expect(sourceMemory.files.has(retainedB.attempt.command.uri)).toBe(true);

    sourceMemory.files.delete(retainedB.attempt.command.uri);
    await expect(reconcileProjectBrainSourceFiles({
      retainedAttempts: globalSources,
      requiredAttempts: projectASources,
    }, sourceMemory.store)).resolves.toMatchObject({ missingUris: [] });

    const openB = await loadProjectBrainIntentSnapshot({
      workspaceId: "workspace-1",
      projectId: "project-2",
      interruptedPublicError: "Interrupted locally",
      store: intentMemory.store,
    });
    const projectBSources = openB.contextIntents.flatMap((intent) => intent.kind === "SOURCE" ? [intent.attempt] : []);
    await expect(reconcileProjectBrainSourceFiles({
      retainedAttempts: globalSources,
      requiredAttempts: projectBSources,
    }, sourceMemory.store)).rejects.toThrow("MOBILE_PROJECT_BRAIN_SOURCE_DURABLE_FILE_MISSING");
  });

  it("chunks a maximum-size owner brief in the encrypted store and restores it exactly", async () => {
    const { store, values } = memoryStore();
    const command = largeBriefCommand("00000000-0000-4000-8000-000000000184");
    await enqueueProjectBrainIntent({
      intent: commandIntent(createProjectBrainCommandAttempt(command)),
      store,
    });
    expect(Math.max(...[...values.values()].map((value) => value.length))).toBeLessThanOrEqual(1_800);
    const restored = await loadProjectBrainIntents({
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      interruptedPublicError: "Interrupted locally",
      store,
    });
    expect(restored[0]?.attempt.command).toEqual(command);
  });

  it("purges a validated canonical receipt on remount and refuses command-id body drift", async () => {
    const { store } = memoryStore();
    const command = createCommand("00000000-0000-4000-8000-000000000185");
    await enqueueProjectBrainIntent({ intent: commandIntent(createProjectBrainCommandAttempt(command)), store });
    await expect(enqueueProjectBrainIntent({
      intent: commandIntent(createProjectBrainCommandAttempt({ ...command, projectId: "project-2" })),
      store,
    })).rejects.toThrow("MOBILE_PROJECT_BRAIN_INTENT_IDEMPOTENCY_CONFLICT");
    await transitionProjectBrainIntent({ commandId: command.commandId, state: "SENDING", store });
    await transitionProjectBrainIntent({
      commandId: command.commandId,
      state: "CONFIRMED",
      result: {
        schemaVersion: 1,
        commandId: command.commandId,
        action: command.action,
        intakeId: "intake-1",
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        stateVersion: 1,
        status: "DRAFT",
        reviewFingerprint: null,
        canonicalEffectId: "decision-1",
        replayed: false,
        providerExecutionPerformed: false,
        externalTransportPerformed: false,
      },
      store,
    });
    await expect(loadProjectBrainIntents({
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      interruptedPublicError: "Interrupted locally",
      store,
    })).resolves.toEqual([]);
  });

  it("drives visible retry, refusal and conflict controls from behavioral presentation state", () => {
    expect(projectBrainIntentPresentation({ state: "OUTCOME_UNKNOWN", publicError: "Résultat inconnu" })).toEqual({
      publicError: "Résultat inconnu",
      retryable: true,
      dismissible: false,
      consequentialMutationBlocked: true,
    });
    expect(projectBrainIntentPresentation({ state: "CONFLICT", publicError: "Version changée" })).toEqual({
      publicError: "Version changée",
      retryable: false,
      dismissible: true,
      consequentialMutationBlocked: false,
    });
    const surface = futureSource("src/app/(app)/project-brain-intake.tsx");
    expect(surface).toContain("presentation.publicError");
    expect(surface).toContain("presentation.retryable");
    expect(surface).toContain("presentation.dismissible");
    expect(surface).toContain("copy.newVersion");
  });

  it("offers a new version only after a terminal confirmed or rejected intake", () => {
    expect(projectBrainCanCreateNewVersion("CONFIRMED")).toBe(true);
    expect(projectBrainCanCreateNewVersion("REJECTED")).toBe(true);
    expect(projectBrainCanCreateNewVersion("DRAFT")).toBe(false);
    expect(projectBrainCanCreateNewVersion("READY_FOR_REVIEW")).toBe(false);
    expect(projectBrainCanCreateNewVersion(null)).toBe(false);
  });

  it("uses sibling project actions instead of nesting one Pressable inside another", () => {
    const projects = futureSource("src/app/(app)/projects.tsx");
    expect(projects).toContain("<Card key={project.id}");
    expect(projects).not.toMatch(/<Pressable[^>]*key=\{project\.id\}[\s\S]*?<Pressable/u);
    expect(projects).toContain("copy.projectsScreen.brain");
  });
});

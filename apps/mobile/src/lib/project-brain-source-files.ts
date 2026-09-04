import {
  createProjectBrainSourceAttempt,
  type ProjectBrainSourceAttempt,
} from "@/lib/project-brain-intake";

const DURABLE_SOURCE_DIRECTORY = "endvera-project-brain-sources-v1";
let projectBrainSourceLifecycleTail: Promise<void> = Promise.resolve();

export function withProjectBrainSourceLifecycleLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = projectBrainSourceLifecycleTail.then(operation, operation);
  projectBrainSourceLifecycleTail = result.then(() => undefined, () => undefined);
  return result;
}

export type ProjectBrainSourceFileRetention = Readonly<{
  uri: string;
  created: boolean;
}>;

export type ProjectBrainSourceFileStore = {
  retain: (input: {
    commandId: string;
    fileName: string;
    sourceUri: string;
    expectedSizeBytes: number;
  }) => Promise<ProjectBrainSourceFileRetention>;
  release: (input: { commandId: string; uri: string }) => Promise<void>;
  inventory: () => Promise<readonly { name: string; uri: string }[]>;
  removeOrphan: (uri: string) => Promise<void>;
};

function safeExtension(fileName: string) {
  return fileName.match(/\.[a-z0-9]{1,10}$/iu)?.[0]?.toLowerCase() ?? "";
}

async function defaultStore(): Promise<ProjectBrainSourceFileStore> {
  const { Directory, File, Paths } = await import("expo-file-system");
  const directory = new Directory(Paths.document, DURABLE_SOURCE_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  return {
    retain: async ({ commandId, fileName, sourceUri, expectedSizeBytes }) => {
      const destination = new File(directory, `${commandId}${safeExtension(fileName)}`);
      if (destination.exists) {
        if (destination.size !== expectedSizeBytes) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_SIZE_MISMATCH");
        return { uri: destination.uri, created: false };
      }
      const source = new File(sourceUri);
      if (!source.exists) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_CACHE_MISSING");
      const temporary = new File(directory, `${commandId}.staging`);
      if (temporary.exists) temporary.delete();
      try {
        await source.copy(temporary, { overwrite: true });
        if (!temporary.exists) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_RETAIN_FAILED");
        if (temporary.size !== expectedSizeBytes) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_SIZE_MISMATCH");
        await temporary.move(destination, { overwrite: false });
      } catch (error) {
        if (temporary.exists) temporary.delete();
        throw error;
      }
      return { uri: destination.uri, created: true };
    },
    release: async ({ commandId, uri }) => {
      const expectedPrefix = `${directory.uri.replace(/\/$/u, "")}/`;
      if (!uri.startsWith(expectedPrefix)) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_RELEASE_REFUSED");
      const file = new File(uri);
      if (file.name !== `${commandId}${safeExtension(file.name)}`) {
        throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_RELEASE_REFUSED");
      }
      if (file.exists) file.delete();
    },
    inventory: async () => directory.list().flatMap((entry) => entry instanceof File
      ? [{ name: entry.name, uri: entry.uri }]
      : []),
    removeOrphan: async (uri) => {
      const expectedPrefix = `${directory.uri.replace(/\/$/u, "")}/`;
      if (!uri.startsWith(expectedPrefix)) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_ORPHAN_RELEASE_REFUSED");
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}

export function projectBrainSourceReconciliationPlan(
  inventory: readonly { name: string; uri: string }[],
  retainedUris: readonly string[],
  requiredUris: readonly string[],
) {
  const retained = new Set(retainedUris);
  const available = new Set(inventory.map((entry) => entry.uri));
  return Object.freeze({
    deleteUris: inventory
      .filter((entry) => entry.name.endsWith(".staging") || !retained.has(entry.uri))
      .map((entry) => entry.uri),
    missingUris: requiredUris.filter((uri) => !available.has(uri)),
  });
}

export async function reconcileProjectBrainSourceFiles(
  input: {
    retainedAttempts: readonly ProjectBrainSourceAttempt[];
    requiredAttempts: readonly ProjectBrainSourceAttempt[];
  },
  inputStore?: ProjectBrainSourceFileStore,
) {
  const store = inputStore ?? await defaultStore();
  const plan = projectBrainSourceReconciliationPlan(
    await store.inventory(),
    input.retainedAttempts.map((attempt) => attempt.command.uri),
    input.requiredAttempts.map((attempt) => attempt.command.uri),
  );
  for (const uri of plan.deleteUris) await store.removeOrphan(uri);
  if (plan.missingUris.length) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_DURABLE_FILE_MISSING");
  return plan;
}

export async function retainProjectBrainSourceAttempt(
  value: ProjectBrainSourceAttempt,
  inputStore?: ProjectBrainSourceFileStore,
) {
  if (value.state !== "READY") throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_RETAIN_REFUSED");
  const store = inputStore ?? await defaultStore();
  const retention = await store.retain({
    commandId: value.command.commandId,
    fileName: value.command.fileName,
    sourceUri: value.command.uri,
    expectedSizeBytes: value.command.sizeBytes,
  });
  return Object.freeze({
    attempt: createProjectBrainSourceAttempt({ ...value.command, uri: retention.uri }),
    created: retention.created,
  });
}

export async function releaseProjectBrainSourceAttempt(
  value: ProjectBrainSourceAttempt,
  release: {
    reason: "UNQUEUED_ROLLBACK" | "CANONICAL_RECEIPT" | "TERMINAL_DISMISS";
  },
  inputStore?: ProjectBrainSourceFileStore,
) {
  const allowed = release.reason === "UNQUEUED_ROLLBACK"
    ? value.state === "READY"
    : release.reason === "CANONICAL_RECEIPT"
      ? (value.state === "CONFIRMED" || value.state === "REPLAYED") && value.result !== null
      : value.state === "CONFLICT" || value.state === "REFUSED";
  if (!allowed) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_RELEASE_STATE_REFUSED");
  const store = inputStore ?? await defaultStore();
  await store.release({ commandId: value.command.commandId, uri: value.command.uri });
}

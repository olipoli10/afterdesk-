import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { relative, resolve, sep } from "node:path";

import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import type { DryRunTrialPlan, DryRunTrialSlot } from "@/lib/engineering-factory/measured-trial-v2";

const execFileAsync = promisify(execFile);
const COMMIT = /^[0-9a-f]{40}$/i;
const CASE_ID = /^EF-\d{3}$/;

/**
 * These are evaluator-owned challenge documents at the frozen historical
 * commits. The runner hashes their content but deliberately never emits it.
 */
export const DEV_BENCH_V1_FROZEN_CHALLENGE_PATHS: Readonly<Record<string, string>> = {
  "EF-001": "docs/engineering-factory/EF-001-DETERMINISTIC-ACCESS-GATE.md",
  "EF-002": "docs/engineering-factory/EF-002-FROZEN-CHALLENGE.md",
  "EF-003": "docs/engineering-factory/challenges/EF-003-NAT64-SSRF.md",
  "EF-004": "docs/engineering-factory/EF-004-FROZEN-CHALLENGE.md",
  "EF-005": "docs/engineering-factory/EF-005-FROZEN-CHALLENGE.md",
  "EF-006": "docs/engineering-factory/EF-006-FROZEN-CHALLENGE.md",
  "EF-007": "docs/engineering-factory/EF-007-FROZEN-CHALLENGE.md",
  "EF-008": "docs/engineering-factory/EF-008-FROZEN-CHALLENGE.md",
} as const;

export const DRY_RUN_EXECUTOR_SCRATCH_DIRECTORY = ".scratch/engineering-factory/executor-rehearsal";

export class DryRunExecutorRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DryRunExecutorRefusal";
  }
}

export type DryRunWorktreeInspection = {
  head: string;
  trackedChanges: string;
  challenge: string;
};

/**
 * This port intentionally has no candidate-command method. A rehearsal only
 * proves checkout and packet authority; a candidate run needs a separate,
 * explicitly approved egress design.
 */
export type DryRunGitWorktreePort = {
  addDetached(input: { repositoryDirectory: string; worktreeDirectory: string; commit: string }): Promise<void>;
  inspect(input: { worktreeDirectory: string; challengePath: string; expectedCommit: string }): Promise<DryRunWorktreeInspection>;
  removeClean(input: { repositoryDirectory: string; worktreeDirectory: string; expectedCommit: string }): Promise<void>;
};

export type DryRunExecutorPacket = {
  schemaVersion: 1;
  caseId: string;
  startingCommit: string;
  candidate: {
    participant: DryRunTrialSlot["participant"];
    label: string;
  };
  packetFingerprint: string;
  challengePath: string;
  challengeSha256: string;
};

export type DryRunExecutorRehearsal = DryRunExecutorPacket & {
  pass: DryRunTrialSlot["pass"];
  position: number;
  worktreeHead: string;
  cleanup: "removed";
};

function isInside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !relation.includes(`:${sep}`));
}

function assertDirectory(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DryRunExecutorRefusal(`${label} is required`);
  return resolve(value);
}

function assertEmptyDirectory(target: string): Promise<void> {
  return access(target)
    .then(() => Promise.reject(new DryRunExecutorRefusal("executor worktree directory already exists")))
    .catch((error: unknown) => {
      if (error instanceof DryRunExecutorRefusal) throw error;
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
      throw error;
    });
}

function assertChallengePaths(catalog: DevBenchCatalog, challengePaths: Readonly<Record<string, string>>): void {
  const expected = catalog.cases.map((benchCase) => benchCase.id).sort();
  const observed = Object.keys(challengePaths).sort();
  if (expected.length !== observed.length || expected.some((caseId, index) => caseId !== observed[index])) {
    throw new DryRunExecutorRefusal("challenge paths must contain exactly one path per catalog case");
  }
  for (const [caseId, path] of Object.entries(challengePaths)) {
    if (!CASE_ID.test(caseId) || typeof path !== "string" || !path.trim()) {
      throw new DryRunExecutorRefusal("challenge path is malformed");
    }
    const normalized = path.replaceAll("\\", "/");
    if (normalized.startsWith("/") || normalized.includes("../") || normalized === "..") {
      throw new DryRunExecutorRefusal("challenge path must stay inside the frozen checkout");
    }
  }
}

function assertSlot(plan: DryRunTrialPlan, slot: DryRunTrialSlot, catalog: DevBenchCatalog): void {
  const expectedSeed = plan.caseSeeds[slot.caseId];
  const expectedPacket = plan.casePacketFingerprints[slot.caseId];
  const planned = plan.schedule.find(
    (candidate) =>
      candidate.pass === slot.pass &&
      candidate.position === slot.position &&
      candidate.participant === slot.participant &&
      candidate.caseId === slot.caseId &&
      candidate.startingCommit === slot.startingCommit &&
      candidate.packetFingerprint === slot.packetFingerprint
  );
  if (!planned || !catalog.cases.some((benchCase) => benchCase.id === slot.caseId)) {
    throw new DryRunExecutorRefusal("slot is not present in the frozen dry-run plan");
  }
  if (expectedSeed !== slot.startingCommit || !COMMIT.test(slot.startingCommit)) {
    throw new DryRunExecutorRefusal("slot startingCommit differs from the frozen case seed");
  }
  if (expectedPacket !== slot.packetFingerprint) {
    throw new DryRunExecutorRefusal("slot packet fingerprint differs from the frozen case packet");
  }
}

function slotDirectory(scratchDirectory: string, slot: DryRunTrialSlot): string {
  const name = `slot-${slot.pass}-${slot.position}-${slot.caseId}-${slot.participant.toLowerCase()}`;
  const directory = resolve(scratchDirectory, name);
  if (!isInside(scratchDirectory, directory)) throw new DryRunExecutorRefusal("executor worktree path escapes its scratch directory");
  return directory;
}

function sanitizePacket({ slot, challengePath, challenge }: { slot: DryRunTrialSlot; challengePath: string; challenge: string }): DryRunExecutorPacket {
  if (!challenge.trim()) throw new DryRunExecutorRefusal("frozen challenge document is empty");
  return {
    schemaVersion: 1,
    caseId: slot.caseId,
    startingCommit: slot.startingCommit,
    candidate: { participant: slot.participant, label: slot.candidateLabel },
    packetFingerprint: slot.packetFingerprint,
    challengePath,
    challengeSha256: createHash("sha256").update(challenge, "utf8").digest("hex"),
  };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { windowsHide: true });
  return stdout.trim();
}

/** The production port invokes only local Git and filesystem operations. */
export function createLocalDryRunGitWorktreePort(): DryRunGitWorktreePort {
  return {
    async addDetached({ repositoryDirectory, worktreeDirectory, commit }) {
      await git(repositoryDirectory, ["worktree", "add", "--detach", worktreeDirectory, commit]);
    },
    async inspect({ worktreeDirectory, challengePath }) {
      const checkout = resolve(worktreeDirectory);
      const file = resolve(checkout, challengePath);
      if (!isInside(checkout, file)) throw new DryRunExecutorRefusal("challenge path must stay inside the frozen checkout");
      const [head, trackedChanges, challenge] = await Promise.all([
        git(checkout, ["rev-parse", "HEAD"]),
        git(checkout, ["status", "--porcelain=v1", "--untracked-files=all"]),
        readFile(file, "utf8"),
      ]);
      return { head, trackedChanges, challenge };
    },
    async removeClean({ repositoryDirectory, worktreeDirectory, expectedCommit }) {
      const head = await git(worktreeDirectory, ["rev-parse", "HEAD"]);
      const trackedChanges = await git(worktreeDirectory, ["status", "--porcelain=v1", "--untracked-files=all"]);
      if (head !== expectedCommit) throw new DryRunExecutorRefusal("cleanup refused because worktree HEAD changed");
      if (trackedChanges) throw new DryRunExecutorRefusal("cleanup refused because worktree is no longer clean");
      await git(repositoryDirectory, ["worktree", "remove", worktreeDirectory]);
    },
  };
}

/**
 * Performs a local, detached-worktree rehearsal for the frozen V2 schedule.
 * It never invokes a candidate, provider, shell launcher, database, or network.
 */
export async function rehearseDryRunExecutor({
  plan,
  catalog,
  repositoryDirectory,
  scratchDirectory = DRY_RUN_EXECUTOR_SCRATCH_DIRECTORY,
  challengePaths = DEV_BENCH_V1_FROZEN_CHALLENGE_PATHS,
  worktreePort = createLocalDryRunGitWorktreePort(),
  maxSlots = plan.schedule.length,
}: {
  plan: DryRunTrialPlan;
  catalog: DevBenchCatalog;
  repositoryDirectory: string;
  scratchDirectory?: string;
  challengePaths?: Readonly<Record<string, string>>;
  worktreePort?: DryRunGitWorktreePort;
  maxSlots?: number;
}): Promise<DryRunExecutorRehearsal[]> {
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > plan.schedule.length) {
    throw new DryRunExecutorRefusal("maxSlots must select one or more planned slots");
  }
  const repository = assertDirectory(repositoryDirectory, "repositoryDirectory");
  const scratch = assertDirectory(scratchDirectory, "scratchDirectory");
  if (!isInside(repository, scratch)) throw new DryRunExecutorRefusal("scratchDirectory must stay inside the designated worktree");
  assertChallengePaths(catalog, challengePaths);
  await mkdir(scratch, { recursive: true });

  const rehearsals: DryRunExecutorRehearsal[] = [];
  for (const slot of plan.schedule.slice(0, maxSlots)) {
    assertSlot(plan, slot, catalog);
    const challengePath = challengePaths[slot.caseId];
    if (!challengePath) throw new DryRunExecutorRefusal("frozen challenge path is missing for slot");
    const worktreeDirectory = slotDirectory(scratch, slot);
    await assertEmptyDirectory(worktreeDirectory);

    let cleanAtInspection = false;
    await worktreePort.addDetached({ repositoryDirectory: repository, worktreeDirectory, commit: slot.startingCommit });
    try {
      const inspection = await worktreePort.inspect({ worktreeDirectory, challengePath, expectedCommit: slot.startingCommit });
      if (inspection.head !== slot.startingCommit) {
        throw new DryRunExecutorRefusal("worktree HEAD differs from the frozen slot seed");
      }
      if (inspection.trackedChanges) throw new DryRunExecutorRefusal("fresh worktree has tracked changes");
      cleanAtInspection = true;
      const packet = sanitizePacket({ slot, challengePath, challenge: inspection.challenge });
      await worktreePort.removeClean({ repositoryDirectory: repository, worktreeDirectory, expectedCommit: slot.startingCommit });
      rehearsals.push({ ...packet, pass: slot.pass, position: slot.position, worktreeHead: inspection.head, cleanup: "removed" });
    } catch (error) {
      if (cleanAtInspection) {
        try {
          await worktreePort.removeClean({ repositoryDirectory: repository, worktreeDirectory, expectedCommit: slot.startingCommit });
        } catch (cleanupError) {
          throw new DryRunExecutorRefusal(
            `executor rehearsal failed and clean cleanup was refused: ${cleanupError instanceof Error ? cleanupError.message : "unknown error"}`
          );
        }
      }
      throw error;
    }
  }
  return rehearsals;
}

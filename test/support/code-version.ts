import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WHICH BUILD OF AFTERDESK MADE THIS CALL.
 *
 * The capability-contract hash answers "what were the planner's rules". This
 * answers the wider question that only shows up months later: "what version of
 * the whole engine produced this". A fixture recorded today will be replayed
 * against code that has moved, and the difference between a strong proof and a
 * comforting one is being able to say exactly how far it moved.
 *
 * ── READ FROM .git, NOT FROM A SUBPROCESS ──
 *
 * Spawning `git rev-parse` per recording is a process per paid call, and it
 * fails differently on every machine. The two files it would read are right
 * there and their format is stable: `.git/HEAD` is either a raw sha or
 * `ref: refs/heads/<branch>`, and the ref resolves through `.git/refs/...` or,
 * once packed, through `.git/packed-refs`.
 *
 * ── WHAT THIS DOES NOT CLAIM ──
 *
 * It does NOT prove the working tree was clean. A commit id plus uncommitted
 * edits is the ordinary state of a machine mid-session, and pretending
 * otherwise would put a false provenance in an artifact whose whole purpose is
 * provenance. `dirtyUnknown: true` says so out loud rather than leaving a
 * reader to assume.
 */

export type CodeVersion = {
  /** The commit HEAD pointed at, or null when this is not a git checkout. */
  gitSha: string | null;
  /** `refs/heads/<branch>`, or null when HEAD is detached or unreadable. */
  gitRef: string | null;
  /**
   * Always true. Whether the tree had uncommitted changes is not knowable
   * from these files, and this field exists so nobody later reads a bare sha
   * as a promise that it was clean.
   */
  dirtyUnknown: true;
};

let cached: CodeVersion | null = null;

/** Resolved once per process: the answer cannot change mid-run. */
export function codeVersion(root: string = process.cwd()): CodeVersion {
  if (cached !== null) return cached;
  cached = resolve(root);
  return cached;
}

/** Test seam. Never called by the recording path. */
export function resetCodeVersionCache(): void {
  cached = null;
}

export function resolve(root: string): CodeVersion {
  const gitDir = join(root, ".git");
  const unknown: CodeVersion = { gitSha: null, gitRef: null, dirtyUnknown: true };
  if (!existsSync(gitDir)) return unknown;

  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();

    // Detached HEAD: the file IS the sha.
    if (/^[0-9a-f]{40}$/i.test(head)) {
      return { gitSha: head.toLowerCase(), gitRef: null, dirtyUnknown: true };
    }

    const match = /^ref:\s*(.+)$/.exec(head);
    if (match === null) return unknown;
    const ref = match[1].trim();

    const loose = join(gitDir, ...ref.split("/"));
    if (existsSync(loose)) {
      const sha = readFileSync(loose, "utf8").trim();
      return { gitSha: /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null, gitRef: ref, dirtyUnknown: true };
    }

    // Packed: `<sha> <ref>` per line, with `#` comments and `^` peel lines.
    const packedPath = join(gitDir, "packed-refs");
    if (existsSync(packedPath)) {
      for (const line of readFileSync(packedPath, "utf8").split("\n")) {
        if (line.startsWith("#") || line.startsWith("^")) continue;
        const [sha, name] = line.trim().split(/\s+/);
        if (name === ref && /^[0-9a-f]{40}$/i.test(sha)) {
          return { gitSha: sha.toLowerCase(), gitRef: ref, dirtyUnknown: true };
        }
      }
    }
    return { gitSha: null, gitRef: ref, dirtyUnknown: true };
  } catch {
    /**
     * A version we cannot read is recorded as unknown, never as a guess, and
     * never as a throw: failing a paid call because a ref file was mid-write
     * would turn a provenance nicety into money lost.
     */
    return unknown;
  }
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE MACHINE'S OUTPUT REACHES ONE SPECIALIST, AFTER THEY CLAIM, AND NOBODY
 * ELSE.
 *
 * The required flow, stated once so a reader does not have to reconstruct it
 * from three files:
 *
 *   client inputs -> local deterministic processing -> machine artifact
 *     -> claimed by ONE specialist -> human package becomes readable
 *     -> human residual -> ADMIN quality control
 *
 * And explicitly NOT:
 *
 *   machine artifact -> visible to the whole worker pool
 *
 * ── WHY THIS FILE IS A PIN AND NOT A FEATURE ──
 *
 * The gate already exists and is already correct: the download route requires
 * `file.task.claimedById === user.id` BEFORE it ever looks at what kind of
 * file is being asked for, so artifact visibility is a second filter applied
 * to a caller who has already proven they hold the claim. Writing new code
 * here would have been writing a second gate beside a working one.
 *
 * What 1E-alpha changes is the population passing through it. Two new things
 * exist that did not before: client files that a MACHINE has read, and
 * workbooks the machine wrote. Both inherit the gate by construction, and
 * "by construction" is exactly the kind of claim that quietly stops being
 * true. So it is asserted against the source, at the two places where an
 * artifact's audience is decided.
 */

const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("machine output is never visible to the pool before a claim", () => {
  const route = read("src/app/api/files/[id]/download/route.ts");

  it("is not vacuous: the download route is the single file-serving path", () => {
    expect(route).toContain("kind === \"artifact\"");
    expect(route).toContain("artifactVisibility");
  });

  it("a worker must hold the claim before any artifact branch is reached", () => {
    /**
     * The load-bearing line. `claimedById === user.id` is an identity check,
     * not a role check: being an approved specialist browsing the pool is not
     * enough, and cannot become enough by adding an artifact visibility.
     */
    expect(route).toMatch(/file\.task\.claimedById === user\.id/);
    // And it gates the whole VA branch, so no artifact rule sits outside it.
    const vaBranch = route.slice(route.indexOf('user.role === "VA"'));
    const claimCheck = vaBranch.indexOf("claimedById === user.id");
    const artifactCheck = vaBranch.indexOf('kind === "artifact"');
    expect(claimCheck).toBeGreaterThanOrEqual(0);
    expect(artifactCheck).toBeGreaterThan(claimCheck);
  });

  it("an artifact with no declared audience is refused, never guessed at", () => {
    // The enum has three values and only two of them are readable by a worker.
    // A null visibility must fall through to the 404, not default to visible.
    expect(route).toContain('file.artifactVisibility === "worker_after_claim"');
    expect(route).toContain('file.artifactVisibility === "deliverable_candidate"');
    expect(route).not.toMatch(/artifactVisibility\s*!==\s*"admin_only"/);
  });

  it("the client can never read an artifact, whatever its visibility", () => {
    // A machine's working file is not a client's to read; it reaches them only
    // by becoming a deliverable a worker submitted and an operator approved.
    const clientBranch = route.slice(
      route.indexOf('user.role === "CLIENT"'),
      route.indexOf('user.role === "VA"')
    );
    expect(clientBranch).not.toContain("artifactVisibility");
  });

  it("the worker's package query applies the same two-value filter", () => {
    const execution = read("src/lib/queries/execution.ts");
    expect(execution).toContain(
      'artifactVisibility: { in: ["worker_after_claim", "deliverable_candidate"] }'
    );
  });
});

describe("the 1E-alpha builders inherit that gate rather than working around it", () => {
  const files = read("src/lib/ai-work-engine/primitives/files.ts");

  it("every artifact this phase writes declares deliverable_candidate", () => {
    const visibilities = [...files.matchAll(/visibility:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(visibilities.length).toBeGreaterThan(0);
    for (const v of visibilities) expect(v).toBe("deliverable_candidate");
  });

  it("no capability writes a client's input file back out as an artifact", () => {
    /**
     * The one shape that would defeat the whole gate: a primitive that reads a
     * frozen input and writes those same bytes into an artifact would hand the
     * client's raw file to whoever can read artifacts. The builders serialise
     * ROWS, and the only thing they may receive from `read()` is what a codec
     * already turned into a table.
     */
    const writeArtifactCalls = files.split("writeArtifact(").slice(1);
    expect(writeArtifactCalls.length).toBeGreaterThan(0);
    for (const call of writeArtifactCalls) {
      const spec = call.slice(0, call.indexOf("})"));
      expect(spec).not.toContain("read()");
      expect(spec).not.toMatch(/inputFiles/);
    }
  });

  it("the machine never marks its own output as the finished delivery", () => {
    // `deliverable_candidate` is a candidate. It becomes a delivery only when
    // a worker submits it and an operator approves, which is a different
    // module entirely; nothing here may shortcut that.
    expect(files).not.toContain("qcStatus");
    expect(files).not.toContain("submission");
  });
});

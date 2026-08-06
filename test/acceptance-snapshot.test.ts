import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAcceptanceSnapshot } from "@/lib/ai-work-engine/client-scope";

/**
 * The contract record (founder adjustment 3): everything the client saw and
 * accepted, frozen. The builder is pure so every required element can be
 * asserted without a database; the immutability itself is a Postgres trigger,
 * which vitest's node environment cannot execute — so the test pins the
 * MIGRATION SOURCE instead: if someone deletes or renames the trigger, this
 * fails at review time rather than being discovered after a contract was
 * silently edited.
 */

const INPUT = {
  taskId: "task_1",
  acceptedByUserId: "user_client_1",
  task: {
    title: "Build a list of 200 Montreal-area accounting firms",
    description: "Firms with 5 to 50 employees. Name, website, main phone, office address.",
    quantity: "200 firms",
    clientPriceCents: 62_000,
    currency: "USD",
    clientDeadlineUtc: new Date("2026-08-15T12:00:00Z"),
    quotedPlanVersionId: "ver_1",
    category: { disputeCriteria: "Records match the stated sourcing criteria." },
  },
  quotedPlanVersion: {
    deliverableDescription: "An Excel file of 200 qualified firms — verified fields included",
    assumptions: ["Public sources only", "English-language sources"],
    exclusions: ["Phone verification by calling"],
  },
  settings: { revisionWindowHours: 72, maxRevisionRounds: 2, disputeWindowHours: 48 },
};

describe("the acceptance snapshot records everything the founder listed", () => {
  const snapshot = buildAcceptanceSnapshot(INPUT);

  it("price", () => {
    expect(snapshot.clientPriceCents).toBe(62_000);
    expect(snapshot.currency).toBe("USD");
  });
  it("deadline", () => {
    expect(snapshot.clientDeadlineUtc).toEqual(new Date("2026-08-15T12:00:00Z"));
  });
  it("scope (title and full brief)", () => {
    expect(snapshot.title).toBe(INPUT.task.title);
    expect(snapshot.description).toBe(INPUT.task.description);
  });
  it("quantity", () => {
    expect(snapshot.quantity).toBe("200 firms");
  });
  it("deliverable — sanitized exactly as the quote page rendered it", () => {
    // The em-dash the model wrote never reached the client's screen, so it
    // must not reach the contract either: the snapshot records what was
    // RENDERED, not the raw model output.
    expect(snapshot.deliverableDescription).toBe(
      "An Excel file of 200 qualified firms, verified fields included"
    );
  });
  it("assumptions and exclusions", () => {
    expect(snapshot.assumptions).toEqual(["Public sources only", "English-language sources"]);
    expect(snapshot.exclusions).toEqual(["Phone verification by calling"]);
  });
  it("correction policy — the settings in force at that moment, frozen", () => {
    expect(snapshot.revisionWindowHours).toBe(72);
    expect(snapshot.maxRevisionRounds).toBe(2);
    expect(snapshot.disputeWindowHours).toBe(48);
  });
  it("the dispute standard text at that moment", () => {
    expect(snapshot.disputeCriteria).toBe("Records match the stated sourcing criteria.");
  });
  it("the plan version it was all based on", () => {
    expect(snapshot.planVersionId).toBe("ver_1");
  });
  it("who accepted", () => {
    expect(snapshot.acceptedByUserId).toBe("user_client_1");
  });
});

describe("the snapshot does not depend on the engine", () => {
  it("a plan-less task still produces a complete contract", () => {
    const snapshot = buildAcceptanceSnapshot({
      ...INPUT,
      task: { ...INPUT.task, quotedPlanVersionId: null },
      quotedPlanVersion: null,
    });
    expect(snapshot.planVersionId).toBeNull();
    expect(snapshot.deliverableDescription).toBeNull();
    expect(snapshot.assumptions).toEqual([]);
    expect(snapshot.exclusions).toEqual([]);
    // The core contract fields are untouched by the engine's absence.
    expect(snapshot.clientPriceCents).toBe(62_000);
    expect(snapshot.revisionWindowHours).toBe(72);
  });
});

describe("immutability is enforced at the database, not by convention", () => {
  const migration = readFileSync(
    join(__dirname, "..", "prisma", "migrations", "20260806120000_ai_work_engine_phase1a", "migration.sql"),
    "utf8"
  );

  it("the migration installs the UPDATE/DELETE trigger on the snapshot", () => {
    expect(migration).toContain('CREATE TRIGGER "TaskAcceptanceSnapshot_no_update_or_delete"');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "TaskAcceptanceSnapshot"');
    expect(migration).toContain('CREATE TRIGGER "TaskAcceptanceSnapshot_no_truncate"');
  });

  it("the migration carries no destructive statement on existing tables", () => {
    // Additive only: the generated diff's stray DROP INDEX / RenameIndex
    // drift statements were stripped by hand, and must stay out.
    expect(migration).not.toMatch(/DROP TABLE|DROP INDEX|ALTER TABLE .* DROP COLUMN|RENAME TO/);
  });
});

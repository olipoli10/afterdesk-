import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findSimilarPricedTasks } from "@/lib/ai-work-engine/references";
import { createClient } from "./fixtures";

/**
 * NO CLIENT'S WORDS MAY REACH ANOTHER CLIENT'S PROMPT.
 *
 * `findSimilarPricedTasks` is the only query in the engine that reads other
 * clients' tasks, and its result is JSON.stringify'd straight into the
 * planning prompt sent to Anthropic. It used to select `title` and
 * `description`, so client A's brief — their own sentences, possibly naming
 * them — became context for pricing client B.
 *
 * That is invisible from both sides: A never sees it leave, B never sees it
 * arrive. Which is exactly why it needs a test rather than a convention. This
 * one writes a brief full of strings that could only have come from one place
 * and proves none of them survives into the payload built for someone else.
 *
 * REAL POSTGRES, because the boundary is enforced in the SQL projection: a
 * mocked query would test the mock.
 */

/** Strings that cannot plausibly occur by chance in a payload. */
const A_TITLE = "ZZQX-CLIENT-A-TITLE-a7f3 Northwind Confidential merger list";
const A_DESCRIPTION =
  "ZZQX-CLIENT-A-BODY-91k4 Contact Marta Ferreira at Northwind Holdings about the Q3 acquisition targets.";
const A_QUANTITY = "ZZQX-CLIENT-A-QTY-55m2 about 1,800 rows from the Northwind export";

/** The needles, checked one by one so a failure names which field leaked. */
const NEEDLES: [string, string][] = [
  ["title", "ZZQX-CLIENT-A-TITLE-a7f3"],
  ["description", "ZZQX-CLIENT-A-BODY-91k4"],
  ["quantity", "ZZQX-CLIENT-A-QTY-55m2"],
  ["client name in the brief", "Northwind"],
  ["person named in the brief", "Marta Ferreira"],
];

/** A 1024-dim unit vector, the shape TaskEmbedding's column expects. */
function vector(seed: number): number[] {
  const v = new Array(1024).fill(0);
  v[seed] = 1;
  return v;
}

async function seedPricedTaskWithEmbedding(opts: {
  clientId: string;
  title: string;
  description: string;
  quantity: string;
  seed: number;
}) {
  const task = await prisma.task.create({
    data: {
      clientId: opts.clientId,
      title: opts.title,
      description: opts.description,
      quantity: opts.quantity,
      status: "completed" as never,
      clientPriceCents: 12_300,
      vaPayoutCents: 4_500,
      estimatedMinutes: 90,
    },
    select: { id: true },
  });
  const literal = `[${vector(opts.seed).join(",")}]`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TaskEmbedding" ("taskId", "embedding") VALUES ($1, $2::vector)`,
    task.id,
    literal
  );
  return task;
}

describe("cross-client isolation in pricing references", () => {
  it("returns NONE of client A's words when pricing client B's task", async () => {
    const clientA = await createClient();
    const clientB = await createClient();

    await seedPricedTaskWithEmbedding({
      clientId: clientA.id,
      title: A_TITLE,
      description: A_DESCRIPTION,
      quantity: A_QUANTITY,
      seed: 0,
    });
    const taskB = await prisma.task.create({
      data: {
        clientId: clientB.id,
        title: "Client B needs a supplier list cleaned",
        description: "Unrelated brief.",
        status: "submitted" as never,
      },
      select: { id: true },
    });

    // The same vector, so A is unambiguously the nearest neighbour: the test
    // must fail because the FIELDS are gone, never because the match missed.
    const refs = await findSimilarPricedTasks(taskB.id, vector(0), 1);
    expect(refs.length).toBeGreaterThan(0);

    const payload = JSON.stringify(refs);
    for (const [field, needle] of NEEDLES) {
      expect(payload.includes(needle), `${field} leaked into B's prompt payload`).toBe(false);
    }
  });

  it("STILL calibrates: A's measurements cross, A's sentences do not", async () => {
    /**
     * The other half of the invariant. Removing the leak by returning nothing
     * would pass the test above and destroy 1C's whole point — the engine is
     * supposed to learn across mandates. What crosses is measurement.
     */
    const clientA = await createClient();
    const clientB = await createClient();

    const taskA = await seedPricedTaskWithEmbedding({
      clientId: clientA.id,
      title: A_TITLE,
      description: A_DESCRIPTION,
      quantity: A_QUANTITY,
      seed: 3,
    });
    await prisma.taskAiClassification.create({
      data: {
        taskId: taskA.id,
        objective: "o",
        deliverableFormat: "csv",
        requiredFields: [],
        quantityInterpreted: 1_800,
        geography: [],
        verificationLevel: "rigorous" as never,
        sourceRequirements: [],
        sensitiveData: false,
        requiredAccess: [],
        missingInformation: [],
        assumptions: [],
        quoteTier: "assisted" as never,
        confidence: "high" as never,
        model: "test",
      },
    });
    await prisma.taskOperationalActual.create({
      data: {
        taskId: taskA.id,
        workerActiveSeconds: 5_400,
        reviewerActiveSeconds: 600,
        inputFingerprint: "isolation-test",
        computedAt: new Date(),
        computationVersion: 1,
      },
    });

    const taskB = await prisma.task.create({
      data: {
        clientId: clientB.id,
        title: "B",
        description: "B",
        status: "submitted" as never,
      },
      select: { id: true },
    });

    const [ref] = await findSimilarPricedTasks(taskB.id, vector(3), 1);
    expect(ref).toBeTruthy();
    // Measurements: present and usable.
    expect(ref.units).toBe(1_800);
    expect(ref.verification_level).toBe("rigorous");
    expect(ref.estimated_minutes).toBe(90);
    expect(ref.client_price_usd).toBe(123);
    expect(ref.worker_active_minutes).toBe(90);
    expect(ref.reviewer_active_minutes).toBe(10);
    // And no field of the shape carries prose at all.
    expect(Object.keys(ref)).not.toContain("title");
    expect(Object.keys(ref)).not.toContain("description");
  });

  it("an unmeasured precedent arrives as null, never as a fabricated zero", async () => {
    // A mandate priced but never executed has no measurements. Reporting 0
    // minutes would tell the planner it took no time, which is the "no
    // fabricated zero" rule this codebase holds everywhere else.
    const clientA = await createClient();
    const clientB = await createClient();
    await seedPricedTaskWithEmbedding({
      clientId: clientA.id,
      title: "Priced but never run",
      description: "No operational actual exists for this one.",
      quantity: "n/a",
      seed: 7,
    });
    const taskB = await prisma.task.create({
      data: { clientId: clientB.id, title: "B", description: "B", status: "submitted" as never },
      select: { id: true },
    });

    const [ref] = await findSimilarPricedTasks(taskB.id, vector(7), 1);
    expect(ref).toBeTruthy();
    expect(ref.worker_active_minutes).toBeNull();
    expect(ref.reviewer_active_minutes).toBeNull();
    expect(ref.automated_unit_rate_bps).toBeNull();
    expect(ref.units).toBeNull();
  });

  it("the SAME client's own past task is treated identically — the rule is content, not ownership", async () => {
    /**
     * Deliberate: the shape carries no prose for anyone. One could argue a
     * client's own history is theirs to reuse, and that may be true — but it
     * would be a separate, explicit decision. Widening the payload for
     * same-client matches would put free text back in the prompt and leave
     * one query away from crossing the boundary again.
     */
    const client = await createClient();
    await seedPricedTaskWithEmbedding({
      clientId: client.id,
      title: A_TITLE,
      description: A_DESCRIPTION,
      quantity: A_QUANTITY,
      seed: 11,
    });
    const second = await prisma.task.create({
      data: {
        clientId: client.id,
        title: "Same client, second mandate",
        description: "Second brief.",
        status: "submitted" as never,
      },
      select: { id: true },
    });

    const refs = await findSimilarPricedTasks(second.id, vector(11), 1);
    expect(refs.length).toBeGreaterThan(0);
    const payload = JSON.stringify(refs);
    for (const [field, needle] of NEEDLES) {
      expect(payload.includes(needle), `${field} appeared for the same client too`).toBe(false);
    }
  });
});

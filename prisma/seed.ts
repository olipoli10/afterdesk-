/**
 * Idempotent seed:
 *  - admin account — password hashed with Better Auth's own hasher (scrypt via
 *    better-auth/crypto) and stored as a "credential" account row, exactly the
 *    shape Better Auth's email+password login verifies against.
 *  - task categories — required at pricing time (approvePricing rejects a
 *    quote with no categoryId), and now also the worker pool's organizing
 *    spine (src/app/va/pool). The taxonomy is deliberately shaped by WORKER
 *    SKILL, not by the client homepage's marketing tags: a worker picks a lane
 *    ("I do data cleanup", "I do transcription"), so "Data entry &
 *    transcription" and "List building" are separate lanes even though the
 *    homepage ledger lumps both under DATA. Those ledger rows are display
 *    copy; this is the real taxonomy, and they are allowed to differ.
 *
 * Settings are intentionally NOT seeded: defaults live in src/lib/settings.ts
 * and the Setting table only stores overrides.
 */
import { PrismaClient } from "@prisma-client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists (${email}) — skipping.`);
  } else {
    const hash = await hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        name: "Operator",
        role: "ADMIN",
        emailVerified: true,
        accounts: {
          create: {
            providerId: "credential",
            accountId: email,
            password: hash,
          },
        },
      },
    });
    // Better Auth expects accountId to equal the user id for credential accounts.
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.account.updateMany({
      where: { userId: created.id, providerId: "credential" },
      data: { accountId: created.id },
    });
    console.log(`Admin created: ${email}`);
  }

  /**
   * Upsert by slug rather than "skip the whole block if any row exists": the
   * old form meant a database that already had the categories could never
   * receive a NEW one, and could never have a missing disputeCriteria or
   * referenceHourlyRateCents filled in — which is exactly the state the live
   * database was found in.
   *
   * An existing row keeps its name and sortOrder (the operator may have edited
   * them); only a NULL disputeCriteria/referenceHourlyRateCents is backfilled.
   * Nothing is ever overwritten, so this is safe to re-run against a live
   * database — and an operator who later sets a different rate through a
   * future admin UI will never have it silently reset back to this default.
   *
   * referenceHourlyRateCents is the MONEY SAVED counter's market comparison
   * (src/lib/queries/public-stats.ts) — US generalist/freelancer rates for
   * the equivalent skilled admin work, defensible if a prospect asks "how did
   * you get that number": data entry/transcription and list building sit at
   * the low end of that market, research/writing/analysis command a premium
   * for judgment, not just typing speed.
   */
  const CATEGORIES = [
    {
      slug: "data-cleanup",
      name: "Data cleanup",
      sortOrder: 0,
      disputeCriteria:
        "Every row from the source is accounted for — kept, merged, or dropped with a stated reason — and the delivered file matches the requested format and column order. Minor formatting preferences are not grounds for a dispute.",
      referenceHourlyRateCents: 2800,
    },
    {
      slug: "data-entry",
      name: "Data entry & transcription",
      sortOrder: 1,
      disputeCriteria:
        "Keyed or transcribed content matches the source at normal accuracy for the stated language and source quality, and follows the requested template or timestamp scheme. Illegible or inaudible source material must be flagged, never guessed — a guessed value is a dispute ground, a flagged one is not.",
      referenceHourlyRateCents: 2200,
    },
    {
      slug: "list-building",
      name: "List building",
      sortOrder: 2,
      disputeCriteria:
        "Records match the stated sourcing criteria and every requested field is populated or explicitly marked unavailable after a real search. Isolated staleness in public data is normal variance; a pattern of fabricated or unresearched entries is not.",
      referenceHourlyRateCents: 2500,
    },
    {
      slug: "research",
      name: "Research",
      sortOrder: 3,
      disputeCriteria:
        "Every requested field is populated or explicitly marked unavailable after a real search, and figures are traceable to a source where the brief asked for sourcing. Isolated inaccuracies in publicly-sourced data are normal variance; fabricated findings are not.",
      referenceHourlyRateCents: 3500,
    },
    {
      slug: "document-production",
      name: "Document production",
      sortOrder: 4,
      disputeCriteria:
        "The rebuilt or reformatted document preserves all source content exactly, in the requested template, with consistent formatting throughout. Content changes were not requested and are a dispute ground in either direction.",
      referenceHourlyRateCents: 3000,
    },
    {
      slug: "writing",
      name: "Writing",
      sortOrder: 5,
      disputeCriteria:
        "Matches the requested length, tone, and format, and makes no factual claim the brief didn't supply. Style preference alone is not a dispute ground.",
      referenceHourlyRateCents: 4000,
    },
    {
      slug: "analysis",
      name: "Analysis",
      sortOrder: 6,
      disputeCriteria:
        "Figures reconcile to the source data and the stated method was followed. A conclusion the client disagrees with is not a dispute ground; an arithmetic or method error is.",
      referenceHourlyRateCents: 4500,
    },
    {
      slug: "admin-coordination",
      name: "Admin & coordination",
      sortOrder: 7,
      disputeCriteria:
        "Completed per the brief's explicit steps, with the actions taken logged where a log was requested. Anything the brief left ambiguous is noted rather than guessed.",
      referenceHourlyRateCents: 3000,
    },
  ];

  let created = 0;
  let backfilled = 0;
  for (const c of CATEGORIES) {
    const existing = await prisma.taskCategory.findUnique({
      where: { slug: c.slug },
      select: { id: true, disputeCriteria: true, referenceHourlyRateCents: true },
    });
    if (!existing) {
      await prisma.taskCategory.create({ data: c });
      created += 1;
    } else {
      const patch: { disputeCriteria?: string; referenceHourlyRateCents?: number } = {};
      if (existing.disputeCriteria === null) patch.disputeCriteria = c.disputeCriteria;
      if (existing.referenceHourlyRateCents === null)
        patch.referenceHourlyRateCents = c.referenceHourlyRateCents;
      if (Object.keys(patch).length > 0) {
        await prisma.taskCategory.update({ where: { id: existing.id }, data: patch });
        backfilled += 1;
      }
    }
  }
  console.log(
    `Task categories: ${created} created, ${backfilled} backfilled (dispute criteria and/or reference rate), ${
      CATEGORIES.length - created - backfilled
    } already complete.`
  );

  // The product currently uses the Academy's real course exams instead of a
  // separate entry test. Remove rows produced by the old seed so an operator
  // never mistakes scaffolding for an active qualification workflow.
  const removedPlaceholders = await prisma.testQuestion.deleteMany({
    where: { prompt: { startsWith: "[PLACEHOLDER]" } },
  });
  if (removedPlaceholders.count > 0) {
    console.log(`Removed ${removedPlaceholders.count} obsolete placeholder test questions.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

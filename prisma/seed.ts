/**
 * Idempotent seed:
 *  - admin account — password hashed with Better Auth's own hasher (scrypt via
 *    better-auth/crypto) and stored as a "credential" account row, exactly the
 *    shape Better Auth's email+password login verifies against.
 *  - placeholder entry-test questions (v1 — operator supplies real content later)
 *  - task categories — required at pricing time (approvePricing rejects a
 *    quote with no categoryId); slugs match the tags already shown in the
 *    client homepage's example ledger (src/lib/i18n/client.ts ch03.rows), so
 *    the marketing copy and the real taxonomy never drift apart.
 *
 * Settings are intentionally NOT seeded: defaults live in src/lib/settings.ts
 * and the Setting table only stores overrides.
 */
import { PrismaClient } from "@prisma/client";
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

  const categoryCount = await prisma.taskCategory.count();
  if (categoryCount === 0) {
    await prisma.taskCategory.createMany({
      data: [
        {
          slug: "data",
          name: "Data",
          sortOrder: 1,
          disputeCriteria:
            "Delivered file matches the requested format and every row from the source is accounted for (kept, merged, or explicitly dropped with a reason). Minor formatting preference differences are not grounds for a dispute.",
        },
        {
          slug: "research",
          name: "Research",
          sortOrder: 2,
          disputeCriteria:
            "Every requested field is populated or explicitly marked unavailable after a real search. Isolated inaccuracies in publicly-sourced data (a changed phone number, a stale listing) are normal variance, not a dispute ground — a pattern of unresearched or fabricated entries is.",
        },
        {
          slug: "writing",
          name: "Writing",
          sortOrder: 3,
          disputeCriteria:
            "Matches the requested length, tone, and format; free of factual claims the brief didn't supply. Style preference alone is not a dispute ground.",
        },
        {
          slug: "media",
          name: "Media",
          sortOrder: 4,
          disputeCriteria:
            "Transcription/tagging matches the source audio or video at normal accuracy for the stated language and audio quality; timestamps or tags follow the requested scheme.",
        },
        {
          slug: "docs",
          name: "Docs",
          sortOrder: 5,
          disputeCriteria:
            "Rebuilt or reformatted document preserves all source content in the requested template, with consistent formatting throughout.",
        },
        {
          slug: "admin",
          name: "Admin",
          sortOrder: 6,
          disputeCriteria:
            "Task is completed per the brief's explicit steps; anything left ambiguous in the brief is noted rather than guessed.",
        },
        {
          slug: "design",
          name: "Design",
          sortOrder: 7,
          disputeCriteria:
            "Delivered asset matches the requested dimensions, format, and brief; brand assets (logo, colors) used as supplied, not altered.",
        },
        {
          slug: "other",
          name: "Other",
          sortOrder: 8,
          disputeCriteria:
            "Completed per the brief's explicit scope. Used when a task genuinely does not fit the other categories.",
        },
      ],
    });
    console.log("Task categories created (8).");
  } else {
    console.log("Task categories already present — skipping.");
  }

  const questionCount = await prisma.testQuestion.count();
  if (questionCount === 0) {
    await prisma.testQuestion.createMany({
      data: [
        {
          version: 1,
          order: 1,
          prompt:
            "[PLACEHOLDER] Sample exercise 1 — e.g. clean and deduplicate the provided list of 20 contact rows and return the corrected list.",
        },
        {
          version: 1,
          order: 2,
          prompt:
            "[PLACEHOLDER] Sample exercise 2 — e.g. research the company websites for 5 given business names and record the correct URL for each.",
        },
        {
          version: 1,
          order: 3,
          prompt:
            "[PLACEHOLDER] Sample exercise 3 — e.g. transcribe the fields from the attached sample invoice into the requested column format.",
        },
      ],
    });
    console.log("Placeholder test questions created (v1).");
  } else {
    console.log("Test questions already present — skipping.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

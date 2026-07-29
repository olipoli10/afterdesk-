/**
 * Idempotent seed:
 *  - admin account — password hashed with Better Auth's own hasher (scrypt via
 *    better-auth/crypto) and stored as a "credential" account row, exactly the
 *    shape Better Auth's email+password login verifies against.
 *  - placeholder entry-test questions (v1 — operator supplies real content later)
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

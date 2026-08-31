import { PrismaClient } from "../../../.prisma-client";
import { hashPassword } from "better-auth/crypto";

export const SYNTHETIC_EMAIL = "olivier.r2@example.invalid";
export const SYNTHETIC_PASSWORD = "Endvera-R2-Local-Only-2026!";

async function main() {
  if (!process.env.DATABASE_URL?.includes("localhost:51282/template1")) {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: SYNTHETIC_EMAIL } });
    const user = existing ?? await prisma.user.create({
      data: {
        email: SYNTHETIC_EMAIL,
        name: "Olivier — test local synthétique",
        role: "CLIENT",
        emailVerified: true,
      },
    });

    if (!existing) {
      const password = await hashPassword(SYNTHETIC_PASSWORD);
      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password,
        },
      });
    }

    const workspaceCount = await prisma.constructionWorkspace.count();
    if (workspaceCount !== 0) throw new Error("DISPOSABLE_DATABASE_NOT_PRISTINE");

    process.stdout.write(JSON.stringify({
      schemaVersion: 1,
      userId: user.id,
      email: SYNTHETIC_EMAIL,
      role: "CLIENT",
      emailVerified: true,
      constructionWorkspaceCount: workspaceCount,
      dataClass: "SYNTHETIC_LOCAL_ONLY",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { PrismaClient } from "../../../.prisma-client";
import { hashPassword } from "better-auth/crypto";

export const SYNTHETIC_EMAIL = "olivier.r3@example.invalid";
export const SYNTHETIC_PASSWORD = "Endvera-R3-Local-Only-2026!";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || process.env.ENDVERA_R3_DISPOSABLE_DB_NAME !== "endvera-construction-v1-r3") {
    throw new Error("R3_DISPOSABLE_DATABASE_REQUIRED");
  }
  const prisma = new PrismaClient();
  try {
    if (await prisma.constructionWorkspace.count() !== 0) throw new Error("R3_DISPOSABLE_DATABASE_NOT_PRISTINE");
    const user = await prisma.user.create({
      data: {
        email: SYNTHETIC_EMAIL,
        name: "Olivier — re-test local synthétique R3",
        role: "CLIENT",
        emailVerified: true,
      },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await hashPassword(SYNTHETIC_PASSWORD),
      },
    });
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      userId: user.id,
      email: SYNTHETIC_EMAIL,
      role: "CLIENT",
      emailVerified: true,
      constructionWorkspaceCount: 0,
      dataClass: "SYNTHETIC_LOCAL_ONLY",
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

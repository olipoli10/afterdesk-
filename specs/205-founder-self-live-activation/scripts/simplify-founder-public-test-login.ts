import { PrismaClient } from "../../../.prisma-client";
import { hashPassword } from "better-auth/crypto";

const EXPECTED_APP_URL = "https://endvera-core-sandbox-afterdesk.vercel.app";

async function main() {
  if (process.env.ENDVERA_FOUNDER_PUBLIC_TEST !== "ENABLED" || process.env.APP_URL !== EXPECTED_APP_URL) {
    throw new Error("FL205_PUBLIC_TEST_GATE_REQUIRED");
  }
  const previousEmail = process.env.ENDVERA_FOUNDER_PREVIOUS_EMAIL?.trim().toLowerCase();
  const email = process.env.ENDVERA_FOUNDER_TEST_EMAIL?.trim().toLowerCase();
  const password = process.env.ENDVERA_FOUNDER_TEST_PASSWORD;
  if (!previousEmail?.endsWith("@example.invalid") || email !== "olivier@endvera.test" || !password || password.length < 10) {
    throw new Error("FL205_PUBLIC_TEST_CREDENTIAL_INPUT_REFUSED");
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: previousEmail }, select: { id: true } });
    if (!user) throw new Error("FL205_PUBLIC_TEST_ACCOUNT_NOT_FOUND");
    const credential = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { id: true } });
    if (!credential) throw new Error("FL205_PUBLIC_TEST_CREDENTIAL_NOT_FOUND");
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { email, emailVerified: true } }),
      prisma.account.update({ where: { id: credential.id }, data: { password: await hashPassword(password) } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, updated: true, sessionReset: true })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith("FL205_") ? error.message : "FL205_PUBLIC_TEST_CREDENTIAL_UPDATE_FAILED";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

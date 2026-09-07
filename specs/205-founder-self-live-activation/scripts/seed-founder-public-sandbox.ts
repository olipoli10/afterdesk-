import { PrismaClient } from "../../../.prisma-client";
import { hashPassword } from "better-auth/crypto";
import { initializeConstructionWorkspace } from "../../../src/server/construction-assistant-v1/workspace";

const EXPECTED_APP_URL = "https://endvera-core-sandbox-afterdesk.vercel.app";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`FL205_REQUIRED_ENVIRONMENT_MISSING:${name}`);
  return value;
}

function assertPublicSandbox(databaseUrl: string) {
  if (process.env.ENDVERA_FOUNDER_PUBLIC_TEST !== "ENABLED") throw new Error("FL205_PUBLIC_TEST_GATE_REQUIRED");
  if (requiredEnvironment("APP_URL") !== EXPECTED_APP_URL) throw new Error("FL205_PUBLIC_TEST_APP_URL_REFUSED");
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("FL205_DATABASE_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || ["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("FL205_PUBLIC_SANDBOX_DATABASE_REQUIRED");
  }
}

async function main() {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const syntheticEmail = requiredEnvironment("ENDVERA_FOUNDER_TEST_EMAIL").toLowerCase();
  const syntheticPassword = requiredEnvironment("ENDVERA_FOUNDER_TEST_PASSWORD");
  assertPublicSandbox(databaseUrl);
  if (!syntheticEmail.endsWith("@example.invalid")) throw new Error("FL205_SYNTHETIC_EMAIL_REQUIRED");
  if (syntheticPassword.length < 20) throw new Error("FL205_EPHEMERAL_PASSWORD_TOO_SHORT");

  const prisma = new PrismaClient();
  try {
    const [userCount, accountCount, workspaceCount] = await Promise.all([
      prisma.user.count(), prisma.account.count(), prisma.constructionWorkspace.count(),
    ]);
    if (userCount !== 0 || accountCount !== 0 || workspaceCount !== 0) throw new Error("FL205_PUBLIC_SANDBOX_NOT_PRISTINE");

    const user = await prisma.user.create({
      data: {
        email: syntheticEmail,
        name: "Olivier — test fondateur synthétique",
        role: "CLIENT",
        emailVerified: true,
        accounts: { create: { providerId: "credential", accountId: syntheticEmail, password: await hashPassword(syntheticPassword) } },
      },
      select: { id: true },
    });
    await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { accountId: user.id } });
    const workspace = await initializeConstructionWorkspace({
      userId: user.id,
      name: "ENDVERA — espace fondateur synthétique",
      timezone: "America/Toronto",
      locale: "fr-CA",
    });
    const [credentialCount, membershipCount] = await Promise.all([
      prisma.account.count({ where: { userId: user.id, providerId: "credential", accountId: user.id } }),
      prisma.constructionWorkspaceMember.count({ where: { userId: user.id, workspaceId: workspace.workspaceId, role: "owner", status: "active" } }),
    ]);
    if (credentialCount !== 1 || membershipCount !== 1 || !workspace.created) throw new Error("FL205_PUBLIC_SANDBOX_SEED_POSTCONDITION_FAILED");
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, dataClass: "SYNTHETIC_PUBLIC_TEST_ONLY", credentialCount, workspaceCount: 1, ownerMembershipCount: membershipCount })}\n`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith("FL205_") ? error.message : "FL205_UNEXPECTED_PUBLIC_SANDBOX_SEED_FAILURE";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

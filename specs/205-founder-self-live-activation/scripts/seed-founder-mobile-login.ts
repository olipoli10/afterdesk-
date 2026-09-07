import { PrismaClient } from "../../../.prisma-client";
import { hashPassword } from "better-auth/crypto";
import { initializeConstructionWorkspace } from "../../../src/server/construction-assistant-v1/workspace";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DATABASE_PREFIX = "endvera_founder_login_205_";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`FL205_REQUIRED_ENVIRONMENT_MISSING:${name}`);
  return value;
}

function assertDisposableLocalDatabase(databaseUrl: string, expectedDatabaseName: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("FL205_DATABASE_URL_INVALID");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (
    parsed.protocol !== "postgres:" ||
    !LOCAL_HOSTS.has(parsed.hostname) ||
    !expectedDatabaseName.startsWith(DATABASE_PREFIX) ||
    databaseName !== expectedDatabaseName ||
    expectedDatabaseName.toLowerCase().includes("r38")
  ) {
    throw new Error("FL205_NEW_DISPOSABLE_LOCAL_DATABASE_REQUIRED");
  }
}

async function main() {
  if (process.env.ENDVERA_FOUNDER_LOGIN_SMOKE !== "ENABLED") {
    throw new Error("FL205_EXPLICIT_LOCAL_SMOKE_GATE_REQUIRED");
  }

  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const databaseName = requiredEnvironment("ENDVERA_FOUNDER_LOGIN_DISPOSABLE_DB_NAME");
  const syntheticEmail = requiredEnvironment("ENDVERA_FOUNDER_LOGIN_SMOKE_EMAIL").toLowerCase();
  const syntheticPassword = requiredEnvironment("ENDVERA_FOUNDER_LOGIN_SMOKE_PASSWORD");
  assertDisposableLocalDatabase(databaseUrl, databaseName);

  if (!syntheticEmail.endsWith("@example.invalid")) {
    throw new Error("FL205_SYNTHETIC_EMAIL_REQUIRED");
  }
  if (syntheticPassword.length < 20) {
    throw new Error("FL205_EPHEMERAL_PASSWORD_TOO_SHORT");
  }

  const prisma = new PrismaClient();
  try {
    const [userCountBefore, accountCountBefore, workspaceCountBefore] = await Promise.all([
      prisma.user.count(),
      prisma.account.count(),
      prisma.constructionWorkspace.count(),
    ]);
    if (userCountBefore !== 0 || accountCountBefore !== 0 || workspaceCountBefore !== 0) {
      throw new Error("FL205_DISPOSABLE_DATABASE_NOT_PRISTINE");
    }

    const user = await prisma.user.create({
      data: {
        email: syntheticEmail,
        name: "Olivier — activation mobile synthétique",
        role: "CLIENT",
        emailVerified: true,
        accounts: {
          create: {
            providerId: "credential",
            accountId: syntheticEmail,
            password: await hashPassword(syntheticPassword),
          },
        },
      },
      select: { id: true },
    });

    await prisma.account.updateMany({
      where: { userId: user.id, providerId: "credential" },
      data: { accountId: user.id },
    });

    const workspace = await initializeConstructionWorkspace({
      userId: user.id,
      name: "ENDVERA — activation fondateur synthétique",
      timezone: "America/Toronto",
      locale: "fr-CA",
    });

    const [persistedUser, credentialCount, membershipCount, workspaceCountAfter] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, emailVerified: true },
      }),
      prisma.account.count({ where: { userId: user.id, providerId: "credential", accountId: user.id } }),
      prisma.constructionWorkspaceMember.count({
        where: { userId: user.id, workspaceId: workspace.workspaceId, role: "owner", status: "active" },
      }),
      prisma.constructionWorkspace.count(),
    ]);

    if (
      persistedUser?.role !== "CLIENT" ||
      persistedUser.emailVerified !== true ||
      credentialCount !== 1 ||
      membershipCount !== 1 ||
      workspaceCountAfter !== 1 ||
      !workspace.created
    ) {
      throw new Error("FL205_SYNTHETIC_FOUNDER_SEED_POSTCONDITION_FAILED");
    }

    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      dataClass: "SYNTHETIC_LOCAL_ONLY",
      clientVerified: true,
      credentialCount,
      workspaceCount: workspaceCountAfter,
      ownerMembershipCount: membershipCount,
    })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith("FL205_")
    ? error.message
    : "FL205_UNEXPECTED_SEED_FAILURE";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

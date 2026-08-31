import { PrismaClient } from "../../../.prisma-client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.includes("localhost:51282/template1")) throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "olivier.r2@example.invalid" } });
  const workspace = await prisma.constructionWorkspace.findFirstOrThrow({
    where: { ownerUserId: user.id, status: "active" },
    select: { id: true },
  });
  const projects = await prisma.constructionProject.count({ where: { workspaceId: workspace.id } });
  const messages = await prisma.constructionMessage.count({ where: { workspaceId: workspace.id } });
  const calendarItems = await prisma.constructionCalendarItem.count({ where: { workspaceId: workspace.id } });
  const actions = await prisma.constructionAction.count({ where: { workspaceId: workspace.id } });
  const deliveries = await prisma.constructionAction.aggregate({ where: { workspaceId: workspace.id }, _sum: { simulatedDeliveryCount: true } });
  const audits = await prisma.constructionAuditEvent.count({ where: { workspaceId: workspace.id } });
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    measuredAtUtc: new Date().toISOString(),
    dataClass: "SYNTHETIC_LOCAL_ONLY",
    observedFounderAttemptCount: 6,
    projectAssociationAccuracy: { numerator: 0, denominator: 3, percent: 0 },
    appointmentAccuracy: 0,
    ambiguousRequestConsequentialWriteCount: 0,
    clarificationProduced: false,
    tomorrowAnswerAccuracy: 0,
    duplicateCanonicalEffectCount: 0,
    duplicateReplayProtectionObserved: false,
    replayedOutboundDeliveryCount: deliveries._sum.simulatedDeliveryCount ?? 0,
    exactApprovalObserved: false,
    inventedFactCount: 0,
    timeToActionableStateMinutes: null,
    databaseState: { projects, messages, calendarItems, actions, audits },
    externalProviderCallCount: 0,
    externalTransportCount: 0,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());

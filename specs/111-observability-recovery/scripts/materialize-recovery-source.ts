import { Prisma, PrismaClient } from "@prisma-client";

const [sourceUrl, targetUrl, workspaceId] = process.argv.slice(2);
if (!sourceUrl || !targetUrl || !workspaceId) throw new Error("RECOVERY_MATERIALIZATION_ARGUMENTS_REQUIRED");

function assertLocalDisposable(url: string, expected: RegExp) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error("RECOVERY_MATERIALIZATION_HOST_REFUSED");
  if (!expected.test(parsed.pathname.slice(1))) throw new Error("RECOVERY_MATERIALIZATION_DATABASE_REFUSED");
}

assertLocalDisposable(sourceUrl, /^afterdesk_r31_integration$/u);
assertLocalDisposable(targetUrl, /^endvera_r31_source_integration$/u);

const source = new PrismaClient({ datasourceUrl: sourceUrl });
const target = new PrismaClient({ datasourceUrl: targetUrl });

void (async () => {
  try {
    const workspace = await source.constructionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const users = await source.user.findMany();
    const projects = await source.constructionProject.findMany({ where: { workspaceId } });
    const contacts = await source.constructionContact.findMany({ where: { workspaceId } });
    const messages = await source.constructionMessage.findMany({ where: { workspaceId } });
    const calendarItems = await source.constructionCalendarItem.findMany({ where: { workspaceId } });
    const connectorAccounts = await source.constructionConnectorAccount.findMany({ where: { workspaceId } });
    const connectorGrants = connectorAccounts.length === 0 ? [] : await source.constructionConnectorGrant.findMany({ where: { connectorAccountId: { in: connectorAccounts.map((row) => row.id) } } });
    const connectorOperations = (await source.constructionConnectorOperation.findMany({ where: { workspaceId } })).map((row) => ({
      ...row,
      // Prisma reads SQL NULL and JSON null identically. On write, an ordinary
      // null becomes JSONB `null`, which would violate the result/resultHash
      // pair constraint. Preserve the source SQL NULL explicitly.
      result: row.result === null ? Prisma.DbNull : row.result,
    }));
    const followUps = await source.constructionFollowUp.findMany({ where: { workspaceId } });
    const followUpAttempts = await source.constructionFollowUpAttempt.findMany({ where: { workspaceId } });
    const followUpTransitions = await source.constructionFollowUpTransition.findMany({ where: { workspaceId } });
    const signals = await source.constructionReliabilitySignal.findMany({ where: { workspaceId } });
    const alerts = await source.constructionReliabilityAlert.findMany({ where: { workspaceId } });
    const recoveries = await source.constructionRecoveryOperation.findMany({ where: { workspaceId } });
    const checkpoints = await source.constructionRecoveryCheckpoint.findMany({ where: { workspaceId } });
    const drills = await source.constructionRecoveryDrill.findMany({ where: { workspaceId } });
    const gates = await source.constructionReliabilityGateRun.findMany({ where: { workspaceId } });
    const commands = await source.constructionReliabilityCommand.findMany({ where: { workspaceId } });
    const members = await source.constructionWorkspaceMember.findMany({ where: { workspaceId } });

    await target.$transaction(async (tx) => {
      await tx.user.createMany({ data: users, skipDuplicates: true });
      await tx.constructionWorkspace.create({ data: workspace });
      await tx.constructionWorkspaceMember.createMany({ data: members });
      await tx.constructionProject.createMany({ data: projects });
      await tx.constructionContact.createMany({ data: contacts });
      await tx.constructionMessage.createMany({ data: messages as unknown as Prisma.ConstructionMessageCreateManyInput[] });
      await tx.constructionCalendarItem.createMany({ data: calendarItems });
      await tx.constructionConnectorAccount.createMany({ data: connectorAccounts });
      await tx.constructionConnectorGrant.createMany({ data: connectorGrants });
      await tx.constructionConnectorOperation.createMany({ data: connectorOperations as unknown as Prisma.ConstructionConnectorOperationCreateManyInput[] });
      await tx.constructionFollowUp.createMany({ data: followUps as unknown as Prisma.ConstructionFollowUpCreateManyInput[] });
      await tx.constructionFollowUpAttempt.createMany({ data: followUpAttempts as unknown as Prisma.ConstructionFollowUpAttemptCreateManyInput[] });
      await tx.constructionFollowUpTransition.createMany({ data: followUpTransitions as unknown as Prisma.ConstructionFollowUpTransitionCreateManyInput[] });
      await tx.constructionReliabilitySignal.createMany({ data: signals as unknown as Prisma.ConstructionReliabilitySignalCreateManyInput[] });
      await tx.constructionReliabilityAlert.createMany({ data: alerts });
      await tx.constructionRecoveryOperation.createMany({ data: recoveries as unknown as Prisma.ConstructionRecoveryOperationCreateManyInput[] });
      await tx.constructionRecoveryCheckpoint.createMany({ data: checkpoints as unknown as Prisma.ConstructionRecoveryCheckpointCreateManyInput[] });
      await tx.constructionRecoveryDrill.createMany({ data: drills });
      await tx.constructionReliabilityGateRun.createMany({ data: gates });
      await tx.constructionReliabilityCommand.createMany({ data: commands as unknown as Prisma.ConstructionReliabilityCommandCreateManyInput[] });
    });

    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      status: "PASS",
      workspaceId,
      copied: {
        users: users.length,
        projects: projects.length,
        contacts: contacts.length,
        messages: messages.length,
        calendarItems: calendarItems.length,
        connectorAccounts: connectorAccounts.length,
        connectorOperations: connectorOperations.length,
        followUps: followUps.length,
        followUpAttempts: followUpAttempts.length,
        followUpTransitions: followUpTransitions.length,
        reliabilitySignals: signals.length,
        reliabilityAlerts: alerts.length,
        recoveryOperations: recoveries.length,
      },
      customerDataUsed: false,
      externalTransportPerformed: false,
    })}\n`);
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
})();

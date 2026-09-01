import "server-only";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { connectorCapabilities } from "@/lib/construction-operating-assistant-r2/connectors";

export async function operatingAssistantCockpitForUser(userId: string, referenceNow = new Date()) {
  const workspace = await prisma.constructionWorkspace.findFirst({
    where: { members: { some: { userId, status: "active" } }, status: "active" },
    select: { id: true, name: true, defaultTimezone: true },
  });
  if (!workspace) return null;
  const zonedNow = toZonedTime(referenceNow, workspace.defaultTimezone);
  const today = startOfDay(zonedNow);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const todayFrom = fromZonedTime(today, workspace.defaultTimezone);
  const tomorrowFrom = fromZonedTime(tomorrow, workspace.defaultTimezone);
  const tomorrowTo = fromZonedTime(dayAfterTomorrow, workspace.defaultTimezone);

  const [messages, agenda, reminders, approvals, openLoops] = await Promise.all([
    prisma.constructionMessage.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: { id: true, direction: true, channel: true, originalBody: true, status: true, createdAt: true },
    }),
    prisma.constructionCalendarItem.findMany({
      where: { workspaceId: workspace.id, status: "scheduled", startsAt: { gte: todayFrom, lt: tomorrowTo } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        startsAt: true,
        timezone: true,
        verificationState: true,
        project: { select: { id: true, code: true, name: true } },
        contact: { select: { displayName: true } },
      },
    }),
    prisma.constructionAction.findMany({
      where: { workspaceId: workspace.id, type: "reminder", status: "approved", dueAt: { gte: todayFrom } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 20,
      select: { id: true, dueAt: true, payload: true, project: { select: { name: true } }, contact: { select: { displayName: true } } },
    }),
    prisma.constructionAction.findMany({
      where: { workspaceId: workspace.id, type: { in: ["outbound_message", "follow_up"] }, status: "proposed" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, type: true, version: true, payload: true, payloadHash: true, contact: { select: { displayName: true } } },
    }),
    prisma.constructionOpenLoop.findMany({
      where: { workspaceId: workspace.id, status: { in: ["open", "waiting_for_evidence", "waiting_for_verification"] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "asc" }],
      take: 10,
      select: { id: true, status: true, nextAction: true, nextResponsibleRole: true, project: { select: { code: true, name: true } } },
    }),
  ]);

  return {
    workspace,
    messages: messages.reverse(),
    today: agenda.filter((item) => item.startsAt < tomorrowFrom),
    tomorrow: agenda.filter((item) => item.startsAt >= tomorrowFrom),
    reminders,
    approvals,
    openLoops,
    connectors: connectorCapabilities(),
  };
}

import "server-only";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";

export async function calendarCockpitForUser(userId: string) {
  const workspace = await prisma.constructionWorkspace.findFirst({
    where: { members: { some: { userId, status: "active" } }, status: "active" },
    select: { id: true, name: true, defaultTimezone: true },
  });
  if (!workspace) return null;
  const items = await prisma.constructionCalendarItem.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      verificationState: true,
      project: { select: { id: true, code: true, name: true } },
      contact: { select: { id: true, displayName: true } },
      sourceMessage: { select: { id: true, channel: true, originalBody: true, createdAt: true } },
    },
  });
  return { workspace, items };
}

export async function tomorrowAnswer(input: {
  userId: string;
  workspaceId: string;
  referenceNow: Date;
}) {
  const workspace = await prisma.constructionWorkspace.findFirst({
    where: { id: input.workspaceId, members: { some: { userId: input.userId, status: "active" } } },
    select: { id: true, defaultTimezone: true },
  });
  if (!workspace) return null;
  const zonedNow = toZonedTime(input.referenceNow, workspace.defaultTimezone);
  const localTomorrow = startOfDay(addDays(zonedNow, 1));
  const from = fromZonedTime(localTomorrow, workspace.defaultTimezone);
  const to = fromZonedTime(addDays(localTomorrow, 1), workspace.defaultTimezone);
  const items = await prisma.constructionCalendarItem.findMany({
    where: { workspaceId: workspace.id, startsAt: { gte: from, lt: to } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: {
      title: true,
      startsAt: true,
      timezone: true,
      verificationState: true,
      project: { select: { name: true, code: true } },
      contact: { select: { displayName: true } },
    },
  });
  return { timezone: workspace.defaultTimezone, from, to, items };
}

export async function inboxForUser(userId: string) {
  const workspace = await prisma.constructionWorkspace.findFirst({
    where: { members: { some: { userId, status: "active" } }, status: "active" },
    select: { id: true, name: true },
  });
  if (!workspace) return null;
  const [messages, actions] = await Promise.all([
    prisma.constructionMessage.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        channel: true,
        direction: true,
        originalBody: true,
        status: true,
        providerMessageId: true,
        createdAt: true,
        project: { select: { name: true } },
        contact: { select: { displayName: true } },
      },
    }),
    prisma.constructionAction.findMany({
      where: { workspaceId: workspace.id, type: { in: ["outbound_message", "follow_up"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        version: true,
        payloadHash: true,
        payload: true,
        status: true,
        simulatedDeliveryCount: true,
        contact: { select: { displayName: true } },
      },
    }),
  ]);
  return { workspace, messages, actions };
}

import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function deliverPendingNotifications(): Promise<{
  sent: number;
  failed: number;
}> {
  const rows = await prisma.notification.findMany({
    where: { emailedAt: null, emailAttempts: { lt: 5 } },
    select: {
      id: true,
      title: true,
      body: true,
      taskId: true,
      emailAttempts: true,
      user: { select: { email: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const claimed = await prisma.notification.updateMany({
      where: { id: row.id, emailedAt: null, emailAttempts: row.emailAttempts },
      data: { emailAttempts: { increment: 1 }, emailError: null },
    });
    if (claimed.count === 0) continue;
    try {
      const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL;
      if (!appUrl && process.env.NODE_ENV === "production") {
        throw new Error("APP_URL must be configured before notification emails can be sent.");
      }
      const taskPath =
        row.user.role === "ADMIN"
          ? `/admin/tasks/${row.taskId}`
          : row.user.role === "VA"
            ? `/va/tasks/${row.taskId}`
            : `/client/tasks/${row.taskId}`;
      await sendEmail({
        to: row.user.email,
        subject: row.title,
        text:
          `${row.body ?? row.title}\n\n` +
          (row.taskId ? `Open task: ${new URL(taskPath, appUrl || "http://localhost:3000").toString()}\n\n` : "") +
          "Sign in to AfterDesk for the authoritative status.",
      });
      await prisma.notification.update({
        where: { id: row.id },
        data: { emailedAt: new Date(), emailError: null },
      });
      sent++;
    } catch (error) {
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          emailError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}

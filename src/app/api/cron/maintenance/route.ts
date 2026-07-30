import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  expireStalePayments,
  expireStaleQuotes,
  purgeExpiredTaskFiles,
  reapOrphanFiles,
} from "@/server/sweeps";
import { processMoneyIntents } from "@/server/money-intents";
import { deliverPendingNotifications } from "@/server/notifications";

export const runtime = "nodejs";

function hasValidBearer(value: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!value?.startsWith(prefix)) return false;
  const supplied = Buffer.from(value.slice(prefix.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !hasValidBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const [quotes, payments, orphans, purged, money, notifications] = await Promise.all([
    expireStaleQuotes(),
    expireStalePayments(),
    reapOrphanFiles(),
    purgeExpiredTaskFiles(),
    processMoneyIntents(),
    deliverPendingNotifications(),
  ]);
  return NextResponse.json({ quotes, payments, orphans, purged, money, notifications });
}

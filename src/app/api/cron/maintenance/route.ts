import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  advanceStandingCapacityPeriods,
  expireStalePayments,
  expireStaleQuotes,
  purgeExpiredTaskFiles,
  reapOrphanFiles,
  releaseDisputeWindowFunds,
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

// Each job is isolated so an unrelated rethrow (e.g. a transient DB error in
// a sweep) can never fail-fast the surrounding Promise.all and cut a live
// Stripe call in processMoneyIntents off mid-flight.
async function run<T>(name: string, job: Promise<T>): Promise<T | null> {
  try {
    return await job;
  } catch (e) {
    console.error(`[cron/maintenance] ${name} failed:`, e);
    return null;
  }
}

/**
 * Vercel Cron invokes the configured path with a **GET** ("To trigger a cron
 * job, Vercel makes an HTTP GET request", vercel.com/docs/cron-jobs), and
 * signs it with `Authorization: Bearer $CRON_SECRET`. This route used to
 * export POST only, so every hourly invocation since the cron was added got
 * a 405 and NOTHING in here ever ran — no Stripe capture, no payout release,
 * no notification email, no file purge, no Standing Capacity rollover.
 *
 * Both verbs are exported so the scheduler works and a manual `curl -X POST`
 * still does too. Same auth on both paths.
 */
async function runMaintenance(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !hasValidBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const [quotes, payments, orphans, purged, capacityPeriods, disputeWindows, money, notifications] =
    await Promise.all([
      run("quotes", expireStaleQuotes()),
      run("payments", expireStalePayments()),
      run("orphans", reapOrphanFiles()),
      run("purged", purgeExpiredTaskFiles()),
      run("capacityPeriods", advanceStandingCapacityPeriods()),
      run("disputeWindows", releaseDisputeWindowFunds()),
      run("money", processMoneyIntents()),
      run("notifications", deliverPendingNotifications()),
    ]);
  return NextResponse.json({
    quotes,
    payments,
    orphans,
    purged,
    capacityPeriods,
    disputeWindows,
    money,
    notifications,
  });
}

export async function GET(request: Request) {
  return runMaintenance(request);
}

export async function POST(request: Request) {
  return runMaintenance(request);
}

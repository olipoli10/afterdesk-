import "server-only";
import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Admin-editable settings. Defaults live here; any row in the Setting table
 * overrides its default. Nothing operational is hardcoded elsewhere.
 */
export type Settings = {
  // Operator working hours (Eastern Time) — drives client-facing estimates.
  workingHours: { timezone: string; days: number[]; start: string; end: string };
  // How long the admin needs (within working hours) to price a task.
  quoteTurnaroundHours: number;
  // VA submission deadline = client deadline minus this buffer.
  qcBufferHours: number;
  // A quote not answered within this window expires.
  quoteValidityHours: number;
  // Client can request a revision within this window after completion.
  revisionWindowHours: number;
  /**
   * Escrow dispute window — how long after QC approval the client's payment
   * stays authorized-but-not-captured and the worker's payout stays owed.
   * Auto-releases when this closes with no dispute (releaseDisputeWindowFunds
   * in sweeps.ts). Independent of revisionWindowHours: a revision request is
   * a service commitment, a dispute inside this window is what gates money.
   */
  disputeWindowHours: number;
  maxQcRounds: number;
  /** Revision rounds a client may request before it must become a dispute. */
  maxRevisionRounds: number;
  /** Floor on the inspection time a client gets back after a revision. */
  revisionMinRemainingHours: number;
  /** Work-in-progress cap per worker, so one person cannot hoard the pool. */
  maxActiveClaims: number;
  /** How long a client has to pay after accepting a quote. */
  paymentWindowHours: number;
  retentionDays: number;
  scoreWindow: number;
  highValueThreshold: number;
  suspensionFloor: number;
  minRatedDeliveries: number;
  minWorkerHourlyUsd: number;
  testCooldownDays: number;
  maxFileSizeMB: number;
  maxFilesPerTask: number;
  allowedExtensions: string[];
  deadlineWarningHours: number;
  pricingModel: string;
  pricingPrompt: string;
  /**
   * Standing Capacity weekly tiers — a client subscribing snapshots one of
   * these onto their StandingCapacityAccount at subscribe/renew time
   * (tierHours/weeklyClientPriceCents/weeklyVaPayoutCents on that row), so
   * editing this list later never repricess an account mid-period. Same
   * RULE 2 as everywhere else: two independent numbers, never derived from
   * each other.
   */
  standingCapacityTiers: { hours: number; weeklyClientPriceCents: number; weeklyVaPayoutCents: number }[];
  /**
   * Per-metric publish toggle for the reliability rates (src/lib/queries/reliability.ts,
   * shown on /ledger). The numbers themselves are always computed live from
   * real rows — this only controls whether a given one is shown publicly. If
   * a number is bad, toggling it off is still a choice the admin makes
   * explicitly, not something the code decides on the operator's behalf.
   */
  reliabilityPublic: { onTime: boolean; qcPass: boolean; dispute: boolean };
};

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const positiveHours = z.number().positive().max(24 * 30);

export const SettingsSchema = z.object({
  workingHours: z.object({
    timezone: z.string().min(1).max(100),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: time,
    end: time,
  }),
  quoteTurnaroundHours: positiveHours,
  qcBufferHours: positiveHours,
  quoteValidityHours: positiveHours,
  revisionWindowHours: positiveHours,
  disputeWindowHours: positiveHours,
  maxQcRounds: z.number().int().min(1).max(10),
  maxRevisionRounds: z.number().int().min(0).max(10),
  revisionMinRemainingHours: positiveHours,
  maxActiveClaims: z.number().int().min(1).max(20),
  paymentWindowHours: positiveHours,
  retentionDays: z.number().int().min(1).max(3650),
  scoreWindow: z.number().int().min(1).max(100),
  highValueThreshold: z.number().min(1).max(5),
  suspensionFloor: z.number().min(1).max(5),
  minRatedDeliveries: z.number().int().min(1).max(100),
  minWorkerHourlyUsd: z.number().positive().max(500),
  testCooldownDays: z.number().int().min(1).max(365),
  maxFileSizeMB: z.number().int().min(1).max(200),
  maxFilesPerTask: z.number().int().min(1).max(100),
  allowedExtensions: z
    .array(z.enum(["csv", "xlsx", "pdf", "docx", "png", "jpg", "jpeg"]))
    .min(1),
  deadlineWarningHours: positiveHours,
  pricingModel: z.string().min(1).max(100),
  pricingPrompt: z.string().min(20).max(20_000),
  standingCapacityTiers: z
    .array(
      z.object({
        hours: z.number().int().min(1).max(80),
        weeklyClientPriceCents: z.number().int().positive(),
        weeklyVaPayoutCents: z.number().int().positive(),
      })
    )
    .min(1)
    .max(10),
  reliabilityPublic: z.object({
    onTime: z.boolean(),
    qcPass: z.boolean(),
    dispute: z.boolean(),
  }),
});

export const DEFAULT_SETTINGS: Settings = {
  workingHours: {
    timezone: "America/Toronto",
    days: [1, 2, 3, 4, 5], // Mon-Fri
    start: "08:00",
    end: "18:00",
  },
  quoteTurnaroundHours: 4,
  qcBufferHours: 3,
  quoteValidityHours: 72,
  revisionWindowHours: 72,
  disputeWindowHours: 48,
  maxQcRounds: 2,
  maxRevisionRounds: 2,
  revisionMinRemainingHours: 24,
  maxActiveClaims: 3,
  paymentWindowHours: 48,
  retentionDays: 90,
  scoreWindow: 10,
  highValueThreshold: 4.0,
  suspensionFloor: 2.5,
  minRatedDeliveries: 3,
  minWorkerHourlyUsd: 12,
  testCooldownDays: 30,
  // Direct uploads are buffered by the route handler. Keep the built-in
  // storage driver deliberately conservative; larger files belong on a
  // presigned object-storage flow.
  maxFileSizeMB: 25,
  maxFilesPerTask: 20,
  // Legacy XLS and arbitrary ZIP archives stay blocked until a sandboxed
  // document-conversion service is configured.
  allowedExtensions: ["csv", "xlsx", "pdf", "docx", "png", "jpg", "jpeg"],
  deadlineWarningHours: 12,
  pricingModel: "claude-opus-5",
  pricingPrompt:
    "You are pricing an outsourced administrative task performed by a trained virtual assistant. " +
    "Given the task description, estimate a fair USD price range (low/high) for the full task. " +
    "Consider volume, complexity, research effort and turnaround. Respond with a low and high estimate in USD.",
  // Starting numbers, not a considered rate card — there is no admin UI to
  // edit this yet (same as every other Setting), so update the row by hand
  // in the database when real pricing is decided. A modest per-hour
  // discount at higher tiers, same $15/h worker rate straight through.
  standingCapacityTiers: [
    { hours: 5, weeklyClientPriceCents: 12_500, weeklyVaPayoutCents: 7_500 },
    { hours: 10, weeklyClientPriceCents: 22_000, weeklyVaPayoutCents: 15_000 },
    { hours: 20, weeklyClientPriceCents: 40_000, weeklyVaPayoutCents: 30_000 },
  ],
  reliabilityPublic: { onTime: true, qcPass: true, dispute: true },
};

/**
 * Per-request memoized: getSettings is the most-called query in the app
 * (layouts, pages and actions all read it). cache() dedupes within a single
 * request only, so admin settings writes are visible on the very next request.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await prisma.setting.findMany();
  const merged: Record<string, unknown> = {
    ...structuredClone(DEFAULT_SETTINGS as unknown as Record<string, unknown>),
  };
  for (const row of rows) {
    if (row.key in merged) merged[row.key] = row.value;
  }
  const parsed = SettingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;

  // A malformed admin row must never turn a file-size limit or a quality
  // threshold into `undefined`. Fail safe to the reviewed defaults and leave
  // a precise server-side diagnostic for the operator.
  console.error("[settings] invalid database override; defaults restored", parsed.error.issues);
  return structuredClone(DEFAULT_SETTINGS);
});

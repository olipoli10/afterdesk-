import "server-only";
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
  maxQcRounds: number;
  retentionDays: number;
  scoreWindow: number;
  highValueThreshold: number;
  suspensionFloor: number;
  minRatedDeliveries: number;
  testCooldownDays: number;
  maxFileSizeMB: number;
  maxFilesPerTask: number;
  allowedExtensions: string[];
  deadlineWarningHours: number;
  pricingModel: string;
  pricingPrompt: string;
};

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
  maxQcRounds: 2,
  retentionDays: 90,
  scoreWindow: 10,
  highValueThreshold: 4.0,
  suspensionFloor: 2.5,
  minRatedDeliveries: 3,
  testCooldownDays: 30,
  maxFileSizeMB: 200,
  maxFilesPerTask: 20,
  allowedExtensions: ["csv", "xlsx", "xls", "pdf", "docx", "png", "jpg", "jpeg", "zip"],
  deadlineWarningHours: 12,
  pricingModel: "claude-opus-5",
  pricingPrompt:
    "You are pricing an outsourced administrative task performed by a trained virtual assistant. " +
    "Given the task description, estimate a fair USD price range (low/high) for the full task. " +
    "Consider volume, complexity, research effort and turnaround. Respond with a low and high estimate in USD.",
};

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const merged: Record<string, unknown> = {
    ...structuredClone(DEFAULT_SETTINGS as unknown as Record<string, unknown>),
  };
  for (const row of rows) {
    if (row.key in merged) merged[row.key] = row.value;
  }
  return merged as Settings;
}

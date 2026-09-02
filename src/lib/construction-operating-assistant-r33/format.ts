import type { GoldenWorkflowLocale } from "./contracts";

export function formatGoldenWorkflowDateTime(input: {
  instant: string | Date;
  locale: GoldenWorkflowLocale;
  timezone: string;
}): string {
  return new Intl.DateTimeFormat(input.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: input.timezone,
  }).format(new Date(input.instant));
}

export function formatGoldenWorkflowMoney(input: {
  amountMinor: number;
  locale: GoldenWorkflowLocale;
}): string {
  if (!Number.isSafeInteger(input.amountMinor)) throw new Error("GOLDEN_WORKFLOW_MONEY_INVALID");
  return new Intl.NumberFormat(input.locale, {
    style: "currency",
    currency: "CAD",
  }).format(input.amountMinor / 100);
}

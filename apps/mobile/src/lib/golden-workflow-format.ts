import type { MobileGoldenWorkflowLocale } from "./golden-workflow";

export function formatMobileGoldenWorkflowDateTime(input: {
  instant: string | Date;
  locale: MobileGoldenWorkflowLocale;
  timezone: string;
}): string {
  return new Intl.DateTimeFormat(input.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: input.timezone,
  }).format(new Date(input.instant));
}

export function formatMobileGoldenWorkflowMoney(input: {
  amountMinor: number;
  locale: MobileGoldenWorkflowLocale;
}): string {
  if (!Number.isSafeInteger(input.amountMinor)) throw new Error("MOBILE_GOLDEN_WORKFLOW_MONEY_INVALID");
  return new Intl.NumberFormat(input.locale, {
    style: "currency",
    currency: "CAD",
  }).format(input.amountMinor / 100);
}

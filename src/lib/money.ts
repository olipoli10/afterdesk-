/** All money is stored as integer cents. */

export function formatCents(cents: number, currency = "USD"): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
}

/** Parses "1,250", "$1250.50", "125" → cents. Throws on invalid/negative. */
export function parseMoneyToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error(`Amount must be positive: "${input}"`);
  }
  return cents;
}

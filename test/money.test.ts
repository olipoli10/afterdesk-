import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "@/lib/money";

describe("money parsing", () => {
  it.each([
    ["$1,250.50", 125_050],
    ["125", 12_500],
    ["0.01", 1],
  ])("parses %s without floating-point storage", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["0", "-1", "12.345", "free", ""])("rejects invalid amount %j", (input) => {
    expect(() => parseMoneyToCents(input)).toThrow();
  });
});

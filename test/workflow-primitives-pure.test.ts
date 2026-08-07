import { describe, expect, it } from "vitest";
import {
  MIN_SOURCES_PER_FIELD,
  classifyRow,
  csvEscape,
  neutralizeCsvCell,
  normalizeEmail,
  normalizePhone,
  normalizeRows,
  normalizeUrl,
  rowsToCsv,
  splitExceptions,
  unitsRemainingFrom,
} from "@/lib/ai-work-engine/primitives/pure";
import type { WorkflowPayload, WorkflowRow } from "@/lib/ai-work-engine/primitives/types";

const row = (over: Partial<WorkflowRow> = {}): WorkflowRow => ({
  unitKey: "u1",
  fields: { email: "a@b.com", phone: "4165551234" },
  sources: { email: ["https://a.com/x", "https://b.org/y"], phone: ["https://a.com/x", "https://c.net"] },
  status: "needs_review",
  reviewReason: null,
  ...over,
});

const payload = (rows: WorkflowRow[], unitsTotal = rows.length): WorkflowPayload => ({
  rows,
  unitsTotal,
  requestedFields: ["email", "phone"],
});

describe("normalisation formats, and refuses to invent", () => {
  it("formats a ten or eleven digit phone and leaves anything else alone", () => {
    expect(normalizePhone("4165551234")).toBe("(416) 555-1234");
    expect(normalizePhone("1-416-555-1234")).toBe("(416) 555-1234");
    // Not parseable as North American: a person looks at it. Reshaping it
    // would hide that there is something to look at.
    expect(normalizePhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(normalizePhone("ext. 12")).toBe("ext. 12");
  });

  it("lowercases an email without claiming it is deliverable", () => {
    expect(normalizeEmail("  Owner@Clinic.CA ")).toBe("owner@clinic.ca");
  });

  it("adds a scheme and trims a trailing slash, but never guesses a host", () => {
    expect(normalizeUrl("clinic.ca/")).toBe("https://clinic.ca");
    expect(normalizeUrl("https://Clinic.CA/about/")).toBe("https://clinic.ca/about");
    expect(normalizeUrl("")).toBe("");
  });

  it("drops anything it cannot prove is an http(s) URL (1D-alpha0)", () => {
    /**
     * CHANGED DELIBERATELY. This used to return the raw string, which is how
     * `javascript:alert(1)` reached the `website` column of the CSV handed to
     * the client, where a spreadsheet makes it clickable. An unparseable value
     * now becomes "" and then null, so the row goes to a person instead of
     * carrying prose (or a payload) into a deliverable.
     */
    expect(normalizeUrl("not a url at all")).toBe("");
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
    expect(normalizeUrl("call the receptionist")).toBe("");
  });

  it("turns a value that normalises to nothing into null, not an empty cell", () => {
    // A blank cell that reads as a value is how a delivery gets called
    // complete when it is not.
    const [out] = normalizeRows([row({ fields: { email: "   ", phone: null } })]);
    expect(out.fields.email).toBeNull();
    expect(out.fields.phone).toBeNull();
  });
});

describe("the verification bar is two independent sources, in code", () => {
  it("verifies only when every requested field has two distinct hosts", () => {
    expect(classifyRow(row(), ["email", "phone"]).status).toBe("verified");
  });

  it("never verifies a row when NO fields were requested", () => {
    /**
     * Found by adversarial review, and it was the worst path in the slice.
     * With an empty field list the checking loop never runs, both guards fall
     * through, and every row came back `verified` having inspected nothing.
     * Verified rows are subtracted from unitsRemaining, which is the only
     * evidence computeResidual accepts that the machine reduced the work — so
     * an 80-unit mandate reported itself fully resolved and paid the dignity
     * floor for a job nobody had started. The classification schema permits an
     * empty required_fields, so this was reachable from a real quote.
     */
    const c = classifyRow(row(), []);
    expect(c.status).not.toBe("verified");
    expect(c.reviewReason).toBeTruthy();
  });

  it("counts hosts, not URLs: two pages of one site are one source", () => {
    const thin = row({
      sources: {
        email: ["https://a.com/one", "https://a.com/two"],
        phone: ["https://a.com/x", "https://b.org"],
      },
    });
    const c = classifyRow(thin, ["email", "phone"]);
    expect(c.status).toBe("needs_review");
    expect(c.reviewReason).toContain("email");
  });

  it("ignores www so it cannot be gamed into a second source", () => {
    const thin = row({
      sources: { email: ["https://a.com/x", "https://www.a.com/y"], phone: ["https://a.com", "https://b.org"] },
    });
    expect(classifyRow(thin, ["email", "phone"]).status).toBe("needs_review");
  });

  it("marks a row with nothing at all as not_found rather than review", () => {
    const empty = row({ fields: { email: null, phone: null }, sources: {} });
    expect(classifyRow(empty, ["email", "phone"]).status).toBe("not_found");
  });

  it("names the missing and the thin fields separately", () => {
    const mixed = row({
      fields: { email: "a@b.com", phone: null },
      sources: { email: ["https://a.com"] },
    });
    const c = classifyRow(mixed, ["email", "phone"]);
    expect(c.reviewReason).toContain("not found: phone");
    expect(c.reviewReason).toContain("needs a second source: email");
  });

  it("holds the bar at two", () => {
    expect(MIN_SOURCES_PER_FIELD).toBe(2);
  });
});

describe("split.exceptions counts what is actually left", () => {
  it("counts contract units that produced no row at all", () => {
    // The term an automation engine forgets. Without it the job reports as
    // more done than it is.
    const s = splitExceptions(payload([row()], 80));
    expect(s.verified).toBe(1);
    expect(s.missingRows).toBe(79);
    expect(unitsRemainingFrom(s)).toBe(79);
  });

  it("adds review, not-found and missing into the residual", () => {
    const s = splitExceptions(
      payload(
        [
          row({ unitKey: "a" }),
          row({ unitKey: "b", sources: { email: ["https://a.com"], phone: ["https://a.com"] } }),
          row({ unitKey: "c", fields: { email: null, phone: null }, sources: {} }),
        ],
        10
      )
    );
    expect(s.verified).toBe(1);
    expect(s.needsReview).toBe(1);
    expect(s.notFound).toBe(1);
    expect(s.missingRows).toBe(7);
    expect(unitsRemainingFrom(s)).toBe(9);
  });

  it("never reports negative missing rows when more was found than asked", () => {
    const s = splitExceptions(payload([row({ unitKey: "a" }), row({ unitKey: "b" })], 1));
    expect(s.missingRows).toBe(0);
  });

  it("is idempotent: running it twice changes nothing", () => {
    const first = splitExceptions(payload([row()], 5));
    const second = splitExceptions(first.payload);
    expect(second.payload.rows).toEqual(first.payload.rows);
    expect(unitsRemainingFrom(second)).toBe(unitsRemainingFrom(first));
  });
});

describe("the generated CSV neutralises formulas", () => {
  it("prefixes every formula trigger with an apostrophe", () => {
    for (const dangerous of ["=SUM(A1)", "+1+1", "-2+3", "@SUM", "\tx"]) {
      expect(neutralizeCsvCell(dangerous).startsWith("'")).toBe(true);
    }
  });

  it("leaves ordinary text and a plain number alone", () => {
    expect(neutralizeCsvCell("Dr. Smith")).toBe("Dr. Smith");
    expect(neutralizeCsvCell("416")).toBe("416");
  });

  it("still quotes and escapes after neutralising", () => {
    expect(csvEscape('=cmd|"x"')).toBe(`"'=cmd|""x"""`);
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
  });

  it("writes a header, one line per row, and a source column per field", () => {
    const csv = rowsToCsv(payload([row()]));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("unit_key,email,phone,email_sources,phone_sources,status,review_reason");
    expect(lines).toHaveLength(2);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("writes an empty cell for a null field, never the word null", () => {
    const csv = rowsToCsv(payload([row({ fields: { email: null, phone: null } })]));
    expect(csv).not.toContain("null");
  });

  it("survives a hostile value from the public web", () => {
    const hostile = row({
      unitKey: "=HYPERLINK(\"http://evil\",\"click\")",
      fields: { email: "=cmd|'/c calc'!A1", phone: "@SUM(1)" },
    });
    const csv = rowsToCsv(payload([hostile]));
    // No cell may begin a formula. Split on the raw text is enough: every
    // dangerous value was prefixed before quoting.
    expect(csv).not.toMatch(/(^|,)"?=/m);
    expect(csv).not.toMatch(/(^|,)"?@/m);
  });
});

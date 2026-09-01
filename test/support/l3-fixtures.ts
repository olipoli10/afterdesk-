/**
 * TRACKED FIXTURE SUPPORT — extracted from .scratch/l3-fixtures.ts so that
 * test/synthetic-provider.test.ts has no dependency on the untracked .scratch
 * directory (Release Gate B.1: a clean checkout must compile and run this
 * test without .scratch present).
 *
 * Only `consolidationFixtures` (the W8 three-file consolidation case) and its
 * direct dependencies are copied here — the rest of the source file's fixture
 * generators (crmExportFixture, signupsFixture, reverifyFixture,
 * demotionCaseFixture, payrollFixture) are not required by any tracked test
 * and are deliberately left out. The original stays untouched in .scratch.
 *
 * PURITY: no live provider calls, no env/credential access, no L3/database
 * dependency despite the historical name — "L3" refers to the internal test
 * level this fixture was built for, not a live system. Every row is
 * deterministic (fixed word lists, modulo-indexed, no RNG) and no data is
 * real: names come from a fixed invented word list, domains are `.example`
 * (RFC 2606, reserved/unroutable). Production code must never import this
 * file — see test/capability-substrate.test.ts's closure checks for the
 * discipline that enforces that boundary for provider-client modules; this
 * module carries no provider dependency at all, so it is out of that scope
 * entirely, but the same "test-only" rule applies by convention.
 */

export type Fixture = {
  fileName: string;
  bytes: Buffer;
  truth: Record<string, number | string | string[]>;
};

const PREFIX = [
  "Northgate", "Verdant", "Kestrel", "Aubier", "Meridian", "Stonebrook",
  "Larkspur", "Cobalt", "Ferrous", "Aldridge", "Brambleton", "Cypress",
  "Dunmore", "Elmwood", "Foxglove", "Granite", "Harrowgate", "Ironvale",
  "Juniper", "Kirkwall", "Lambert", "Mossley", "Nordvik", "Oakhurst",
  "Pinehaven", "Quarrystone", "Redbridge", "Sableford", "Thornbury", "Umberly",
];
const SUFFIX = ["Industries", "Supply", "Works", "Group", "Partners", "Logistics", "Fabrication", "Systems"];
const CITY = ["Montreal", "Laval", "Longueuil", "Quebec", "Sherbrooke", "Gatineau", "Trois-Rivieres", "Saguenay"];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function csv(rows: string[][]): Buffer {
  return Buffer.from(rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n", "utf8");
}

/* ───────── W8: three files, slightly different schemas ───────── */

export function consolidationFixtures(): Fixture[] {
  const mk = (n: number, headers: string[], count: number, offset: number): Fixture => {
    const rows: string[][] = [headers];
    for (let i = 0; i < count; i++) {
      const name = `${PREFIX[(i + offset) % PREFIX.length]} ${SUFFIX[(i + offset) % SUFFIX.length]}`;
      rows.push([name, `${slug(name)}.example`, `sales@${slug(name)}.example`, CITY[(i + offset) % CITY.length]]);
    }
    return {
      fileName: `suppliers-region-${n}.csv`,
      bytes: csv(rows),
      truth: { dataRows: count, headers: headers.join("|") },
    };
  };
  // Same MEANING, different column NAMES — the mapping must be explicit.
  return [
    mk(1, ["company", "website", "email", "city"], 40, 0),
    mk(2, ["Company Name", "Web Site", "E-mail", "Town"], 35, 7),
    mk(3, ["supplier", "domain", "contact_email", "location"], 30, 14),
  ];
}

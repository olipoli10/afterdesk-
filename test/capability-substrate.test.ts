import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAN_PRIMITIVES,
  PLAN_PRIMITIVE_IDS,
  PLAN_PRIMITIVE_MODES,
  PLAN_PRIMITIVE_REACH,
  FILE_READING_PRIMITIVE_IDS,
  primitiveReachOf,
  primitiveReadsFiles,
} from "@/lib/ai-work-engine/primitive-vocabulary";
import { PRIMITIVE_PARAM_SCHEMAS, parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import {
  DATA_CLASSES,
  classifyMandateData,
  mostRestrictive,
  reachMayProcess,
} from "@/lib/ai-work-engine/data-class";
import { inspectedFile, uninspectableFile } from "@/../test/support/inspection";
import { compileDecisions, HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";

/**
 * THE ARCHITECTURE PIN FOR THE CAPABILITY SUBSTRATE.
 *
 * Three tables now describe every capability — its version, its mode, its
 * reach — plus a parameter schema, and they live in three different files
 * because the pure compiler, the admin editor and the server registry each
 * need a different subset. Three tables that must agree and no test binding
 * them is precisely the shape of the 1B mode check, which spent a phase
 * asserting an enforcement that did not exist.
 *
 * So: a capability missing from ANY of them fails the build here, not in
 * production on the day someone adds an id and forgets a row.
 */

describe("the capability tables cannot drift apart", () => {
  it("is not vacuous: the vocabulary is populated and includes this phase's work", () => {
    expect(PLAN_PRIMITIVE_IDS.length).toBeGreaterThanOrEqual(15);
    expect(PLAN_PRIMITIVE_IDS).toContain("ingest.csv");
    expect(PLAN_PRIMITIVE_IDS).toContain("data.dedupe");
    expect(PLAN_PRIMITIVE_IDS).toContain("build.xlsx");
  });

  it("every capability declares a version, a mode, a reach and a params schema", () => {
    for (const id of PLAN_PRIMITIVE_IDS) {
      expect(PLAN_PRIMITIVES[id], `${id} has no version`).toBeGreaterThanOrEqual(1);
      expect(PLAN_PRIMITIVE_MODES[id], `${id} has no mode`).toBeTruthy();
      expect(PLAN_PRIMITIVE_REACH[id], `${id} has no reach`).toBeTruthy();
      expect(Object.hasOwn(PRIMITIVE_PARAM_SCHEMAS, id), `${id} has no params schema`).toBe(true);
    }
  });

  it("no table carries a capability the vocabulary does not know", () => {
    const known = new Set<string>(PLAN_PRIMITIVE_IDS);
    for (const id of Object.keys(PLAN_PRIMITIVE_MODES)) expect(known.has(id)).toBe(true);
    for (const id of Object.keys(PLAN_PRIMITIVE_REACH)) expect(known.has(id)).toBe(true);
    for (const id of Object.keys(PRIMITIVE_PARAM_SCHEMAS)) expect(known.has(id)).toBe(true);
    for (const id of FILE_READING_PRIMITIVE_IDS) expect(known.has(id)).toBe(true);
  });

  it("there is still no WRITE tier", () => {
    for (const id of PLAN_PRIMITIVE_IDS) {
      expect(["READ", "PREPARE"]).toContain(PLAN_PRIMITIVE_MODES[id]);
    }
  });

  it("an unknown id has no reach, and does not silently read as local", () => {
    // The dangerous default. If this ever returns "local" the compiler's reach
    // check becomes a formality for exactly the ids nobody declared.
    expect(primitiveReachOf("data.something_new")).toBeNull();
    expect(primitiveReadsFiles("data.something_new")).toBe(false);
  });

  it("every file-reading capability is local, and every 1E-alpha capability is too", () => {
    for (const id of FILE_READING_PRIMITIVE_IDS) {
      expect(PLAN_PRIMITIVE_REACH[id], `${id} reads client files and must be local`).toBe("local");
    }
    /**
     * The load-bearing property of this whole phase: nothing added in 1E-alpha
     * can transmit anything. It is what makes reading client files safe even
     * when the classifier is wrong, and it is asserted rather than trusted.
     */
    for (const id of [
      "ingest.csv",
      "ingest.xlsx",
      "data.dedupe",
      "data.normalize",
      "data.join",
      "data.filter",
      "data.aggregate",
      "data.compare",
      "data.schema_map",
      "build.xlsx",
    ] as const) {
      expect(PLAN_PRIMITIVE_REACH[id], `${id} must not reach a provider`).toBe("local");
    }
  });
});

describe("the data classes authorise exactly what they say", () => {
  it("a provider may only ever see public business data", () => {
    expect(reachMayProcess("provider", "public_business")).toBe(true);
    expect(reachMayProcess("provider", "business_confidential")).toBe(false);
    expect(reachMayProcess("provider", "personal_sensitive")).toBe(false);
  });

  it("local code may additionally see the client's own business data", () => {
    expect(reachMayProcess("local", "public_business")).toBe(true);
    expect(reachMayProcess("local", "business_confidential")).toBe(true);
    expect(reachMayProcess("local", "personal_sensitive")).toBe(false);
  });

  it("restriction only ever rises", () => {
    expect(mostRestrictive([])).toBe("public_business");
    expect(mostRestrictive(["public_business", "business_confidential"])).toBe(
      "business_confidential"
    );
    expect(mostRestrictive(["personal_sensitive", "public_business"])).toBe("personal_sensitive");
    expect(DATA_CLASSES).toHaveLength(3);
  });
});

describe("the local classifier fails closed", () => {
  const clean = (over: Partial<Parameters<typeof classifyMandateData>[0]> = {}) =>
    classifyMandateData({
      declaredSensitive: false,
      declaredRequiredAccessCount: 0,
      fileCount: 0,
      inspections: [],
      ...over,
    });

  it("a mandate with no files and no declaration is public business", () => {
    expect(clean().dataClass).toBe("public_business");
  });

  it("ANY client file floors the mandate at business-confidential", () => {
    /**
     * The rule that stops a clean regex pass from being read as a clearance. A
     * spreadsheet of SKUs matches no sensitive pattern at all, and it is still
     * the client's own data, so it never becomes public.
     */
    const v = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["sku", "price"], [["A-12", "9.99"]])],
    });
    expect(v.dataClass).toBe("business_confidential");
  });

  it("a file that could not be inspected is human-only, not assumed safe", () => {
    const v = clean({ fileCount: 1, inspections: [uninspectableFile("f1")] });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it("a file with no inspection result at all is human-only", () => {
    // Two attachments, one inspection: the missing one must not be ignored.
    const v = clean({
      fileCount: 2,
      inspections: [inspectedFile("f1", ["company"], [["Acme"]])],
    });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it("business contact columns stay business-confidential, and are processed locally", () => {
    /**
     * The judgement this phase rests on, asserted so it cannot drift by
     * accident. A CRM export is the ordinary substance of the work; it is not
     * public, and it is not a medical record either. Local code may clean it.
     */
    const v = clean({
      fileCount: 1,
      inspections: [
        inspectedFile(
          "f1",
          ["first name", "company", "work email", "phone"],
          [["Dana", "Acme Ltd", "dana@acme.com", "+1 514 555 0100"]]
        ),
      ],
    });
    expect(v.dataClass).toBe("business_confidential");
    expect(reachMayProcess("local", v.dataClass)).toBe(true);
    expect(reachMayProcess("provider", v.dataClass)).toBe(false);
  });

  it.each([
    ["SIN", ["employee", "sin"]],
    ["date of birth", ["name", "date of birth"]],
    ["salary", ["name", "salary"]],
    ["health", ["patient", "diagnosis"]],
    ["account", ["vendor", "account number"]],
    ["credentials", ["user", "password"]],
    ["french payroll", ["employe", "salaire"]],
    ["accented French SIN", ["nom", "Numéro d'assurance sociale"]],
    ["accented French health", ["patient", "Santé"]],
    ["accented French payroll", ["nom", "Rémunération"]],
    ["accented French account", ["fournisseur", "Numéro de compte"]],
  ])("a %s column escalates to human-only", (_label, headers) => {
    const v = clean({ fileCount: 1, inspections: [inspectedFile("f1", headers)] });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it.each([
    ["snake_case", "date_of_birth"],
    ["camelCase", "dateOfBirth"],
    ["kebab-case", "date-of-birth"],
    ["snake_case SSN", "social_security_number"],
    ["snake_case account", "bank_account_number"],
    ["camelCase card", "creditCardNumber"],
    ["dotted French payroll", "employe.remuneration"],
    ["screaming snake", "DATE_OF_BIRTH"],
    ["the plain spelling", "Date of Birth"],
  ])("a sensitive column spelled in %s still escalates", (_label, header) => {
    /**
     * The separator bug. Every multi-word pattern in the list is written with
     * spaces, `_` is a word character, and real exports use `_`. So the list
     * that stands between a payroll file and the automation was matching only
     * the spelling a human types by hand, and `date_of_birth` — the single most
     * common spelling in existence — sailed straight through it.
     */
    const v = clean({ fileCount: 1, inspections: [inspectedFile("f1", ["name", header])] });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it.each([
    ["a nine-digit government id", "123-45-6789"],
    ["a Luhn-valid payment card", "4111 1111 1111 1111"],
    ["an IBAN", "DE89370400440532013000"],
  ])("%s in the VALUES escalates even under an innocent header", (_label, value) => {
    const v = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["reference"], [[value]])],
    });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it.each([
    ["a signup timestamp", "signup_date", "2024-01-12"],
    ["an invoice date", "invoice_date", "2026-08-01"],
    ["a verification stamp", "last_checked", "2026-07-31"],
    ["a creation stamp", "created_at", "2023-11-04"],
    ["a contract date", "contract_date", "2025-02-28"],
    ["a European-order business date", "date_facture", "28/02/2025"],
  ])("%s is an ordinary business date, not a birth date", (_label, header, value) => {
    /**
     * THE REGRESSION THIS FIX EXISTS FOR. An ISO date used to be a value-alone
     * signal called `date_of_birth`, so one timestamp cell in a sample sent the
     * whole mandate to a human. On a product whose market is cleaning exported
     * spreadsheets, that is the most common column there is, and the engine was
     * disarmed by it. A date value alone proves nothing.
     */
    const v = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["company", header], [["Acme Ltd", value]])],
    });
    expect(v.dataClass).toBe("business_confidential");
  });

  it.each([
    ["date_of_birth", "date_of_birth", "1994-03-14"],
    ["dob with slashes", "dob", "1994/03/14"],
    ["birthday", "birthday", "1994-03-14"],
    ["date de naissance", "date de naissance", "14/03/1994"],
  ])("%s is unambiguous and escalates on the NAME alone", (_label, header, value) => {
    // Unambiguous spellings do not need a value to agree with them: a column
    // called `dob` full of blanks is still a date-of-birth column.
    expect(clean({ fileCount: 1, inspections: [inspectedFile("f1", ["name", header])] }).dataClass).toBe(
      "personal_sensitive"
    );
    expect(
      clean({
        fileCount: 1,
        inspections: [inspectedFile("f1", ["name", header], [["Dana", value]])],
      }).dataClass
    ).toBe("personal_sensitive");
  });

  it.each([
    ["birth", "birth"],
    ["born", "born"],
    ["naissance", "naissance"],
    ["ne le", "ne le"],
  ])("a loose birth word (%s) escalates only when dates sit under it", (_label, header) => {
    /**
     * The replacement rule, in both directions. Column semantics plus a
     * compatible value — never one alone. `Birth` with city names under it is a
     * place of birth column in a form the engine can clean; `birth` with dates
     * under it is a date of birth and a person does the mandate.
     */
    const withDates = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["name", header], [["Dana", "1994-03-14"]])],
    });
    expect(withDates.dataClass).toBe("personal_sensitive");

    const withoutDates = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["name", header], [["Dana", "Montreal"]])],
    });
    expect(withoutDates.dataClass).toBe("business_confidential");
  });

  it("a date in a NEIGHBOURING column does not confirm a birth column", () => {
    // The association is the whole point of carrying columns instead of two
    // flat lists: the date must be under the birth-named header, not merely
    // somewhere in the same file.
    const v = clean({
      fileCount: 1,
      inspections: [
        inspectedFile("f1", ["birth", "signup_date"], [["Montreal", "2024-01-12"]]),
      ],
    });
    expect(v.dataClass).toBe("business_confidential");
  });

  it("an order number that is not Luhn-valid does not escalate", () => {
    // Without the checksum every EAN and order number in a product catalogue
    // would fire, and the class would mean nothing.
    const v = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["order"], [["4111111111111112"]])],
    });
    expect(v.dataClass).toBe("business_confidential");
  });

  it("a sensitive shape in a ragged cell past the last header still escalates", () => {
    // A value with no column is still a value. The shapes that stand alone
    // must see it; only the rules that need a NAME may skip it.
    const v = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["company"], [["Acme Ltd", "123-45-6789"]])],
    });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it("the model saying 'not sensitive' can never lower what inspection found", () => {
    /**
     * The 1E-alpha rule, asserted against the exact failure it forbids: a
     * classifier returning sensitive_data=false on a payroll file. The verdict
     * is the maximum of every signal and the declaration contributes none when
     * it is false, so there is no arithmetic by which it can subtract.
     */
    const v = clean({
      declaredSensitive: false,
      fileCount: 1,
      inspections: [inspectedFile("f1", ["employee", "salaire"], [["Dana", "52000"]])],
    });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it("the brief's own declaration still escalates, files or not", () => {
    expect(clean({ declaredSensitive: true }).dataClass).toBe("personal_sensitive");
    expect(clean({ declaredRequiredAccessCount: 1 }).dataClass).toBe("personal_sensitive");
  });

  it("every verdict explains itself without quoting a client value", () => {
    const v = clean({
      fileCount: 1,
      inspections: [inspectedFile("f1", ["ssn", "birth"], [["123-45-6789", "1994-03-14"]])],
    });
    expect(v.signals.length).toBeGreaterThan(0);
    for (const s of v.signals) {
      expect(s.reason).not.toContain("123-45-6789");
      expect(s.reason).not.toContain("1994-03-14");
    }
  });
});

describe("the compiler enforces reach, class and params", () => {
  const step = (over: Partial<Parameters<typeof compileDecisions>[0][number]> = {}) => ({
    planStepId: "s1",
    order: 1,
    title: "step",
    executor: "ai" as const,
    primitiveId: "research.web_search" as string | null,
    primitiveVersion: 1 as number | null,
    dependsOnOrder: [] as number[],
    ...over,
  });

  it("a provider capability is refused on the client's own data", () => {
    const out = compileDecisions([step()], {
      sensitiveData: false,
      requiredAccessCount: 0,
      dataClass: "business_confidential",
    });
    expect(out.steps[0].executionMode).toBe("human");
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.data_class_forbids_reach);
  });

  it("a local capability runs on the client's own data", () => {
    const out = compileDecisions(
      [
        step({
          primitiveId: "data.dedupe",
          params: { keyFields: ["email"] },
        }),
      ],
      { sensitiveData: false, requiredAccessCount: 0, dataClass: "business_confidential" }
    );
    expect(out.steps[0].executionMode).toBe("automated");
    expect(out.steps[0].params).toMatchObject({ keyFields: ["email"], strategy: "normalized" });
  });

  it("nothing is automated on personal-sensitive data", () => {
    const out = compileDecisions(
      [step({ primitiveId: "data.dedupe", params: { keyFields: ["email"] } })],
      { sensitiveData: false, requiredAccessCount: 0, dataClass: "personal_sensitive" }
    );
    expect(out.fullyHuman).toBe(true);
  });

  it("a mandate that reads a client file lets NO step reach a provider", () => {
    /**
     * The mixing rule, tested where it is the ONLY thing standing in the way.
     *
     * On `business_confidential` the class rule already refuses every provider,
     * so a test written at that class would pass without the mixing rule
     * existing at all — it would prove nothing. The case this rule alone
     * covers is a plan carrying an ingestion step under a class that WOULD
     * admit a provider: a contract accepted before classes existed (absent,
     * read as `public_business`) whose steps were later hand-edited, which is
     * exactly the gap a belt is for.
     */
    const steps = [
      step({ planStepId: "a", order: 1, primitiveId: "ingest.csv", params: { fileId: "f1" } }),
      step({ planStepId: "b", order: 2, primitiveId: "research.web_search", params: {} }),
    ];
    const out = compileDecisions(steps, { sensitiveData: false, requiredAccessCount: 0 });
    expect(out.steps[0].executionMode).toBe("automated");
    expect(out.steps[1].executionMode).toBe("human");
    expect(out.steps[1].handoffReason).toBe(HANDOFF_REASONS.provider_step_beside_client_file);

    // Not vacuous: without the ingestion step beside it, that same research
    // step compiles.
    const alone = compileDecisions([steps[1]], { sensitiveData: false, requiredAccessCount: 0 });
    expect(alone.steps[0].executionMode).toBe("automated");
  });

  it("the class rule refuses a provider on client data even with no ingestion step", () => {
    // The other half of the pair: the two rules overlap on purpose, and each
    // has a case where it is the only one that fires.
    const out = compileDecisions([step({ params: {} })], {
      sensitiveData: false,
      requiredAccessCount: 0,
      dataClass: "business_confidential",
    });
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.data_class_forbids_reach);
  });

  it("params that do not satisfy the capability make the step a person's", () => {
    const out = compileDecisions(
      // data.dedupe requires keyFields; an empty object cannot be filled in.
      [step({ primitiveId: "data.dedupe", params: {} })],
      { sensitiveData: false, requiredAccessCount: 0, dataClass: "business_confidential" }
    );
    expect(out.steps[0].executionMode).toBe("human");
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.invalid_params);
    expect(out.steps[0].params).toBeNull();
  });

  it("a contract accepted before data classes existed behaves exactly as before", () => {
    // dataClass absent: the old two-boolean gate is the whole story, and the
    // research workflow those contracts describe still compiles.
    const out = compileDecisions([step({ params: {} })], {
      sensitiveData: false,
      requiredAccessCount: 0,
    });
    expect(out.steps[0].executionMode).toBe("automated");
  });
});

describe("params are parsed, never invented", () => {
  it("an unknown capability has no params, whatever is offered", () => {
    expect(parsePrimitiveParams("data.nonexistent", { a: 1 })).toBeNull();
    expect(parsePrimitiveParams(null, {})).toBeNull();
  });

  it("the original five still take none, and tolerate a plan written before params existed", () => {
    expect(parsePrimitiveParams("research.web_search", null)).toEqual({});
    expect(parsePrimitiveParams("split.exceptions", undefined)).toEqual({});
    // And they refuse configuration they never agreed to interpret.
    expect(parsePrimitiveParams("research.web_search", { maxSearches: 99 })).toBeNull();
  });

  it("defaults are applied, but only over an otherwise valid object", () => {
    const p = parsePrimitiveParams("ingest.csv", { fileId: "f1" });
    expect(p).toMatchObject({ fileId: "f1", hasHeaderRow: true, delimiter: null, datasetName: "main" });
    expect(parsePrimitiveParams("ingest.csv", {})).toBeNull();
  });

  it("a schema_map with no mapping is refused rather than defaulted to identity", () => {
    expect(parsePrimitiveParams("data.schema_map", { mapping: [] })).toBeNull();
    expect(
      parsePrimitiveParams("data.schema_map", { mapping: [{ from: "a", to: "b" }] })
    ).toMatchObject({ unmapped: "exception" });
  });
});

/* ════════ an inspection result is not a provider authorization ═══════════ */

/**
 * THE PIN THAT STOPS THE MOST PLAUSIBLE FUTURE MISTAKE IN THIS SUBSTRATE.
 *
 * 1E-alpha added a local inspector: deterministic code opens each attachment,
 * reads the column names and a bounded sample of values, and hands the SHAPES
 * to a pure classifier. That inspection is the input to one decision and one
 * only: which DataClass this mandate is, which in turn decides between local
 * processing and human work.
 *
 * The mistake waiting to be made is to promote it. It reads so much like a scan
 * that the next person under delivery pressure will reason: the inspector found
 * no identifiers, the classifier says nothing sensitive, therefore this file is
 * safe to send to a model. Every step of that is locally reasonable and the
 * conclusion is false, because a bounded sample is not a proof about a file.
 *
 * So the separation is asserted at SOURCE level rather than by behaviour. A
 * behavioural test only proves that today's code does not do it; reading the
 * modules proves that no code path exists to do it with, which is the property
 * that has to survive people who never read this comment.
 */
describe("a local inspection result is not an external-provider authorization", () => {
  const SRC = join(__dirname, "..", "src");
  const ENGINE = join(SRC, "lib", "ai-work-engine");
  const FILE_INSPECTION = join(ENGINE, "file-inspection.ts");
  const DATA_CLASS = join(ENGINE, "data-class.ts");
  const COMPILE = join(ENGINE, "compile.ts");
  const VOCABULARY = join(ENGINE, "primitive-vocabulary.ts");
  const REGISTRY = join(ENGINE, "registry.ts");
  const ENGINE_INDEX = join(ENGINE, "index.ts");
  const MODEL_GATEWAY_BREAKERS = join(SRC, "server", "model-gateway", "breakers.ts");
  const ADMIN_MODEL_GATEWAY_ACTION = join(SRC, "server", "actions", "admin-model-gateway.ts");

  const sourceOf = (file: string) => readFileSync(file, "utf8");
  /** Repo-relative and slash-normalised, so a failure reads the same on any host. */
  const shortName = (file: string) => relative(SRC, file).split("\\").join("/");

  /**
   * THE SENTENCE, WRITTEN INTO THE ASSERTION ON PURPOSE.
   *
   * Whoever touches this next will read a failure message in a terminal, not
   * this file. If the message only said "expected false to be true" they would
   * have to reconstruct the argument themselves, under exactly the pressure
   * that produced the mistake, so the argument travels with the failure.
   */
  const TRAP =
    'The trap: a clean sample proves nothing about row 8000. The inspector reads headers and a bounded sample, so "scan clean" may never become "provider eligible" without a new policy, written and reviewed as one.';

  /**
   * Source with its comments removed, so a scan for a token finds CODE.
   *
   * Three of the modules below discuss the provider reach at length in prose,
   * and a check that could not tell a paragraph from a branch would either fail
   * on a comment or be softened until it proved nothing. The line-comment rule
   * deliberately ignores a `//` preceded by a colon, which is the URL case.
   */
  const codeOf = (file: string) =>
    sourceOf(file)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  /** Every .ts and .tsx under src, sorted, so a failure names files in a stable order. */
  function everySourceFile(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...everySourceFile(full));
      else if (/\.tsx?$/.test(entry.name)) found.push(full);
    }
    return found.sort();
  }

  const ALL_SOURCES = everySourceFile(SRC);

  /** Module specifiers imported by a file, including side-effect and re-exports. */
  function importSpecifiers(source: string): string[] {
    const specs: string[] = [];
    const patterns = [
      /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g,
      /import\s*["']([^"']+)["']/g,
      /import\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const re of patterns) {
      let match = re.exec(source);
      while (match !== null) {
        specs.push(match[1]);
        match = re.exec(source);
      }
    }
    return specs;
  }

  /** A specifier resolved to a file in this repo, or null for a package. */
  function resolveModule(spec: string, fromFile: string): string | null {
    let base: string | null = null;
    if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
    else return null;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  /** Every repo module reachable from an entry point, the entry included. */
  function importClosure(entry: string): string[] {
    const seen = new Set<string>([entry]);
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.shift() as string;
      for (const spec of importSpecifiers(sourceOf(file))) {
        const resolved = resolveModule(spec, file);
        if (resolved === null || seen.has(resolved)) continue;
        seen.add(resolved);
        queue.push(resolved);
      }
    }
    return [...seen].sort();
  }

  /**
   * The module implementing a capability, resolved through registry.ts rather
   * than named here. The registry is the allowlist every runnable capability
   * has to be in, so a capability added tomorrow is covered by the same walk
   * without anybody remembering to extend a list in a test.
   */
  function moduleImplementing(id: string): string {
    const registry = sourceOf(REGISTRY);
    const entry = new RegExp(
      `"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*define\\(\\{([\\s\\S]*?)\\n\\s*\\}\\)`
    ).exec(registry);
    if (entry === null) throw new Error(`registry.ts has no entry for ${id}`);
    const run = /run:\s*(\w+)/.exec(entry[1]);
    if (run === null) throw new Error(`the registry entry for ${id} names no run function`);

    const named = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
    let match = named.exec(registry);
    while (match !== null) {
      const bindings = match[1].split(",").map((b) => b.trim().split(/\s+as\s+/)[0].trim());
      if (bindings.includes(run[1])) {
        const resolved = resolveModule(match[2], REGISTRY);
        if (resolved === null) throw new Error(`${match[2]} does not resolve to a file in this repo`);
        return resolved;
      }
      match = named.exec(registry);
    }
    throw new Error(`registry.ts does not import ${run[1]} from anywhere`);
  }

  const PROVIDER_IDS = PLAN_PRIMITIVE_IDS.filter((id) => PLAN_PRIMITIVE_REACH[id] === "provider");

  it("is not vacuous: the modules this block reasons about were read and are what they claim", () => {
    // A source-level assertion that passed on an empty string would be the most
    // reassuring test in this file and would prove nothing whatever.
    expect(sourceOf(FILE_INSPECTION)).toContain("export async function inspectFile");
    expect(sourceOf(DATA_CLASS)).toContain("export function classifyMandateData");
    expect(sourceOf(DATA_CLASS)).toContain("export function reachMayProcess");
    expect(sourceOf(COMPILE)).toContain("reachMayProcess(");
    expect(sourceOf(REGISTRY)).toContain("export const REGISTRY");
    expect(ALL_SOURCES.length).toBeGreaterThan(50);
    expect(PROVIDER_IDS.length).toBeGreaterThanOrEqual(1);
  });

  it("the provider-reach entries are pinned BY VALUE, not only derived from the table", () => {
    /**
     * Every reach loop in this file iterates PROVIDER_IDS, which is DERIVED
     * from the table — so a single edit flipping an entry to "local" would
     * silently drop it out of every provider assertion while simultaneously
     * handing it client file handles (the runner gates on "local"), exempting
     * it from the mixing rule and from the class gate. The three entries that
     * send data to a provider are therefore named here, by value: changing
     * one is a deliberate act that fails this line first. web.fetch's own
     * table comment claims exactly this pin; this is where the claim is true.
     */
    expect(PLAN_PRIMITIVE_REACH["research.web_search"]).toBe("provider");
    expect(PLAN_PRIMITIVE_REACH["extract.structured_rows"]).toBe("provider");
    expect(PLAN_PRIMITIVE_REACH["web.fetch"]).toBe("provider");
    // And the fetch capability never reads a client attachment: reach says
    // where input GOES, this list says what input it may TAKE.
    expect(FILE_READING_PRIMITIVE_IDS).not.toContain("web.fetch");
  });

  it("the inspector cannot express an authorization at all", () => {
    /**
     * It has no vocabulary for one. The module names no reach, no capability
     * table and no data class: everything it produces is a FileInspection, and
     * the only thing that reads a FileInspection is the classifier.
     */
    const code = codeOf(FILE_INSPECTION);
    for (const forbidden of [
      "provider",
      "reachMayProcess",
      "PLAN_PRIMITIVE_REACH",
      "primitiveReachOf",
      "CapabilityReach",
      "public_business",
    ]) {
      expect(
        code.includes(forbidden),
        `file-inspection.ts names "${forbidden}", which would make a sampled scan part of a reach decision. ${TRAP}`
      ).toBe(false);
    }
    // Non-vacuous: it does speak the vocabulary it is supposed to speak, and it
    // still fails closed on a file it could not read.
    expect(code).toContain("FileInspection");
    expect(code).toContain("inspected: false");
  });

  it("the classifier decides a class, and a class is not a reach", () => {
    const source = sourceOf(DATA_CLASS);
    const classifier = codeOf(DATA_CLASS).slice(
      codeOf(DATA_CLASS).indexOf("export function classifyMandateData")
    );
    expect(classifier.length).toBeGreaterThan(200);

    for (const forbidden of ["provider", "reach", "MayProcess"]) {
      expect(
        classifier.includes(forbidden),
        `classifyMandateData names "${forbidden}", so an inspection would be deciding who may receive the file rather than what the file is. ${TRAP}`
      ).toBe(false);
    }
    // The only thing it can return is the maximum of its own signals, and every
    // rule it holds raises the restriction. There is no path that lowers one.
    expect(classifier).toContain("dataClass: mostRestrictive(");
    expect(source).toContain("export type DataClassVerdict = {");
  });

  it("no module implementing a provider-reach capability can even see the inspection", () => {
    /**
     * Walked over the whole import graph rather than the direct imports: the
     * dangerous version of this mistake is not `import { inspectFile }` at the
     * top of research.ts, which anybody would catch in review. It is a helper
     * three modules down that grew a convenience re-export.
     */
    for (const id of PROVIDER_IDS) {
      const entry = moduleImplementing(id);
      const closure = importClosure(entry);
      expect(closure.length).toBeGreaterThan(1);

      for (const file of closure) {
        expect(
          file === FILE_INSPECTION,
          `${id} reaches a provider and its import graph contains ${shortName(file)}. ${TRAP}`
        ).toBe(false);
        const code = codeOf(file);
        for (const forbidden of ["classifyMandateData", "inspectFile", "inspectFiles"]) {
          expect(
            code.includes(forbidden),
            `${id} reaches a provider and ${shortName(file)} in its import graph names "${forbidden}". ${TRAP}`
          ).toBe(false);
        }
      }
    }
  });

  it("the same walk does find the inspection where it legitimately lives", () => {
    // Falsifiability companion for the walk above: it is not a check that
    // always passes because the traversal stops early or resolves nothing.
    const closure = importClosure(ENGINE_INDEX);
    expect(closure).toContain(FILE_INSPECTION);
    expect(closure).toContain(DATA_CLASS);
    expect(closure.length).toBeGreaterThan(5);
  });

  it("reachMayProcess is the only function that grants a provider anything", () => {
    const definitions = ALL_SOURCES.filter((f) => /export function reachMayProcess/.test(sourceOf(f)));
    expect(definitions.map(shortName)).toEqual([shortName(DATA_CLASS)]);

    // One gate, one call site. A second caller is not automatically wrong, and
    // it is exactly the change that has to be read by a person rather than
    // discovered later, so it fails here on purpose.
    const callers = ALL_SOURCES.filter(
      (f) => f !== DATA_CLASS && codeOf(f).includes("reachMayProcess")
    );
    expect(callers.map(shortName)).toEqual([shortName(COMPILE)]);

    /**
     * And the reach itself is named in code in exactly three places: the table
     * that declares it, the type that spells it, and the one rule that consults
     * it. A fourth is a second authority on who may receive client data.
     */
    const namesTheReach = ALL_SOURCES.filter((f) => /["'`]provider["'`]/.test(codeOf(f)));
    expect(namesTheReach.map(shortName).sort()).toEqual(
      [
        shortName(VOCABULARY),
        shortName(DATA_CLASS),
        shortName(COMPILE),
        // This is an operational stop scope, not a data-reach authority. It
        // can only deny dispatch and contains no provider client or reach call.
        shortName(MODEL_GATEWAY_BREAKERS),
        // The admin action may name the same operational stop scope. It is
        // authenticated before mutation and never grants data reach.
        shortName(ADMIN_MODEL_GATEWAY_ACTION),
      ].sort()
    );
    expect(codeOf(MODEL_GATEWAY_BREAKERS)).not.toContain("reachMayProcess");
    expect(codeOf(ADMIN_MODEL_GATEWAY_ACTION)).not.toContain("reachMayProcess");
  });

  it("every provider-reach capability is refused on every class but public_business", () => {
    /**
     * ITERATED OVER THE TABLE, NOT OVER A LIST OF IDS. The capability that will
     * break this rule has not been written yet, so naming today's two would
     * pin the wrong thing: what must hold is a property of the reach, whatever
     * carries it tomorrow.
     */
    let checked = 0;
    for (const id of PROVIDER_IDS) {
      for (const cls of DATA_CLASSES) {
        const allowed = reachMayProcess(PLAN_PRIMITIVE_REACH[id], cls);
        expect(
          allowed,
          `${id} reaches a provider, and ${cls} is not public_business. ${TRAP}`
        ).toBe(cls === "public_business");

        const out = compileDecisions(
          [
            {
              planStepId: "pin",
              order: 1,
              title: "step",
              executor: "ai",
              primitiveId: id,
              primitiveVersion: PLAN_PRIMITIVES[id],
              dependsOnOrder: [],
              params: parsePrimitiveParams(id, {}) ?? {},
            },
          ],
          { sensitiveData: false, requiredAccessCount: 0, dataClass: cls }
        );
        if (cls !== "public_business") {
          expect(
            out.steps[0].executionMode,
            `${id} compiled to automation on ${cls}. ${TRAP}`
          ).toBe("human");
        }
        checked += 1;
      }
    }
    expect(checked).toBe(PROVIDER_IDS.length * DATA_CLASSES.length);
  });

  it("and the same capabilities do automate on public business data, so the refusals mean something", () => {
    /**
     * Without this the loop above would pass on a compiler that refused
     * everything, and the pin would be reassuring noise. Restricted to the
     * capabilities whose params are satisfiable by an empty object, because a
     * future provider capability with required params would otherwise fail
     * here for a reason that has nothing to do with reach.
     */
    const exercisable = PROVIDER_IDS.filter((id) => parsePrimitiveParams(id, {}) !== null);
    expect(exercisable.length).toBeGreaterThanOrEqual(1);

    for (const id of exercisable) {
      const out = compileDecisions(
        [
          {
            planStepId: "pin",
            order: 1,
            title: "step",
            executor: "ai",
            primitiveId: id,
            primitiveVersion: PLAN_PRIMITIVES[id],
            dependsOnOrder: [],
            params: {},
          },
        ],
        { sensitiveData: false, requiredAccessCount: 0, dataClass: "public_business" }
      );
      expect(out.steps[0].executionMode, `${id} cannot be automated at all`).toBe("automated");
    }
  });
});

describe("provider clients form a closed set whose closure never reaches the local inspection", () => {
  /**
   * THE COMPANION PIN THE FIRST ONE COULD NOT BE.
   *
   * The pin above proves the EXISTING inspection modules never authorise a
   * provider. It cannot see a NEW module that writes
   * \`if (scanClean) allowProvider = true\` and builds its own Anthropic
   * client, because a file that does not exist yet has no imports to scan.
   *
   * So this one comes at the trap from the other side: the set of modules
   * allowed to CONSTRUCT a provider client is closed and named, adding one is
   * a deliberate edit to this list, and the local import closure of each is
   * walked to prove it never reaches file-inspection or the data-class
   * classifier. A future module cannot consult the sampled scan on its way to
   * a provider without either joining this list (a reviewed decision) or
   * failing the closure walk.
   *
   * A clean sample proves nothing about row 8000. "Scan clean" may never
   * become "provider eligible" without a NEW policy, and this test is where
   * that sentence is enforced rather than remembered.
   */
  const PROVIDER_CLIENT_MODULES = [
    join("src", "lib", "ai.ts"),
    join("src", "lib", "assistant-ai.ts"),
    join("src", "lib", "closed-job-analysis.ts"),
    join("src", "lib", "embeddings.ts"),
    join("src", "lib", "ai-work-engine", "classify.ts"),
    join("src", "lib", "ai-work-engine", "critique.ts"),
    join("src", "lib", "ai-work-engine", "metered-call.ts"),
    join("src", "lib", "ai-work-engine", "plan.ts"),
    join("src", "lib", "ai-work-engine", "stage-usage.ts"),
    join("src", "lib", "ai-work-engine", "primitives", "extract.ts"),
    join("src", "lib", "ai-work-engine", "primitives", "research.ts"),
    // 1E-beta1: the fetch adapter. Its closure is deliberately tiny —
    // domain-policy (pure), metered-call, settings, types — and the walk
    // below is what keeps it that way.
    join("src", "lib", "ai-work-engine", "primitives", "fetch.ts"),
  ];
  /**
   * `codecs` joined the forbidden set in 1E-beta1: a provider-client module
   * whose closure could parse client file BYTES would be one convenience
   * re-export away from putting spreadsheet content into a prompt. The
   * mixing rule refuses that at plan level; this makes it unreachable at
   * module level too.
   */
  const FORBIDDEN_IN_CLOSURE = ["file-inspection", "data-class", "codecs"];
  const ROOT2 = join(__dirname, "..");

  function walkDir(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walkDir(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  it("the allowlist is exact: no module outside it builds a provider client", () => {
    const offenders: string[] = [];
    for (const file of walkDir(join(ROOT2, "src"))) {
      const source = readFileSync(file, "utf8");
      if (!/@anthropic-ai\/sdk|api\.voyageai\.com/.test(source)) continue;
      const rel = relative(ROOT2, file);
      if (!PROVIDER_CLIENT_MODULES.includes(rel)) offenders.push(rel);
    }
    expect(
      offenders,
      "A module outside the closed list constructs a provider client. Add it to " +
        "PROVIDER_CLIENT_MODULES only after checking its import closure cannot " +
        "reach the sampled local inspection: a clean sample proves nothing " +
        "about row 8000, so scan-clean must never become provider-eligible " +
        "without a new policy."
    ).toEqual([]);
    // Not vacuous: the list itself is real.
    for (const m of PROVIDER_CLIENT_MODULES) {
      expect(existsSync(join(ROOT2, m)), m + " no longer exists; update the list").toBe(true);
    }
  });

  /**
   * R5.2 — THE FINANCIAL PERIMETER, enforced on the SAME allowlist the
   * security perimeter already uses.
   *
   * The list above answers "may this module talk to a provider at all". This
   * one answers the question R5.2 exists to close: "and is that call
   * accounted for before it leaves". Every entry must declare HOW it is
   * metered, and the declaration is checked against the real source — so a
   * future developer who adds a provider call has to either wire it into the
   * account-spend boundary or consciously write a lie in this table.
   *
   *   type-only               constructs no client (import type only)
   *   metered-call            dispatches through meteredCall, and its runner
   *                           reserves account capacity around it
   *   account-spend-at-caller the named caller reserves before dispatching
   *
   * `account-spend-at-caller` exists because R5 deliberately kept the
   * reservation in the DB-coupled orchestrator rather than in the stage
   * modules, so those stay pure and directly testable without a database.
   */
  const METERED_BY_METERED_CALL = "metered-call" as const;
  const TYPE_ONLY = "type-only" as const;
  const METERING: Record<string, typeof TYPE_ONLY | typeof METERED_BY_METERED_CALL | string> = {
    [join("src", "lib", "ai-work-engine", "metered-call.ts")]: TYPE_ONLY,
    [join("src", "lib", "ai-work-engine", "stage-usage.ts")]: TYPE_ONLY,
    [join("src", "lib", "ai-work-engine", "primitives", "research.ts")]: METERED_BY_METERED_CALL,
    [join("src", "lib", "ai-work-engine", "primitives", "extract.ts")]: METERED_BY_METERED_CALL,
    [join("src", "lib", "ai-work-engine", "primitives", "fetch.ts")]: METERED_BY_METERED_CALL,
    // Phase 1A stages + the embedding provider: reserved by the orchestrator.
    [join("src", "lib", "ai-work-engine", "classify.ts")]: join("src", "lib", "ai-work-engine", "index.ts"),
    [join("src", "lib", "ai-work-engine", "plan.ts")]: join("src", "lib", "ai-work-engine", "index.ts"),
    [join("src", "lib", "ai-work-engine", "critique.ts")]: join("src", "lib", "ai-work-engine", "index.ts"),
    [join("src", "lib", "embeddings.ts")]: join("src", "lib", "ai-work-engine", "index.ts"),
    // R5.2's newly covered surfaces: reserved in their server actions.
    [join("src", "lib", "ai.ts")]: join("src", "server", "actions", "intake.ts"),
    [join("src", "lib", "assistant-ai.ts")]: join("src", "server", "actions", "va-assistant.ts"),
    [join("src", "lib", "closed-job-analysis.ts")]: join("src", "server", "actions", "admin-closed-jobs.ts"),
  };

  it("R5.2 — every provider-client module declares how it is metered, and the declaration is true", () => {
    // 1. The two lists cannot drift apart: a new provider module must make an
    //    explicit metering decision, it cannot simply be added to one list.
    expect(
      PROVIDER_CLIENT_MODULES.filter((m) => !(m in METERING)),
      "A provider-client module has no metering declaration. Decide how its " +
        "spend is accounted BEFORE allowing the call — that is the whole point of R5.2."
    ).toEqual([]);
    expect(
      Object.keys(METERING).filter((m) => !PROVIDER_CLIENT_MODULES.includes(m)),
      "A metering declaration names a module that is no longer a provider client."
    ).toEqual([]);

    const read = (rel: string) => readFileSync(join(ROOT2, rel), "utf8").replace(/\r\n/g, "\n");

    for (const [rel, mechanism] of Object.entries(METERING)) {
      const source = read(rel);
      const constructsClient = /new Anthropic\(/.test(source) || /fetch\("https:\/\/api\.voyageai\.com/.test(source);

      if (mechanism === TYPE_ONLY) {
        expect(constructsClient, `${rel} is declared type-only but builds a provider client`).toBe(false);
        continue;
      }

      // 2. Anything not type-only really does dispatch, and must never let the
      //    SDK retry behind the ledger's back (the R5.1 doctrine).
      //
      //    Comments are STRIPPED before the check. Without that, a doc comment
      //    that merely mentions `maxRetries: 0` — which the one in ai.ts does,
      //    explaining the rule — satisfies a naive `toContain` even while the
      //    code below it says 1. That false negative was observed, not
      //    theorised: it silently swallowed a deliberate mutation test.
      expect(constructsClient, `${rel} is declared metered but constructs no client`).toBe(true);
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const constructions = code.match(/new Anthropic\(\{[^}]*\}\)/g) ?? [];
      if (/new Anthropic\(/.test(code)) {
        expect(constructions.length, `${rel}: could not parse its Anthropic construction`).toBeGreaterThan(0);
      }
      for (const construction of constructions) {
        expect(construction, `${rel}: a metered client must set maxRetries: 0`).toContain("maxRetries: 0");
        expect(construction, `${rel}: must never re-enable SDK retries`).not.toMatch(/maxRetries:\s*[1-9]/);
      }

      if (mechanism === METERED_BY_METERED_CALL) {
        expect(source, `${rel} must dispatch through meteredCall`).toContain("metered-call");
        continue;
      }

      // 3. `account-spend-at-caller`: the named caller must really reserve.
      const callerSource = read(mechanism);
      expect(
        callerSource,
        `${rel} is declared as reserved by ${mechanism}, which does not import the account-spend boundary`
      ).toContain("@/server/account-spend");
      expect(
        callerSource,
        `${rel} is declared as reserved by ${mechanism}, which never calls reserveAccountProviderSpend`
      ).toContain("reserveAccountProviderSpend(");
    }
  });

  it("R5.2 — the runner that hosts meteredCall primitives reserves account capacity", () => {
    const runner = readFileSync(join(ROOT2, "src", "server", "workflow-runs.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(runner).toContain("@/server/account-spend");
    expect(runner).toContain("reserveAccountProviderSpend(");
  });

  it("no provider-client module can reach the inspection, even transitively", () => {
    /** Local-alias imports of one file, resolved to repo-relative paths. */
    function localImportsOf(file: string): string[] {
      const source = readFileSync(file, "utf8");
      const out: string[] = [];
      for (const m of source.matchAll(/from\s+"(@\/[^"]+)"/g)) {
        const base = join(ROOT2, "src", m[1].slice(2));
        for (const cand of [base + ".ts", base + ".tsx", join(base, "index.ts")]) {
          if (existsSync(cand)) {
            out.push(cand);
            break;
          }
        }
      }
      return out;
    }

    let totalVisited = 0;
    for (const entry of PROVIDER_CLIENT_MODULES) {
      const seen = new Set<string>();
      const queue = [join(ROOT2, entry)];
      while (queue.length > 0) {
        const file = queue.pop() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        const rel = relative(ROOT2, file);
        for (const needle of FORBIDDEN_IN_CLOSURE) {
          expect(
            rel.includes(needle),
            entry +
              " transitively imports " +
              rel +
              ": a provider-client module may never see the sampled inspection. " +
              "A clean sample proves nothing about row 8000; scan-clean must " +
              "never become provider-eligible without a new policy."
          ).toBe(false);
        }
        queue.push(...localImportsOf(file));
      }
      totalVisited += seen.size;
    }
    /**
     * Not vacuous: the walk actually follows imports. Asserted across the
     * whole set rather than per entry, because a module like ai.ts is a
     * legitimate leaf (its header even says nothing else imports the SDK),
     * and a per-entry floor would punish exactly the isolation this test
     * wants more of.
     */
    expect(totalVisited).toBeGreaterThan(PROVIDER_CLIENT_MODULES.length * 2);
  });
});


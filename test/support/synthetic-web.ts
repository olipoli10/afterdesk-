/**
 * A SYNTHETIC WEB, SO THE ZERO-COST PATH CAN REACH A DELIVERABLE.
 *
 * `replay` answers a request the provider has already been paid for. That is
 * the right default and it costs nothing, but it cannot exercise a scenario
 * nobody has recorded yet — and recording the whole L3 corpus live is exactly
 * the twenty-dollar habit the firewall exists to end.
 *
 * So this module simulates the OTHER side of the provider boundary. It is a
 * fixed world of organisations, the pages that publish facts about them, and
 * the search engine that finds those pages. Given a request, it returns what a
 * provider would have returned — in the provider's own wire shapes — and then
 * gets out of the way.
 *
 * ── WHAT IT MAY AND MAY NOT DO ──
 *
 * It may decide what the web says. It may NOT decide what AfterDesk does with
 * it. Every guard downstream runs for real against these answers:
 *
 *   - extract's `seenUrls` filter still drops any source url research did not
 *     record, so the responder builds its rows from the evidence in the
 *     request rather than from its own world;
 *   - web.fetch's exact-match candidate check still runs, so the responder
 *     fetches only urls the primitive itself listed;
 *   - split.exceptions still applies the two-source bar in code, so the
 *     verified/needs-review split is a MEASUREMENT of the pipeline, not a
 *     number this file wrote.
 *
 * That is the line: the boundary is simulated, the engine is not.
 *
 * ── WHY THE USAGE NUMBERS ARE NOT ZERO ──
 *
 * A synthetic response reports realistic token and tool counts, so the budget
 * machinery — reserve, settle, ceiling, pause — is genuinely exercised. Those
 * micros are SIMULATED and never leave a bank account; the real spend is the
 * one `ProviderBudget` counts, and the harness asserts it at zero. Reporting
 * zero usage here would be cheaper to explain and would leave the run's whole
 * economic path untested, which is most of what L3 is for.
 *
 * NOTHING HERE IS EVIDENCE ABOUT MODEL BEHAVIOUR. Every organisation is
 * invented, every domain is `.example` (RFC 2606, unroutable). What a real
 * model would say is a question for live mode and for the corpus it records.
 */

export type SyntheticUnit = {
  name: string;
  /** Field name to published value. Missing keys become null downstream. */
  values: Record<string, string>;
  /** The hosts that publish this unit. One host = below the two-source bar. */
  hosts: string[];
};

export type SyntheticWorld = {
  id: string;
  /** A distinctive phrase of the mandate's own brief, used to route. */
  match: string;
  /** Host prefix. Also how `extract` — which never sees the brief — routes. */
  hostTag: string;
  /** The field names the client asked for, verbatim. */
  fields: string[];
  units: SyntheticUnit[];
};

/** Declared BEFORE any run, and computed from the world rather than typed. */
export type WorldTruth = {
  units: number;
  /** Every field two-sourced: split.exceptions must call these `verified`. */
  expectedVerified: number;
  /** Single-sourced: a person must find the second source. */
  expectedNeedsReview: number;
  distinctUrls: number;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * The url a unit's facts live at. Two hosts for most units and one for every
 * fifth, which is what gives the run a realistic — and pre-declared — split
 * between what the machine can finish and what a person still has to.
 */
export function urlsFor(world: SyntheticWorld, unit: SyntheticUnit): string[] {
  return unit.hosts.map((h) => `https://${h}/${slug(unit.name)}`);
}

function makeUnits(
  hostTag: string,
  count: number,
  fields: string[],
  value: (field: string, i: number, name: string) => string,
  name: (i: number) => string
): SyntheticUnit[] {
  return Array.from({ length: count }, (_, i) => {
    const unitName = name(i);
    const values: Record<string, string> = {};
    for (const f of fields) values[f] = value(f, i, unitName);
    // Every fifth unit is published in only one place.
    const hosts =
      i % 5 === 0
        ? [`registry.${hostTag}.example`]
        : [`registry.${hostTag}.example`, `directory.${hostTag}.example`];
    return { name: unitName, values, hosts };
  });
}

const PREFIX = [
  "Northgate", "Verdant", "Kestrel", "Aubier", "Meridian", "Stonebrook",
  "Larkspur", "Cobalt", "Ferrous", "Aldridge", "Brambleton", "Cypress",
  "Dunmore", "Elmwood", "Foxglove", "Granite", "Harrowgate", "Ironvale",
  "Juniper", "Kirkwall", "Lambert", "Mossley", "Nordvik", "Oakhurst",
  "Pinehaven", "Quarrystone", "Redbridge", "Sableford", "Thornbury", "Umberly",
];
const QC_CITY = ["Montreal", "Laval", "Longueuil", "Quebec", "Sherbrooke", "Gatineau"];
const ON_CITY = ["Toronto", "Mississauga", "Hamilton", "Ottawa", "London", "Windsor"];
const CA_CITY = ["Toronto", "Vancouver", "Montreal", "Calgary", "Halifax", "Winnipeg"];
const PROVINCE = ["ON", "BC", "QC", "AB", "NS", "MB"];
const US_CITY = ["Chicago", "Columbus", "Indianapolis", "Milwaukee", "Des Moines", "Detroit"];
const PACK = ["corrugated", "pallets", "stretch wrap"];

const named = (i: number, suffix: string) => `${PREFIX[i % PREFIX.length]} ${suffix} ${Math.floor(i / PREFIX.length) + 1}`;

export const SYNTHETIC_WORLDS: SyntheticWorld[] = [
  {
    id: "W1",
    match: "still operating",
    hostTag: "qcbuild",
    fields: ["company", "city", "website", "contact"],
    units: makeUnits(
      "qcbuild",
      45,
      ["company", "city", "website", "contact"],
      (f, i, name) =>
        f === "company"
          ? name
          : f === "city"
            ? QC_CITY[i % QC_CITY.length]
            : f === "website"
              ? `https://${slug(name)}.example`
              : `info@${slug(name)}.example`,
      (i) => named(i, "Construction")
    ),
  },
  {
    id: "W2",
    match: "industrial packaging",
    hostTag: "onpack",
    fields: ["company", "city", "website", "phone", "category"],
    units: makeUnits(
      "onpack",
      50,
      ["company", "city", "website", "phone", "category"],
      (f, i, name) =>
        f === "company"
          ? name
          : f === "city"
            ? ON_CITY[i % ON_CITY.length]
            : f === "website"
              ? `https://${slug(name)}.example`
              : f === "phone"
                ? `416-555-${String(2000 + i).slice(-4)}`
                : PACK[i % PACK.length],
      (i) => named(i, "Packaging")
    ),
  },
  {
    id: "W3",
    match: "independent bookshops",
    hostTag: "books",
    fields: ["shop_name", "city", "province", "website", "phone", "storefront"],
    units: makeUnits(
      "books",
      80,
      ["shop_name", "city", "province", "website", "phone", "storefront"],
      (f, i, name) =>
        f === "shop_name"
          ? name
          : f === "city"
            ? CA_CITY[i % CA_CITY.length]
            : f === "province"
              ? PROVINCE[i % PROVINCE.length]
              : f === "website"
                ? `https://${slug(name)}.example`
                : f === "phone"
                  ? `604-555-${String(3000 + i).slice(-4)}`
                  : i % 7 === 0
                    ? "online only"
                    : "yes",
      (i) => named(i, "Books")
    ),
  },
  {
    id: "W4",
    match: "runs operations",
    hostTag: "midwest",
    fields: ["company", "contact_name", "title", "work_email"],
    units: makeUnits(
      "midwest",
      30,
      ["company", "contact_name", "title", "work_email"],
      (f, i, name) =>
        f === "company"
          ? name
          : f === "contact_name"
            ? `${PREFIX[(i * 7) % PREFIX.length]} Reid`
            : f === "title"
              ? ["Director of Operations", "VP Operations", "Operations Manager"][i % 3]
              : // A company address, never a personal one: the brief said
                // business contacts only and the world honours that.
                `operations@${slug(name)}.example`,
      (i) => `${PREFIX[i % PREFIX.length]} Logistics ${US_CITY[i % US_CITY.length]}`
    ),
  },
  {
    id: "W5",
    match: "project-management tools",
    hostTag: "pmtools",
    fields: ["tool", "plan", "monthly_price_per_seat", "free_tier"],
    /**
     * One row PER PLAN, not per vendor — which is the mandate's own success
     * criterion, and therefore a thing the world must make possible to get
     * wrong. Ten tools, three plans each.
     */
    units: (() => {
      const tools = [
        "Asana", "Monday.com", "ClickUp", "Wrike", "Smartsheet",
        "Teamwork", "Basecamp", "Notion", "Airtable", "Trello",
      ];
      const plans = ["Starter", "Business", "Enterprise"];
      const out: SyntheticUnit[] = [];
      tools.forEach((tool, t) => {
        plans.forEach((plan, p) => {
          const i = t * plans.length + p;
          const tag = slug(`${tool} ${plan}`);
          out.push({
            name: `${tool} — ${plan}`,
            values: {
              tool,
              plan,
              monthly_price_per_seat: `$${[11, 24, 45][p]}`,
              free_tier: p === 0 ? "yes" : "no",
            },
            hosts:
              i % 5 === 0
                ? [`pricing.pmtools.example`]
                : [`pricing.pmtools.example`, `review.pmtools.example`],
          });
          void tag;
        });
      });
      return out;
    })(),
  },
];

export function worldTruth(world: SyntheticWorld): WorldTruth {
  const verified = world.units.filter((u) => u.hosts.length >= 2).length;
  const urls = new Set(world.units.flatMap((u) => urlsFor(world, u)));
  return {
    units: world.units.length,
    expectedVerified: verified,
    expectedNeedsReview: world.units.length - verified,
    distinctUrls: urls.size,
  };
}

export function worldByMatch(text: string): SyntheticWorld | null {
  return SYNTHETIC_WORLDS.find((w) => text.includes(w.match)) ?? null;
}

/** How `extract` finds its world: it never sees the brief, only the urls. */
export function worldByUrls(text: string): SyntheticWorld | null {
  return SYNTHETIC_WORLDS.find((w) => text.includes(`.${w.hostTag}.example`)) ?? null;
}

/* ───────────────────────── the provider wire shapes ───────────────────────── */

/**
 * Usage numbers a call of this size would plausibly report. SIMULATED — they
 * drive the run's cost accounting and its budget holds, and they cost nothing.
 */
function usage(over: {
  inputTokens: number;
  outputTokens: number;
  searches?: number;
  fetches?: number;
}) {
  return {
    input_tokens: over.inputTokens,
    output_tokens: over.outputTokens,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    server_tool_use: {
      web_search_requests: over.searches ?? 0,
      web_fetch_requests: over.fetches ?? 0,
    },
  };
}

function message(model: string, content: unknown[], u: ReturnType<typeof usage>) {
  return {
    id: "msg_synthetic",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: u,
  };
}

/**
 * research.web_search — the search engine's own record, plus the researcher's
 * prose.
 *
 * The two carriers are separate on purpose because the primitive treats them
 * differently: `web_search_tool_result` blocks are the API's record of which
 * pages exist and a model cannot forge them, while the text is where the
 * VALUES live. Collapsing them would let the harness hand extract a set of
 * urls research never "saw", and extract's filter would then be untested.
 */
export function researchResponse(world: SyntheticWorld, model: string): Record<string, unknown> {
  const results: { type: string; url: string; title: string; page_age: string }[] = [];
  const lines: string[] = [];
  for (const unit of world.units) {
    for (const url of urlsFor(world, unit)) {
      results.push({
        type: "web_search_result",
        url,
        title: `${unit.name} — listing`,
        page_age: "2026-06-01",
      });
    }
    const facts = world.fields.map((f) => `${f}: ${unit.values[f] ?? "not published"}`).join("; ");
    lines.push(`- ${unit.name} — ${facts} (seen at ${urlsFor(world, unit).join(" and ")})`);
  }
  const narrative =
    `Findings for the brief, one line per organisation, with the page each fact was seen on.\n` +
    lines.join("\n");

  return message(
    model,
    [
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_synthetic", content: results },
      { type: "text", text: narrative, citations: [] },
    ],
    usage({
      inputTokens: 8_000 + results.length * 40,
      outputTokens: Math.min(12_000, 200 + lines.length * 30),
      searches: Math.min(12, Math.max(1, Math.ceil(world.units.length / 8))),
    })
  );
}

/**
 * web.fetch — the pages the primitive itself listed, and only those.
 *
 * The candidate list is read back out of the request rather than regenerated
 * from the world: the primitive's exact-match harvest must be answered with
 * ITS urls, and a responder that invented its own would be testing nothing.
 */
export function fetchResponse(
  world: SyntheticWorld,
  model: string,
  userText: string,
  maxFetches: number
): Record<string, unknown> {
  const candidates = [...userText.matchAll(/^\s*\d+\.\s+(https?:\/\/\S+)$/gm)].map((m) => m[1]);
  const taken = candidates.slice(0, Math.max(0, maxFetches));

  const byUrl = new Map<string, SyntheticUnit>();
  for (const unit of world.units) for (const u of urlsFor(world, unit)) byUrl.set(u, unit);

  const blocks = taken.map((url) => {
    const unit = byUrl.get(url);
    const body = unit
      ? `${unit.name}\n\n` +
        world.fields.map((f) => `${f}: ${unit.values[f] ?? "not published"}`).join("\n") +
        `\n\nThis listing was last reviewed in 2026.`
      : `No entry found for this page.`;
    return {
      type: "web_fetch_tool_result",
      tool_use_id: `srvtoolu_${url.length}`,
      content: {
        type: "web_fetch_result",
        url,
        retrieved_at: "2026-06-01T00:00:00Z",
        content: {
          type: "document",
          title: unit ? `${unit.name} — listing` : "Not found",
          source: { type: "text", media_type: "text/plain", data: body },
        },
      },
    };
  });

  return message(
    model,
    [
      ...blocks,
      {
        type: "text",
        text: `Read ${taken.length} of the ${candidates.length} candidate pages and reported what each says.`,
        citations: [],
      },
    ],
    usage({
      inputTokens: 4_000 + taken.length * 1_200,
      outputTokens: 600,
      fetches: taken.length,
    })
  );
}

/**
 * extract.structured_rows — rows built from THE REQUEST'S evidence list.
 *
 * Two things make this an honest simulation rather than a shortcut. The rows
 * cite only urls that appear in the request, so the engine's `seenUrls` filter
 * has something real to pass. And one deliberately unciteable url is attached
 * to the first row, so the filter's drop counter is exercised on every run
 * instead of sitting at zero and proving nothing.
 */
export function extractResponse(
  world: SyntheticWorld,
  model: string,
  userText: string
): Record<string, unknown> {
  const evidenceUrls = new Set([...userText.matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1]));
  const requested = requestedFieldsIn(userText, world);

  const rows = world.units
    .map((unit) => {
      const mine = urlsFor(world, unit).filter((u) => evidenceUrls.has(u));
      if (mine.length === 0) return null;
      return {
        unit_key: unit.name,
        fields: requested.map((name) => ({
          name,
          value: unit.values[name] ?? null,
          source_urls: mine,
        })),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    // The hallucinated source: a plausible url research never recorded. The
    // engine must drop it, and `unseenSourcesDropped` must say it did.
    rows[0].fields[0].source_urls = [
      ...rows[0].fields[0].source_urls,
      `https://never-seen.${world.hostTag}.example/invented`,
    ];
  }

  const payload = JSON.stringify({ rows });
  return message(
    model,
    [{ type: "text", text: payload, citations: [] }],
    usage({
      inputTokens: Math.ceil(userText.length / 4),
      outputTokens: Math.min(16_000, Math.ceil(payload.length / 4)),
    })
  );
}

/** The field names, exactly as the primitive wrote them into its prompt. */
function requestedFieldsIn(userText: string, world: SyntheticWorld): string[] {
  const head = userText.split("1. SOURCE URLS")[0] ?? "";
  const lines = head
    .replace("FIELDS REQUESTED (use exactly these names)", "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : world.fields;
}

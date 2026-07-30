/**
 * DEV ONLY — fills the worker pool with realistic open tasks so the pool page
 * can be judged at the volume it will actually face. Refuses to run against a
 * non-local database.
 *
 * Idempotent: it first deletes the unclaimed `open` tasks belonging to the demo
 * client, so re-running re-creates the pool rather than doubling it. It never
 * touches a task that a worker has claimed, and never touches real clients.
 *
 *   npm run db:seed:pool
 */
import { PrismaClient, type TaskTier } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_CLIENT_EMAIL = "client.demo@acme-widgets.test";

type Row = {
  slug: string;
  title: string;
  description: string;
  quantity: string | null;
  payout: number;
  /** Days from now until the worker's deadline. */
  dueInDays: number;
  tier?: TaskTier;
};

/**
 * Weighted on purpose: data-cleanup is deliberately the fat drawer, because
 * "one category holds most of the pool" is the case the grouped view exists to
 * survive. A few rows carry no quantity and no deadline — the empty cells in
 * the spec grid have to be seen, not imagined.
 */
const ROWS: Row[] = [
  // ---- data-cleanup (the fat drawer) ----
  { slug: "data-cleanup", title: "Deduplicate 4,000-contact CRM export", description: "Our HubSpot export has grown duplicates over three years of imports. Merge duplicate contacts on email first, then on full name + company. Keep the record with the most complete fields, preserve the earliest created date, and flag anything you merge in a separate column so we can audit it. Return as .xlsx with the original column order intact.", quantity: "4,000 rows", payout: 6600, dueInDays: 2 },
  { slug: "data-cleanup", title: "Normalize supplier addresses to a single format", description: "Supplier list has addresses entered five different ways. Standardize to: street / unit / city / province / postal code as separate columns. Canadian postal codes uppercase with a space. Leave anything genuinely ambiguous in a 'needs review' column rather than guessing.", quantity: "1,250 rows", payout: 4200, dueInDays: 3 },
  { slug: "data-cleanup", title: "Fix broken product SKUs in inventory sheet", description: "About 900 SKUs were mangled by a bad find-replace — trailing hyphens, doubled prefixes, lowercase where they should be upper. Correct pattern is ABC-12345-XX. Fix what is unambiguous, list the rest.", quantity: "900 SKUs", payout: 3800, dueInDays: 1 },
  { slug: "data-cleanup", title: "Remove bounced emails and re-tag the list", description: "Cross-reference the bounce report against the master list, remove hard bounces, tag soft bounces for a retry segment.", quantity: "2,300 rows", payout: 2900, dueInDays: 4 },
  { slug: "data-cleanup", title: "Split combined name column into first and last", description: "One 'Name' column holds everything, including some with middle names, some with suffixes (Jr., III), and about forty with the company name pasted in by mistake. Split correctly and isolate the mistakes.", quantity: "1,800 rows", payout: 2400, dueInDays: 5 },
  { slug: "data-cleanup", title: "Reconcile two overlapping customer exports", description: "Salesforce export and the Shopify export share maybe 60% of records. Produce one merged file with a source column, no duplicates, and a short note on what conflicted.", quantity: "3,100 rows", payout: 5400, dueInDays: 3 },
  { slug: "data-cleanup", title: "Clean up 600 phone numbers to E.164", description: "Mixed formats, some with extensions, some missing country codes (assume +1 unless the area code says otherwise). Extensions go in their own column.", quantity: "600 numbers", payout: 1900, dueInDays: 2 },

  // ---- research ----
  { slug: "research", title: "Find owner emails for 300 dental clinics", description: "List of 300 clinic names and cities attached. For each, find the practice website, the owner or managing dentist's name, and a direct email if one is published. Mark anything you genuinely can't find as unavailable rather than guessing — a wrong email costs us more than a blank.", quantity: "300 clinics", payout: 8800, dueInDays: 4 },
  { slug: "research", title: "Pull pricing pages for 5 competitors into one sheet", description: "Five named competitors. For each tier: name, monthly price, annual price, seat limits, and the three headline features. Screenshot each page and note the date you captured it.", quantity: "5 competitors", payout: 3600, dueInDays: 2 },
  { slug: "research", title: "Compile 2026 trade show list for industrial suppliers", description: "North America only. Need event name, dates, city, venue, exhibitor cost if published, and the application deadline. Anything past its deadline goes in a separate tab.", quantity: "40 events", payout: 4400, dueInDays: 6 },
  { slug: "research", title: "Verify 150 LinkedIn profiles still match their listed role", description: "Our contact list is 18 months old. Check each profile, mark still-current, changed-role, or gone. Where the role changed, record the new title.", quantity: "150 profiles", payout: 4100, dueInDays: 3 },

  // ---- list-building ----
  { slug: "list-building", title: "Build a list of 200 Montreal-area accounting firms", description: "Firms with 5 to 50 employees. Need firm name, website, main phone, office address, and the managing partner's name where it's published. No solo practitioners.", quantity: "200 firms", payout: 6200, dueInDays: 5 },
  { slug: "list-building", title: "Source 80 podcast contacts in the home-services niche", description: "Shows with at least 20 episodes and activity in the last six months. Need show name, host, contact email or booking form URL, and rough audience size if published anywhere.", quantity: "80 shows", payout: 3400, dueInDays: 4 },
  { slug: "list-building", title: "Assemble supplier shortlist for packaging materials", description: "Corrugated and folding carton suppliers serving Quebec and Ontario. Need company, location, minimum order quantity if published, and whether they do custom print.", quantity: "60 suppliers", payout: 2800, dueInDays: 7 },

  // ---- data-entry ----
  { slug: "data-entry", title: "Transcribe 40 PDF invoices into the supplier template", description: "Scanned invoices, mostly clean, a few faxed. Per invoice: supplier, invoice number, date, line items with quantity and unit price, subtotal, tax, total. Template attached — match its columns exactly.", quantity: "40 invoices", payout: 3200, dueInDays: 2 },
  { slug: "data-entry", title: "Key in 120 handwritten intake forms", description: "Scans of paper intake forms. Fields are consistent across all of them. Where handwriting is genuinely illegible, mark the cell rather than guessing — these are client records.", quantity: "120 forms", payout: 4600, dueInDays: 3 },
  { slug: "data-entry", title: "Enter 8 hours of interview audio into the tagging sheet", description: "Six interviews, English, clear audio, one speaker each plus interviewer. Timestamped transcript, then tag each answer against the theme list provided.", quantity: "8 hours", payout: 7400, dueInDays: 5 },
  { slug: "data-entry", title: "Copy last quarter's expense receipts into the ledger sheet", description: "About 200 receipts, photographed. Date, vendor, category, amount, tax, payment method. Flag any that are unreadable or missing a total.", quantity: "200 receipts", payout: 3900, dueInDays: 4 },

  // ---- document-production ----
  { slug: "document-production", title: "Rebuild a 90-page proposal in our template", description: "Client sent a Word proposal in their own formatting. Rebuild it in our InDesign-exported Word template: our heading styles, our table style, our cover page. All content preserved exactly — this is a formatting job, not an editing job.", quantity: "90 pages", payout: 5800, dueInDays: 3 },
  { slug: "document-production", title: "Convert 25 legacy price sheets to the current layout", description: "Old sheets are PDFs from 2019. New layout template attached. Prices stay exactly as they are — do not update anything, we are only restyling.", quantity: "25 sheets", payout: 3300, dueInDays: 5 },
  { slug: "document-production", title: "Assemble a board packet from 11 source documents", description: "Merge into one PDF in the running order given, add a table of contents with page numbers, add continuous page numbering in the footer, bookmark each section.", quantity: null, payout: 2600, dueInDays: 1 },

  // ---- writing ----
  { slug: "writing", title: "Write 12 product descriptions from spec sheets", description: "Industrial fittings. 80 to 120 words each, plain and factual, no marketing adjectives. Every claim must come from the spec sheet — do not add benefits we didn't state.", quantity: "12 products", payout: 4000, dueInDays: 4 },
  { slug: "writing", title: "Draft 6 follow-up email templates for the sales team", description: "One per stage of our pipeline, stages listed in the brief. Short, no jargon, one clear ask each. Merge fields marked with double braces.", quantity: "6 emails", payout: 2700, dueInDays: 3 },
  { slug: "writing", title: "Rewrite the FAQ page in plain language", description: "28 existing questions. Same answers, half the words, grade 8 reading level. Flag any answer that seems factually out of date rather than fixing it yourself.", quantity: "28 questions", payout: 3100, dueInDays: 6 },

  // ---- analysis ----
  { slug: "analysis", title: "Summarize 3 years of sales data into a trend sheet", description: "Monthly totals by product line, year-over-year change, top and bottom five products by growth. One tab of pivots, one tab of charts. No recommendations — just the numbers.", quantity: null, payout: 5200, dueInDays: 4 },
  { slug: "analysis", title: "Compare our shipping costs against three carriers", description: "Rate cards attached for all three. Build a comparison for our actual shipment profile (weights and zones in the second tab). Show cost per shipment and total annual difference.", quantity: null, payout: 4700, dueInDays: 5 },
  { slug: "analysis", title: "Categorize 500 support tickets by root cause", description: "Export attached. Use the eight root-cause buckets in the brief. Anything that genuinely fits none goes to 'other' with a one-line note. Return counts by bucket and by month.", quantity: "500 tickets", payout: 4300, dueInDays: 3 },

  // ---- admin-coordination ----
  { slug: "admin-coordination", title: "Schedule 30 client check-in calls across 3 calendars", description: "Client list with time zones attached. Availability rules in the brief. Send the invites from the shared mailbox, 30 minutes each, no back-to-backs.", quantity: "30 calls", payout: 2500, dueInDays: 2 },
  { slug: "admin-coordination", title: "Chase 45 outstanding W-9 forms", description: "Vendor list attached with contact emails. Two follow-ups maximum per vendor, template provided. Log every send and every reply in the tracking sheet.", quantity: "45 vendors", payout: 2200, dueInDays: 6 },
  { slug: "admin-coordination", title: "Set up 20 new users in the project tool", description: "Names, emails, and role assignments in the sheet. Add each to the right workspaces, send the invite, confirm acceptance, mark the sheet.", quantity: "20 users", payout: 1800, dueInDays: null as unknown as number },

  // ---- high-value (visible only to workers past the score gate) ----
  { slug: "analysis", title: "Full competitive teardown across 12 vendors", description: "Twelve named vendors. Pricing, positioning, feature matrix, published customer counts, and funding history. One synthesis tab at the end. This one goes to the client's board, so sourcing has to be traceable — every figure gets a link.", quantity: "12 vendors", payout: 21000, dueInDays: 7, tier: "high_value" },
  { slug: "research", title: "Verify and enrich 1,000-record acquisition target list", description: "Company list attached. Per record: confirm still operating, revenue band if published, employee count, owner name, and a direct contact. Accuracy matters more than completeness here.", quantity: "1,000 records", payout: 18500, dueInDays: 7, tier: "high_value" },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Refusing to run: DATABASE_URL is not local. This script is dev-only.");
  }

  const client = await prisma.user.findUnique({
    where: { email: DEMO_CLIENT_EMAIL },
    select: { id: true },
  });
  if (!client) {
    throw new Error(`Demo client ${DEMO_CLIENT_EMAIL} not found — seed the demo accounts first.`);
  }

  const categories = await prisma.taskCategory.findMany({ select: { id: true, slug: true } });
  const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const missing = [...new Set(ROWS.map((r) => r.slug))].filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    throw new Error(`These categories are not in the database: ${missing.join(", ")}`);
  }

  // Only unclaimed, still-open demo tasks. A claimed task belongs to a worker
  // and is never touched by a reseed.
  const cleared = await prisma.task.deleteMany({
    where: { clientId: client.id, status: "open", claimedById: null },
  });
  console.log(`Cleared ${cleared.count} previously seeded open task(s).`);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  for (const row of ROWS) {
    await prisma.task.create({
      data: {
        clientId: client.id,
        title: row.title,
        description: row.description,
        quantity: row.quantity,
        status: "open",
        tier: row.tier ?? "standard",
        categoryId: bySlug.get(row.slug)!,
        vaPayoutCents: row.payout,
        // The client price is not what this script is demonstrating, but a
        // priced task has one — 60% payout matches the pricing form's default.
        clientPriceCents: Math.round(row.payout / 0.6),
        vaDeadlineUtc: row.dueInDays ? new Date(now + row.dueInDays * day) : null,
        quotedAt: new Date(now - 2 * day),
        acceptedAt: new Date(now - day),
      },
    });
  }

  console.log(`Created ${ROWS.length} open tasks across ${new Set(ROWS.map((r) => r.slug)).size} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

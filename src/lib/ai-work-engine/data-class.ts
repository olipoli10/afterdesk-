/**
 * WHAT A MANDATE'S DATA IS, AND THEREFORE WHO MAY TOUCH IT.
 *
 * NO IMPORTS IN THIS FILE, deliberately, for the same reason
 * primitive-vocabulary.ts has none: compile.ts is a pure decision core that
 * cannot import anything `server-only`, and a rule the compiler cannot read is
 * a rule that protects nothing. The 1B mode check spent a whole phase as a
 * comment claiming an enforcement that did not exist; this file exists so that
 * mistake is not repeated with something far more dangerous than a mode.
 *
 * ── WHY THIS EXISTS NOW AND NOT BEFORE ──
 *
 * Until 1E-alpha the question was moot. No primitive could read a client file:
 * `PrimitiveContext` had no file access and every run started from an empty
 * payload, so a misclassified mandate leaked nothing whatever the classifier
 * believed. The gate in compile.ts could therefore be a single boolean that
 * killed all automation, and that was proportionate.
 *
 * Ingestion changes the stakes in both directions. It makes the boolean far
 * too blunt — a spreadsheet of SKUs and prices is not a medical record, and
 * refusing to deduplicate it is not caution, it is just refusing work. And it
 * makes the boolean far too weak, because for the first time the bytes of a
 * client's file can reach a step. So the single flag becomes three classes,
 * and the classes are computed from the FILE, not from the brief.
 *
 * ── THE THREE CLASSES, AND ONLY THREE ──
 *
 * `public_business`      Facts about the world that anyone could look up: a
 *                        company's public address, a published price. This is
 *                        what the existing research workflow produces, and the
 *                        only class an external provider may ever receive.
 *
 * `business_confidential` The client's own operational data. Their supplier
 *                        list, their inventory, their CRM export — including
 *                        the business contact details inside it, which is what
 *                        a CRM export IS. Deterministic local code may process
 *                        it. Nothing leaves this machine.
 *
 * `personal_sensitive`   Special categories: government identifiers, financial
 *                        account numbers, health information, payroll, dates
 *                        of birth, credentials. No automation at all, exactly
 *                        as before. A person does the work.
 *
 * The middle class is the entire point of the phase, and also the only place
 * where a reader should be suspicious, so it is worth being explicit: a work
 * email and a work phone number ARE personal data in the regulatory sense, and
 * they land in `business_confidential` rather than `personal_sensitive`. That
 * is not a judgement that they do not matter. It is a judgement that they are
 * the ordinary substance of back-office work, that the platform's own
 * classifier has always drawn the line at "personal data beyond public
 * business contacts", and — the load-bearing part — that in this phase
 * `business_confidential` authorises LOCAL CODE ONLY. No model, no provider,
 * no network. The protection is not that we trust the data; it is that the
 * data cannot go anywhere.
 *
 * ── FAIL-CLOSED, AND WHAT THAT ACTUALLY MEANS HERE ──
 *
 * Every rule below can only ever RAISE the restriction. There is no path that
 * lowers one, and in particular:
 *
 *   Finding no sensitive pattern is not evidence that a file is safe.
 *
 * A clean scan of a file we could not fully parse, of a column we sampled
 * rather than read, or of a name typed in prose, proves nothing at all. So the
 * floor for any mandate carrying a client file is `business_confidential` — a
 * file is the client's own data by definition, and the classifier is never
 * asked to prove otherwise. `public_business` is reachable only by a mandate
 * with no client file in it.
 *
 * Anything we could not inspect — an unreadable file, an unsupported shape, a
 * bound exceeded, a scan that failed — becomes `personal_sensitive`, which
 * means a person does it. Not because it is probably sensitive, but because we
 * do not know, and "do not know" and "safe" must never be the same branch.
 */

export const DATA_CLASSES = [
  "public_business",
  "business_confidential",
  "personal_sensitive",
] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

/** Higher is more restricted. Only ever used to take a maximum. */
const RANK: Record<DataClass, number> = {
  public_business: 0,
  business_confidential: 1,
  personal_sensitive: 2,
};

/** The most restrictive of the given classes. The empty case is the floor. */
export function mostRestrictive(classes: readonly DataClass[]): DataClass {
  let worst: DataClass = "public_business";
  for (const c of classes) if (RANK[c] > RANK[worst]) worst = c;
  return worst;
}

export function isAtLeastAsRestrictive(a: DataClass, b: DataClass): boolean {
  return RANK[a] >= RANK[b];
}

/**
 * HOW FAR A CAPABILITY'S DATA TRAVELS. The safety axis that matters once a
 * step can read client bytes, and a different question from READ/PREPARE:
 * `mode` says whether a capability changes the world, `reach` says who gets to
 * see the input. A capability can be perfectly READ-only and still ship the
 * client's spreadsheet to a third party.
 */
export type CapabilityReach =
  /** Sends its input outside this machine: a model, an API, any network call. */
  | "provider"
  /** Deterministic local code. The input never leaves the process. */
  | "local";

/**
 * The one authorisation rule, stated once.
 *
 * A provider may only ever see `public_business`. Local code may additionally
 * see `business_confidential`. Nothing automated touches `personal_sensitive`.
 *
 * Note what this makes structurally impossible in 1E-alpha: every capability
 * added in this phase is `local`, so no combination of a wrong brief, a wrong
 * classification and a wrong plan can put a client file in front of a
 * provider. The classifier being wrong is a quality problem here, not a
 * disclosure one — which is the only footing on which reading client files was
 * worth shipping at all.
 */
export function reachMayProcess(reach: CapabilityReach, cls: DataClass): boolean {
  if (cls === "personal_sensitive") return false;
  if (cls === "business_confidential") return reach === "local";
  return true;
}

/* ────────────────────────── the local classifier ────────────────────────── */

/**
 * Column names that mean the file carries a special category, whatever its
 * values turn out to look like. Header text is matched case-insensitively
 * against the whole cell, so `sin` does not fire on `business`.
 *
 * English and French, because the client base is both and a French header is
 * not a lesser signal. Deliberately narrow: this list escalates a mandate to
 * human-only, so a false positive costs a person's time and a false negative
 * costs far more. Where the two are in tension the list errs toward firing.
 */
/**
 * Diacritics are folded before any pattern below is consulted, so the patterns
 * themselves are written unaccented ON PURPOSE, not by oversight. Without the
 * fold, "Numero de compte" escalated while "Numéro de compte" sailed through,
 * which made the whole escalation fail-open for exactly the French half of the
 * client base the bilingual list claims to serve. Found by the final
 * adversarial review.
 */
function foldDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * A header is normalised before any pattern below sees it, and the reason is
 * the same class of failure the diacritic fold was written for.
 *
 * Every multi-word pattern in the list is spelled with SPACES — "date of
 * birth", "social security", "account number", "credit card". Real exports do
 * not use spaces. A CSV out of a database says `date_of_birth`, an API export
 * says `dateOfBirth`, a hand-made sheet says `date-of-birth`. And `_` is a word
 * character to a regex engine, so `\bdob\b` and `\bdate of birth\b` both slide
 * straight past `date_of_birth` without a mark. The bilingual header list — the
 * one thing standing between a payroll file and an automated pipeline — was
 * therefore matching only the one spelling humans type by hand.
 *
 * So: fold the accents, split camelCase, turn the separators real files use
 * into spaces, collapse the runs. This only ever makes the list fire MORE
 * often, which is the correct direction for a list whose job is to escalate.
 */
export function normalizeHeader(text: string): string {
  return foldDiacritics(text)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SENSITIVE_HEADER_PATTERNS: RegExp[] = [
  // Government identifiers
  /\b(ssn|social security|sin\b|nas\b|numero d.?assurance sociale|nia\b)\b/i,
  /\b(passport|passeport|driver.?s? licen[cs]e|permis de conduire|national id)\b/i,
  /\b(tax id|tin\b|ein\b|numero fiscal|siren|nif)\b/i,
  // Financial account identifiers (an amount is not sensitive; an account is)
  /\b(iban|swift|bic\b|routing number|account number|numero de compte|sort code)\b/i,
  /\b(credit ?card|card number|carte de credit|numero de carte|cvv|cvc\b|pan\b)\b/i,
  // Payroll and compensation
  /\b(salary|salaire|compensation|remuneration|payroll|paie|wage|hourly rate|bonus)\b/i,
  // Health
  /\b(diagnosis|diagnostic|patient|medical|medicale?|health|sante|prescription|icd-?\d*|insurance (number|id)|assurance maladie)\b/i,
  // Identity beyond business contact
  /\b(date of birth|dob\b|birth ?date|birthday|date de naissance|age\b|gender|genre|sexe|ethnicit|race\b|religion|marital)\b/i,
  // Credentials
  /\b(password|mot de passe|api ?key|secret|token|credential|pin\b)\b/i,
];

/**
 * Value shapes that betray a special category REGARDLESS of the header, which
 * is a much stronger claim than it looks and is why the list is this short.
 *
 * A shape earns a place here only if seeing it in an arbitrary cell, with no
 * idea what the column means, is already enough to stop the mandate. Nine
 * digits in SSN grouping, an IBAN, a Luhn-valid card: those are self-evident.
 *
 * ── WHAT WAS REMOVED, AND WHY IT WAS NEVER A VALUE SIGNAL ──
 *
 * `\b(19|20)\d{2}-\d{2}-\d{2}\b` sat in this list as `date_of_birth`. It is
 * not a date of birth. It is EVERY ISO DATE — `signup_date`, `invoice_date`,
 * `created_at`, `last_checked`, `contract_date`, the timestamp column that
 * every CRM and accounting export in existence carries. One such cell in a
 * sample escalated the entire mandate to human-only, which on a product whose
 * core market is cleaning exported spreadsheets meant the automation was
 * disarmed by the most common column in the corpus.
 *
 * The replacement is not a laxer date regex. It is the correct rule, below: a
 * date value alone proves nothing, and a date value in a column that SAYS
 * birth proves it. Semantics plus value, never value alone.
 */
const SENSITIVE_VALUE_PATTERNS: { kind: string; re: RegExp }[] = [
  // US SSN / Canadian SIN, both nine digits in the same separated shapes.
  { kind: "government_id", re: /\b\d{3}[\s-]\d{2}[\s-]\d{4}\b/ },
  { kind: "government_id", re: /\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/ },
  { kind: "iban", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/ },
];

/**
 * Column names whose birth meaning is real but too loose to escalate a mandate
 * on their own. `birth`, `born`, `naissance` are the words an export uses when
 * it has already said elsewhere what the file is about; they are also words
 * that turn up in company names, place names and product lines.
 *
 * The unambiguous spellings — `date of birth`, `dob`, `birth date`, `birthday`,
 * `date de naissance` — are NOT here. They are in the header list above and
 * escalate on the name alone, with no value needed, because a column called
 * `dob` full of blanks is still a date-of-birth column.
 */
const WEAK_BIRTH_HEADER = /\b(birth|born|naissance|nee? le)\b/i;

/**
 * Date shapes, in the orders real exports write them. Consulted ONLY inside a
 * column the weak list already flagged, which is what lets it be permissive:
 * the discrimination has already been done by the column name, and asking the
 * value to also look like a plausible birth year would discriminate nothing —
 * every year from 1900 to today is one.
 */
const DATE_SHAPED: RegExp[] = [
  /\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
  /\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/,
];

/**
 * A 13-to-19-digit string that satisfies Luhn is a payment card often enough
 * that the mandate stops being automatable. Checked separately from the regex
 * list because the arithmetic is what makes it a signal rather than noise:
 * without Luhn, every order number and EAN in a product catalogue would fire.
 */
function looksLikePaymentCard(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * One column as the inspector saw it: its name, and a bounded sample of the
 * values that live UNDER that name.
 *
 * The association is the point. The inspection used to hand over a flat list of
 * headers and a flat list of values with nothing tying them together, which
 * made "this date is in a column called birth" an unaskable question — and so
 * the only available rule was the value-alone one that misfired on every
 * timestamp column. Keeping the column with its cells is what makes the
 * semantics-plus-value rule expressible at all.
 */
export type InspectedColumn = {
  /** Verbatim, as written in the file. Normalised at match time, not here. */
  header: string;
  /** A bounded sample of this column's own cells. Never the whole column. */
  values: string[];
};

/** What a deterministic pass over one file's columns and sampled values saw. */
export type FileInspection = {
  fileId: string;
  /** False when the file could not be parsed, exceeded a bound, or is an
   *  unsupported shape. An uninspectable file is not a safe file. */
  inspected: boolean;
  columns: InspectedColumn[];
  /** Sampled cells that sat past the last header — ragged rows. They are
   *  scanned by the value-alone shapes, and by nothing that needs a name. */
  unkeyedValues: string[];
};

export type DataClassSignal = {
  cls: DataClass;
  /** Operator-facing, and deliberately free of the value that triggered it. */
  reason: string;
};

export type DataClassInput = {
  /** The classifier's reading of the BRIEF. A declaration, not evidence. */
  declaredSensitive: boolean;
  declaredRequiredAccessCount: number;
  /** Client-supplied files attached to the mandate. */
  fileCount: number;
  inspections: FileInspection[];
};

export type DataClassVerdict = {
  dataClass: DataClass;
  signals: DataClassSignal[];
};

/**
 * The whole decision, in one pure function, from signals a machine can check
 * without asking anyone anything.
 *
 * Order matters only for readability: the result is the maximum of every
 * signal, so no rule can undo another. The reasons are kept because an
 * operator staring at a mandate that refused to automate deserves to know
 * which column did it, and because a wrong escalation is only fixable if it is
 * legible.
 */
export function classifyMandateData(input: DataClassInput): DataClassVerdict {
  const signals: DataClassSignal[] = [];

  if (input.declaredSensitive) {
    signals.push({
      cls: "personal_sensitive",
      reason: "The brief itself describes sensitive records.",
    });
  }
  if (input.declaredRequiredAccessCount > 0) {
    signals.push({
      cls: "personal_sensitive",
      reason: "The mandate needs access to a client system.",
    });
  }

  /**
   * THE FLOOR. A client's own file is their business, full stop — there is no
   * inspection result that makes it public. This is the rule that stops a
   * clean regex pass from being read as a clearance.
   */
  if (input.fileCount > 0) {
    signals.push({
      cls: "business_confidential",
      reason: "The mandate carries client files, which are never public data.",
    });
  }

  if (input.inspections.length < input.fileCount) {
    signals.push({
      cls: "personal_sensitive",
      reason: "At least one attached file produced no inspection result.",
    });
  }

  for (const f of input.inspections) {
    if (!f.inspected) {
      signals.push({
        cls: "personal_sensitive",
        reason: "A file could not be inspected (unsupported shape, unreadable, or over a bound).",
      });
      continue;
    }
    for (const s of [headerSignal(f), valueSignal(f), contextualBirthSignal(f)]) {
      if (s) signals.push(s);
    }
  }

  return {
    dataClass: mostRestrictive(signals.map((s) => s.cls)),
    signals,
  };
}

/** A column NAME that means a special category, whatever its cells hold. */
function headerSignal(f: FileInspection): DataClassSignal | null {
  for (const col of f.columns) {
    if (SENSITIVE_HEADER_PATTERNS.some((re) => re.test(normalizeHeader(col.header)))) {
      return {
        cls: "personal_sensitive",
        reason: `A column name indicates a special category: "${col.header.slice(0, 60)}".`,
      };
    }
  }
  return null;
}

/** A VALUE whose shape is self-evident, wherever in the file it sits. */
function valueSignal(f: FileInspection): DataClassSignal | null {
  const everyValue = [...f.columns.flatMap((c) => c.values), ...f.unkeyedValues];
  for (const v of everyValue) {
    const shape = SENSITIVE_VALUE_PATTERNS.find((p) => p.re.test(foldDiacritics(v)));
    if (shape) {
      return {
        cls: "personal_sensitive",
        reason: `A sampled value matches a ${shape.kind} shape.`,
      };
    }
    if (looksLikePaymentCard(v)) {
      return {
        cls: "personal_sensitive",
        reason: "A sampled value passes the payment-card checksum.",
      };
    }
  }
  return null;
}

/**
 * THE RULE THAT REPLACED THE ISO-DATE FALSE POSITIVE.
 *
 * A loose birth word in the column name, confirmed by a date-shaped value
 * underneath it. Neither half fires alone, on purpose: `birth` in a name with
 * no dates under it is as likely to be a place or a product, and a date with no
 * name saying birth is just a date — which is precisely the reading that
 * disarmed the engine on every export carrying a `created_at`.
 *
 * Note what this does NOT do: it never lowers anything. It is a third way to
 * reach `personal_sensitive`, added to the two above, and the verdict is still
 * the maximum of every signal.
 */
function contextualBirthSignal(f: FileInspection): DataClassSignal | null {
  for (const col of f.columns) {
    if (!WEAK_BIRTH_HEADER.test(normalizeHeader(col.header))) continue;
    if (col.values.some((v) => DATE_SHAPED.some((re) => re.test(v)))) {
      return {
        cls: "personal_sensitive",
        reason:
          `A column named "${col.header.slice(0, 60)}" carries date values, ` +
          `which together indicate a date of birth.`,
      };
    }
  }
  return null;
}

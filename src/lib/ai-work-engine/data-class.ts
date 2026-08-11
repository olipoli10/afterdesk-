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
  /\b(date of birth|dob\b|birth ?date|date de naissance|age\b|gender|genre|sexe|ethnicit|race\b|religion|marital)\b/i,
  // Credentials
  /\b(password|mot de passe|api ?key|secret|token|credential|pin\b)\b/i,
];

/** Value shapes that betray a special category regardless of the header. */
const SENSITIVE_VALUE_PATTERNS: { kind: string; re: RegExp }[] = [
  // US SSN / Canadian SIN, both nine digits in the same separated shapes.
  { kind: "government_id", re: /\b\d{3}[\s-]\d{2}[\s-]\d{4}\b/ },
  { kind: "government_id", re: /\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/ },
  { kind: "iban", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/ },
  { kind: "date_of_birth", re: /\b(19|20)\d{2}[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/ },
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

/** What a deterministic pass over one file's headers and sampled values saw. */
export type FileInspection = {
  fileId: string;
  /** False when the file could not be parsed, exceeded a bound, or is an
   *  unsupported shape. An uninspectable file is not a safe file. */
  inspected: boolean;
  headers: string[];
  /** A bounded sample of cell values. Never the whole file. */
  sampledValues: string[];
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
    for (const h of f.headers) {
      const hit = SENSITIVE_HEADER_PATTERNS.find((re) => re.test(foldDiacritics(h)));
      if (hit) {
        signals.push({
          cls: "personal_sensitive",
          reason: `A column name indicates a special category: "${h.slice(0, 60)}".`,
        });
        break;
      }
    }
    for (const v of f.sampledValues) {
      const shape = SENSITIVE_VALUE_PATTERNS.find((p) => p.re.test(foldDiacritics(v)));
      if (shape) {
        signals.push({
          cls: "personal_sensitive",
          reason: `A sampled value matches a ${shape.kind} shape.`,
        });
        break;
      }
      if (looksLikePaymentCard(v)) {
        signals.push({
          cls: "personal_sensitive",
          reason: "A sampled value passes the payment-card checksum.",
        });
        break;
      }
    }
  }

  return {
    dataClass: mostRestrictive(signals.map((s) => s.cls)),
    signals,
  };
}

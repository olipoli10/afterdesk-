/**
 * The worker homepage speaks two languages: English and Tagalog (labelled
 * FIL). The ARTIFACTS (pool rows, ledger lines, payout slip, the claim card's
 * mono controls) stay English on purpose — real tasks arrive in English, and
 * showing that is honest signaling about what the job requires.
 *
 * Register: natural conversational Tagalog with the loanwords Filipino
 * freelancers actually use (task, payout, review, claim, pool) — never
 * stiff textbook Filipino.
 */

export type WorkersLang = "en" | "tl";

/** "FIL" is the label — Filipino is the language's own name; `tl` is the
    ISO code the URL and cookie carry. */
export const WORKERS_LANGS: { code: WorkersLang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "tl", label: "FIL" },
];

export function workersLangOf(value: string | undefined | null): WorkersLang {
  return value === "tl" ? "tl" : "en";
}

type Dict = {
  nav: { signIn: string; apply: string };
  hero: {
    kill: string;
    h1: string;
    sub: string;
    cta: string;
    micro: string;
    cardCaption: string;
    ghost: [string, string][];
  };
  ch01: { label: string; h2: string; body: string; disclosure: string; bandCaption: string };
  ch02: { label: string; h2: string; kicker: string };
  ch03: {
    label: string;
    h2: string;
    rowPass: string;
    rowReturned: string;
    rowFail: string;
    footnote: string;
  };
  ch04: {
    label: string;
    h2: string;
    schematic: string;
    terms: (maxClaims: number, qcRounds: number) => [string, string][];
  };
  closing: { line1: string; line2: string; cta: string; funnel: string };
  footer: { how: string; signIn: string; sendWork: string };
};

const en: Dict = {
  nav: { signIn: "Sign in", apply: "Apply" },
  hero: {
    kill: "No proposals · No bidding · No commission",
    h1: "The payout is printed before you claim.",
    sub: "Overnight, tasks land priced. Pass review, get paid.",
    cta: "Apply to join the pool",
    micro: "Short application. Real vetting. The pool stays small on purpose.",
    cardCaption: "Example. Every task is priced by hand before it appears.",
    ghost: [
      ["Proposal", "not required"],
      ["Bidding", "none"],
      ["Commission", "$0.00"],
      ["Client calls", "0"],
    ],
  },
  ch01: {
    label: "The pool",
    h2: "One list. Every price already on it.",
    body: "You claim what fits you. Nobody bids against you.",
    disclosure: "Example tasks. Every price is set by hand, per task.",
    bandCaption: "Your day is their night — Manila runs 12 hours ahead of New York.",
  },
  ch02: {
    label: "The slip",
    h2: "What comes out of the printed number.",
    kicker: "The printed number is the number you get.",
  },
  ch03: {
    label: "The bar",
    h2: "The bar is why the money is real.",
    rowPass: "Passes review → paid.",
    rowReturned: "Not right yet → returned with notes.",
    rowFail: "Fails final review → unpaid. Rare, by design.",
    footnote:
      "Revisions are part of the craft, not a strike. A payout is reversed only for a clear error the review missed — rare.",
  },
  ch04: {
    label: "The terms",
    h2: "You never meet the client.",
    schematic: "Everything crosses through the operator. Nothing crosses directly.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `You do the task, not the sales. Up to ${maxClaims} at once.`],
      ["PAYOUT", "The printed number. No invoices to chase."],
      ["REVIEW", `One operator reads every delivery. Sent back with notes, up to ${qcRounds} rounds.`],
      ["IDENTITY", "The client never sees your name."],
      ["SCORE", "No public stars. One reviewer, one rolling score."],
    ],
  },
  closing: {
    line1: "America goes to sleep.",
    line2: "You wake up to paid work.",
    cta: "Apply now",
    funnel:
      "Account → short application → the operator's review → the pool. Not everyone gets in. That's the point.",
  },
  footer: { how: "How it works", signIn: "Sign in", sendWork: "Send work instead" },
};

const tl: Dict = {
  nav: { signIn: "Mag-sign in", apply: "Mag-apply" },
  hero: {
    kill: "Walang proposal · Walang bidding · Walang komisyon",
    h1: "Nakalimbag ang payout bago ka mag-claim.",
    sub: "Magdamag, dumarating ang mga task na may presyo. Pumasa sa review, may bayad.",
    cta: "Mag-apply sa pool",
    micro: "Maikling application. Totoong pagsala. Sadyang maliit ang pool.",
    cardCaption: "Halimbawa. Bawat task ay presyado nang manu-mano bago lumabas.",
    ghost: [
      ["Proposal", "hindi kailangan"],
      ["Bidding", "wala"],
      ["Komisyon", "$0.00"],
      ["Tawag ng client", "0"],
    ],
  },
  ch01: {
    label: "Ang pool",
    h2: "Isang listahan. Nakalagay na ang bawat presyo.",
    body: "Kukunin mo ang bagay sa iyo. Walang makikipag-bidding sa iyo.",
    disclosure: "Mga halimbawang task. Bawat presyo ay itinatakda nang manu-mano, kada task.",
    bandCaption: "Ang araw mo ay gabi nila — 12 oras na nauuna ang Maynila sa New York.",
  },
  ch02: {
    label: "Ang slip",
    h2: "Ano ang lumalabas sa nakalimbag na numero.",
    kicker: "Ang nakalimbag na numero ang numerong makukuha mo.",
  },
  ch03: {
    label: "Ang pamantayan",
    h2: "Ang taas ng pamantayan ang dahilan kung bakit totoo ang pera.",
    rowPass: "Pumasa sa review → bayad.",
    rowReturned: "Hindi pa tama → ibinabalik na may notes.",
    rowFail: "Bagsak sa huling review → walang bayad. Bihira, sadya.",
    footnote:
      "Bahagi ng craft ang revision, hindi ito bawas sa iyo. Babawiin lang ang payout kung may malinaw na pagkakamaling nalampasan ng review — bihira.",
  },
  ch04: {
    label: "Ang mga kondisyon",
    h2: "Hindi mo kailanman makikita ang client.",
    schematic: "Lahat dumadaan sa operator. Walang direktang daanan.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `Ikaw ang gagawa ng task, hindi ng benta. Hanggang ${maxClaims} nang sabay.`],
      ["PAYOUT", "Ang nakalimbag na numero. Walang invoice na hahabulin."],
      [
        "REVIEW",
        `Isang operator ang bumabasa ng bawat delivery. Ibinabalik na may notes, hanggang ${qcRounds} round.`,
      ],
      ["IDENTITY", "Hindi makikita ng client ang pangalan mo."],
      ["SCORE", "Walang public stars. Isang reviewer, isang rolling score."],
    ],
  },
  closing: {
    line1: "Natutulog na ang Amerika.",
    line2: "Gumigising ka sa may bayad na trabaho.",
    cta: "Mag-apply na",
    funnel:
      "Account → maikling application → review ng operator → ang pool. Hindi lahat nakakapasok. Iyon mismo ang punto.",
  },
  footer: { how: "Paano ito gumagana", signIn: "Mag-sign in", sendWork: "Magpadala ng trabaho" },
};

export const WORKERS_I18N: Record<WorkersLang, Dict> = { en, tl };

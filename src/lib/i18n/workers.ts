/**
 * The worker homepage speaks two languages: English and Tagalog. The
 * ARTIFACTS (pool rows, ledger lines, payout slip) stay English on purpose —
 * real tasks arrive in English, and showing that is honest signaling. The
 * marketing voice translates.
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
  hero: { line1: string; line2: string; sub: string; cta: string; micro: string };
  ch01: { label: string; caption: string };
  ch02: { label: string; captions: [string, string, string] };
  ch03: {
    label: string;
    h2: string;
    sub: string;
    barYours: string;
    barTheirs: string;
    steps: (maxClaims: number) => [string, string][];
    footnote: string;
  };
  ch04: {
    label: string;
    h2: string;
    body: string;
    rowPass: string;
    rowReturned: string;
    revisionNote: string;
    rowFail: string;
    closing: string;
  };
  ch05: { label: string; h2: string; there: string; here: string; pairs: [string, string][] };
  ch06: {
    label: string;
    schematic: string;
    terms: (maxClaims: number, qcRounds: number) => [string, string][];
  };
  closing: { cta: string; funnel: string };
  footer: { how: string; signIn: string; sendWork: string };
};

const en: Dict = {
  nav: { signIn: "Sign in", apply: "Apply" },
  hero: {
    line1: "America goes to sleep.",
    line2: "You wake up to paid work.",
    sub: "Priced tasks land overnight, the payout printed on every one. Pass review, get paid.",
    cta: "Apply to join the pool",
    micro: "Short application. Real vetting. The pool stays small on purpose.",
  },
  ch01: {
    label: "The pool",
    caption: "One task's day: claimed 7:22 AM, released after review.",
  },
  ch02: {
    label: "The number you see is the number you get.",
    captions: [
      "Fixed. Printed before you claim.",
      "No commission off your number. $54 on the task is $54 released.",
      "Released when review passes.",
    ],
  },
  ch03: {
    label: "The day",
    h2: "Your working day is their night.",
    sub: "Your morning starts as New York goes quiet.",
    barYours: "Your working hours — Manila",
    barTheirs: "Their working hours — New York, 12 hours behind",
    steps: (maxClaims) => [
      ["7:15 AM", "Approved tasks land in the pool, payouts printed."],
      ["7:22 AM", `You claim. One click, no proposal. Up to ${maxClaims} tasks at once.`],
      ["Daylight", "You work your own hours. Nobody calls, nothing to negotiate."],
      ["4:52 PM", "You deliver. The operator reviews it before the client's morning."],
    ],
    footnote: "Manila anchors the clock. The pool opens wherever your morning is.",
  },
  ch04: {
    label: "The bar",
    h2: "The bar is why the money is real.",
    body: "Every delivery is reviewed before the client sees it. Real prices fund real payouts — the bar is what holds the deal up.",
    rowPass: "Passes review → paid.",
    rowReturned: "Not right yet → returned with notes.",
    revisionNote: "Revisions are part of the craft, not a strike.",
    rowFail: "Fails final review → unpaid. Rare, by design.",
    closing: "Not a page for everyone. That's why the pool is never a crowd.",
  },
  ch05: {
    label: "There, here",
    h2: "No proposals. No bids. No chasing.",
    there: "There",
    here: "Here",
    pairs: [
      ["Write proposals all evening, for free.", "See the payout. Claim. Start."],
      ["Bid against dozens on rate.", "One fixed payout, printed first. A vetted pool, not a crowd."],
      ["Commission comes off your rate.", "The number on the task is the number released."],
      ["Chase invoices across time zones.", "One operator releases every approved payout."],
      [
        "Client calls, scope creep, one more quick revision.",
        "You never meet the client. The operator absorbs all of it.",
      ],
      [
        "Star ratings from strangers.",
        "One reviewer, one rolling score. High scores unlock bigger payouts.",
      ],
    ],
  },
  ch06: {
    label: "The terms",
    schematic: "Everything crosses through the operator. Nothing crosses directly.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `Claim any hour. Up to ${maxClaims} tasks at once.`],
      [
        "PAYOUT",
        "Printed before you claim. Released when review passes. Nothing off the top. Reversed only for a clear missed error — rare.",
      ],
      ["REVIEW", `Sent back with notes, up to ${qcRounds} rounds. A final fail is unpaid.`],
      ["IDENTITY", "You never learn who they are. They never learn who you are."],
      ["SCORE", "1–5, rolling. High scores open the high-value pool."],
    ],
  },
  closing: {
    cta: "Apply now",
    funnel:
      "Account → short application → the operator's review → the pool. Not everyone gets in. That's the point.",
  },
  footer: { how: "How it works", signIn: "Sign in", sendWork: "Send work instead" },
};

const tl: Dict = {
  nav: { signIn: "Mag-sign in", apply: "Mag-apply" },
  hero: {
    line1: "Natutulog na ang Amerika.",
    line2: "Gumigising ka sa may bayad na trabaho.",
    sub: "Dumarating ang mga presyadong task magdamag — nakalimbag na ang payout sa bawat isa. Pumasa sa review, may bayad.",
    cta: "Mag-apply sa pool",
    micro: "Maikling application. Totoong pagsala. Sadyang maliit ang pool.",
  },
  ch01: {
    label: "Ang pool",
    caption: "Isang araw ng isang task: na-claim 7:22 AM, na-release pagkatapos ng review.",
  },
  ch02: {
    label: "Ang numerong nakikita mo ang numerong makukuha mo.",
    captions: [
      "Fixed. Nakalimbag bago ka mag-claim.",
      "Walang komisyong kaltas. Ang $54 sa task ay $54 na ire-release.",
      "Nire-release kapag pumasa ang review.",
    ],
  },
  ch03: {
    label: "Ang araw",
    h2: "Ang araw mo ay gabi nila.",
    sub: "Nagsisimula ang umaga mo habang tumatahimik ang New York.",
    barYours: "Oras ng trabaho mo — Maynila",
    barTheirs: "Oras nila — New York, 12 oras na huli",
    steps: (maxClaims) => [
      ["7:15 AM", "Dumarating sa pool ang mga aprubadong task, nakalimbag ang payout."],
      ["7:22 AM", `Mag-claim ka. Isang click, walang proposal. Hanggang ${maxClaims} task nang sabay.`],
      ["Umaga", "Trabaho sa sarili mong oras. Walang tumatawag, walang tawaran."],
      ["4:52 PM", "Magde-deliver ka. Rine-review ng operator bago mag-umaga ang client."],
    ],
    footnote: "Maynila ang orasan. Bukas ang pool saan man magsimula ang umaga mo.",
  },
  ch04: {
    label: "Ang pamantayan",
    h2: "Ang taas ng pamantayan ang dahilan kung bakit totoo ang pera.",
    body: "Rine-review ang bawat delivery bago ito makita ng client. Totoong presyo ang pumopondo sa totoong payout — ang pamantayan ang humahawak sa usapan.",
    rowPass: "Pumasa sa review → bayad.",
    rowReturned: "Hindi pa tama → ibinabalik na may notes.",
    revisionNote: "Bahagi ng craft ang revision — hindi ito bawas sa iyo.",
    rowFail: "Bagsak sa huling review → walang bayad. Bihira, sadya.",
    closing: "Hindi ito pahina para sa lahat. Kaya hindi kailanman siksikan ang pool.",
  },
  ch05: {
    label: "Doon, dito",
    h2: "Walang proposal. Walang bidding. Walang habulan.",
    there: "Doon",
    here: "Dito",
    pairs: [
      ["Magsusulat ka ng proposal magdamag, libre.", "Tingnan ang payout. I-claim. Simulan."],
      [
        "Makikipag-bidding ka sa dose-dosenang iba.",
        "Isang fixed payout, nakalimbag muna. Sinalang pool, hindi siksikan.",
      ],
      ["May komisyong kinakaltas sa rate mo.", "Ang numero sa task ang numerong ire-release."],
      [
        "Hahabulin mo ang invoice sa iba't ibang timezone.",
        "Isang operator ang nagre-release ng bawat aprubadong payout.",
      ],
      [
        "Tawag ng client, scope creep, isa pang “quick revision”.",
        "Hindi mo kailanman makakausap ang client. Ang operator ang bahala sa lahat.",
      ],
      [
        "Star ratings mula sa mga estranghero.",
        "Isang reviewer, isang rolling score. Mataas na score, mas malaking payout.",
      ],
    ],
  },
  ch06: {
    label: "Ang mga kondisyon",
    schematic: "Lahat dumadaan sa operator. Walang direktang daanan.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `Mag-claim anumang oras. Hanggang ${maxClaims} task nang sabay.`],
      [
        "PAYOUT",
        "Nakalimbag bago ka mag-claim. Nire-release kapag pumasa ang review. Walang kaltas. Babawiin lang kung may malinaw na pagkakamaling nalampasan ng review — bihira.",
      ],
      [
        "REVIEW",
        `Ibinabalik na may notes, hanggang ${qcRounds} round. Walang bayad ang huling bagsak.`,
      ],
      ["IDENTITY", "Hindi mo sila makikilala. Hindi ka nila makikilala."],
      ["SCORE", "1–5, rolling. Mataas na score, bukas ang high-value pool."],
    ],
  },
  closing: {
    cta: "Mag-apply na",
    funnel:
      "Account → maikling application → review ng operator → ang pool. Hindi lahat nakakapasok. Iyon mismo ang punto.",
  },
  footer: { how: "Paano ito gumagana", signIn: "Mag-sign in", sendWork: "Magpadala ng trabaho" },
};

export const WORKERS_I18N: Record<WorkersLang, Dict> = { en, tl };

import "server-only";
import { unzlibSync } from "fflate";

/**
 * PDF identity scrubbing — RULE 1's widest hole.
 *
 * Every desktop exporter (Word, Canva, LibreOffice, Chrome's print dialog)
 * writes the operating-system account name into a PDF's Info dictionary and
 * usually into an XMP packet too, so a worker delivering a PDF was handing the
 * client their real name — on a surface whose entire premise is that neither
 * side learns who the other is.
 *
 * TWO PROPERTIES, AND THE SECOND IS THE LOAD-BEARING ONE:
 *
 *  1. SCRUB, length-preserving. A PDF's cross-reference table is a list of
 *     byte offsets, so a value can only be overwritten in place, never
 *     removed. Best effort by construction: it understands the ordinary
 *     shapes real exporters emit.
 *
 *  2. VERIFY, and fail CLOSED. The scrub is a denylist of syntactic shapes and
 *     will always be incomplete — a name can hide behind an indirect
 *     reference, a `#6F` name escape, attribute-form XMP, or a compressed
 *     object stream. So after scrubbing we re-read the WHOLE artifact — the
 *     plaintext AND every stream we can inflate — with patterns DERIVED FROM
 *     THE SAME KEY LISTS, and refuse the upload if any of them still names
 *     someone.
 *
 * An earlier version of this file verified less than it scrubbed (Title,
 * Subject and Keywords were blanked when visible but silently accepted when
 * compressed) and read its match offsets from a snapshot taken before the
 * edits, which let a hex fill run past its own terminator and destroy a valid
 * page object. Both are why the verifier below is generated from the key lists
 * rather than hand-written, and why every fill is bounds-checked against the
 * live buffer. Refusing a file costs the worker one re-export; shipping one
 * costs the rule.
 */

/** Info-dictionary keys whose values name a person or their machine. */
const INFO_KEYS = [
  "Author",
  "Creator",
  "Producer",
  "Title",
  "Subject",
  "Keywords",
  "Company",
] as const;

/** XMP element names that carry the same thing in the metadata packet. */
const XMP_TAGS = [
  "dc:creator",
  "dc:contributor",
  "dc:publisher",
  "dc:title",
  "dc:subject",
  "dc:description",
  "dc:rights",
  "xmp:CreatorTool",
  "pdf:Producer",
  "pdf:Author",
  "pdfx:Company",
  "xmpRights:Owner",
  "photoshop:AuthorsPosition",
  "photoshop:Credit",
  "stEvt:softwareAgent",
] as const;

/** XMP namespaces whose ATTRIBUTES carry identity in the RDF short form. */
const XMP_ATTR_NS = ["dc", "xmp", "xmpMM", "xmpRights", "pdf", "pdfx", "photoshop", "Iptc4xmpCore"];

const SPACE = 0x20;
const ZERO = 0x30;
const MAX_HEX_BODY = 4096;

const isHexByte = (b: number) =>
  (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
const isSpaceByte = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;

type Range = { from: number; to: number; hex: boolean };

/**
 * Collect every Info-string body to blank, from ONE parse of the original
 * bytes, then drop any match that begins inside an earlier one. That second
 * step is what stops `/Author (x /Title <4A75> y)` — where `/Title` is string
 * CONTENT, not a key — from being treated as a second key and blanking its way
 * across the rest of the object.
 */
function infoRanges(buf: Buffer): Range[] {
  const hay = buf.toString("latin1"); // latin1 keeps 1 byte === 1 char
  const found: Range[] = [];

  for (const key of INFO_KEYS) {
    const re = new RegExp(`/${key}\\s*(\\(|<)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay)) !== null) {
      const from = m.index + m[0].length;
      if (m[1] === "(") {
        let depth = 1;
        let i = from;
        while (i < buf.length) {
          const c = buf[i];
          if (c === 0x5c) {
            i += 2;
            continue;
          }
          if (c === 0x28) depth += 1;
          else if (c === 0x29) {
            depth -= 1;
            if (depth === 0) break;
          }
          i += 1;
        }
        if (depth !== 0) continue; // unbalanced — leave it; the verifier will refuse
        found.push({ from, to: i, hex: false });
      } else {
        // Only blank a body that really is a hex string, and only if its
        // terminator is close by. Without both checks a stale match inside an
        // already-blanked region fills until the next '>' anywhere in the file.
        let i = from;
        let ok = true;
        while (i < buf.length && i - from <= MAX_HEX_BODY) {
          const c = buf[i];
          if (c === 0x3e) break;
          if (!isHexByte(c) && !isSpaceByte(c)) {
            ok = false;
            break;
          }
          i += 1;
        }
        if (!ok || i >= buf.length || buf[i] !== 0x3e || i - from > MAX_HEX_BODY) continue;
        found.push({ from, to: i, hex: true });
      }
    }
  }

  found.sort((a, b) => a.from - b.from);
  const kept: Range[] = [];
  let claimedTo = -1;
  for (const r of found) {
    if (r.from <= claimedTo) continue; // inside a body already being blanked
    kept.push(r);
    claimedTo = r.to;
  }
  return kept;
}

/** Blank XMP text nodes and identity-bearing RDF attributes, in place. */
function blankXmp(out: Buffer) {
  const hay = out.toString("latin1");

  for (const tag of XMP_TAGS) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay)) !== null) {
      const from = m.index + m[0].indexOf(">") + 1;
      const to = from + m[1].length;
      let inTag = false;
      for (let i = from; i < to; i += 1) {
        const c = out[i];
        if (c === 0x3c) inTag = true;
        else if (c === 0x3e) inTag = false;
        else if (!inTag) out[i] = SPACE;
      }
    }
  }

  // Attribute-serialized XMP: <rdf:Description xmp:CreatorTool="Juan" .../>
  const attr = new RegExp(`\\b(?:${XMP_ATTR_NS.join("|")}):[A-Za-z][\\w.-]*\\s*=\\s*("|')`, "g");
  let a: RegExpExecArray | null;
  while ((a = attr.exec(hay)) !== null) {
    const quote = a[1].charCodeAt(0);
    const from = a.index + a[0].length;
    const to = out.indexOf(quote, from);
    if (to === -1 || to - from > MAX_HEX_BODY) continue;
    out.fill(SPACE, from, to);
  }
}

/**
 * The verifier's patterns are BUILT FROM the same lists the scrub uses, so the
 * two can never drift apart — the class of bug where a key is scrubbed when
 * visible and accepted when compressed is now impossible by construction.
 * A name is "surviving" when a key is followed by a body that is not blank.
 */
const INFO_SURVIVES = new RegExp(
  // `<(?!<)` matters: `/Creator << /Nested /Val >>` is a DICTIONARY, not a hex
  // string, and reading it as one refuses a perfectly clean file.
  `/(?:${INFO_KEYS.join("|")})\\s*(?:\\(\\s*(?!\\s*\\))|<(?!<)\\s*(?!(?:0|\\s)*>)|\\d+\\s+\\d+\\s+R)`
);

/**
 * ISO 32000-1 §7.3.5 lets any character of a NAME be written as `#xx`, so
 * `/Auth#6Fr` is `/Author` to every reader while matching no literal pattern.
 * Rather than decode the whole file (which would invent key names out of hex
 * inside content streams), refuse any escaped name that introduces a string:
 * no real exporter obfuscates an Info key, so the only thing this costs is
 * files that were hiding something.
 */
// Both repeats are bounded at 127 — the name-length ISO 32000-1 §7.3.5
// recommends above — so a `/'#41'.repeat(N)` payload with no `(` or `<`
// nearby can no longer make the two adjacent stars backtrack O(N) ways at
// O(N) offsets; the worst case per offset is now a fixed 127*127 instead of
// growing with the input, so total work stays linear in file size.
const ESCAPED_KEY = /\/[A-Za-z0-9#]{0,127}#[0-9A-Fa-f]{2}[A-Za-z0-9#]{0,127}\s*[(<]/;
const XMP_ATTR_SURVIVES = new RegExp(
  `\\b(?:${XMP_ATTR_NS.join("|")}):[A-Za-z][\\w.-]*\\s*=\\s*(?:"\\s*[^"\\s]|'\\s*[^'\\s])`
);

/**
 * An XMP element still names someone when its TEXT survives. Checking with a
 * single regex does not work: `<dc:creator><rdf:Seq><rdf:li>` legitimately
 * keeps its scaffolding after a successful blank, and any pattern loose enough
 * to see leftover text also sees the tag names. So strip the markup and look
 * at what is left.
 */
function xmpNamesSomeone(text: string): boolean {
  for (const tag of XMP_TAGS) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (/\S/.test(m[1].replace(/<[^>]*>/g, ""))) return true;
    }
  }
  return false;
}

function namesSomeone(text: string): boolean {
  return (
    INFO_SURVIVES.test(text) ||
    ESCAPED_KEY.test(text) ||
    xmpNamesSomeone(text) ||
    XMP_ATTR_SURVIVES.test(text)
  );
}

/**
 * Inflate what we can and look for identity we could not rewrite. The budget
 * is on WORK DONE, not on where in the file the payload happens to sit — an
 * earlier version stopped after 400 streams, so hiding a name in the 401st was
 * enough. Exceeding the budget REFUSES rather than accepts.
 */
function streamsNameSomeone(buf: Buffer): boolean {
  const hay = buf.toString("latin1");
  const re = /stream[\r\n]/g;
  let m: RegExpExecArray | null;
  let budget = 64 * 1024 * 1024;
  while ((m = re.exec(hay)) !== null) {
    const start = m.index + m[0].length;
    const end = hay.indexOf("endstream", start);
    if (end === -1) break;
    const body = buf.subarray(start, end);
    if (body.length === 0) continue;
    budget -= body.length;
    if (budget <= 0) return true; // out of budget: refuse, never wave through
    let plain: string;
    try {
      plain = Buffer.from(unzlibSync(body)).toString("latin1");
    } catch {
      continue; // not Flate, or corrupt — nothing we wrote, nothing we can read
    }
    budget -= plain.length;
    if (budget <= 0) return true;
    if (namesSomeone(plain)) return true;
  }
  return false;
}

export class PdfIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfIdentityError";
  }
}

export function scrubPdfIdentity(buffer: Buffer): Buffer {
  const raw = buffer.toString("latin1");
  if (/\/Encrypt\b/.test(raw)) {
    throw new PdfIdentityError(
      "Encrypted PDFs cannot be checked for hidden author details. Save an unprotected copy and upload that."
    );
  }

  const out = Buffer.from(buffer);
  for (const r of infoRanges(out)) {
    out.fill(r.hex ? ZERO : SPACE, r.from, r.to);
  }
  blankXmp(out);

  // Fail closed. Everything the scrub could not reach — an indirect /Author,
  // a #6F name escape, a compressed Info dictionary — lands here and stops.
  if (namesSomeone(out.toString("latin1")) || streamsNameSomeone(out)) {
    throw new PdfIdentityError(
      "This PDF still carries author details we cannot remove without breaking the file. Print it to a new PDF (or export again with document properties cleared) and upload that copy."
    );
  }
  return out;
}

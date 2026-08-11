import { unzipSync, zipSync } from "fflate";
import { neutralizeCsvCell } from "@/lib/ai-work-engine/primitives/pure";
import {
  CODEC_LIMITS,
  decodeUtf8,
  okTable,
  refuse,
  syntheticHeaders,
  validateHeaders,
  type CodecResult,
  type Table,
} from "@/lib/ai-work-engine/codecs/table";

/**
 * XLSX, READ AND WRITTEN WITHOUT AN XLSX LIBRARY.
 *
 * ── WHY fflate AND NOTHING ELSE ──
 *
 * src/lib/file-security.ts ALREADY unzips and rezips every Office file a client
 * uploads, with fflate, to strip identity metadata before a worker ever sees it.
 * The ZIP layer is therefore inside this repository's trust boundary already:
 * the bytes of a hostile archive reach fflate whether this file exists or not,
 * and adding a second ZIP implementation would widen the attack surface rather
 * than narrow it.
 *
 * The spreadsheet layer is a different question, and the answer is the reason
 * this file is long. A general XLSX library is tens of thousands of lines that
 * must understand pivot caches, chart parts, defined names, OLE objects, VML
 * drawings, macro sheets and a decade of producer quirks, and every one of those
 * paths would be executing against bytes a stranger chose. What we actually need
 * is a rectangle of values. So we implement exactly that: an allowlist of parts,
 * a bounded XML scanner, and a refusal for everything else. The code below is
 * auditable in an afternoon, which is a property no dependency here can offer.
 *
 * Pure by construction: no `server-only`, no database, no network, no clock in
 * the decision path. buildXlsx pins the ZIP timestamp to a constant precisely so
 * that writing the same table twice produces the same bytes, because the runner
 * replays steps after a crash and an artifact whose hash changes on replay is an
 * artifact nobody can verify.
 *
 * ── THE STRICT SUBSET WE READ ──
 *
 * REQUIRED    [Content_Types].xml, xl/workbook.xml, xl/_rels/workbook.xml.rels,
 *             and the one selected xl/worksheets/*.xml.
 * READ IF PRESENT  xl/sharedStrings.xml, xl/styles.xml.
 * TOLERATED BUT NEVER INFLATED  _rels/.rels, docProps/*, xl/theme/*,
 *             xl/printerSettings/*, xl/calcChain.xml, other worksheets, and
 *             worksheet relationship parts. None of these can change a cell's
 *             value, and we never read them, so their bytes are inert.
 * EVERYTHING ELSE REFUSES.
 *
 * That last line is stricter than safety alone requires and it is deliberate. A
 * workbook carrying a chart, a drawing, a pivot cache or a "Format as Table"
 * definition is refused even though none of those parts changes a value.
 * "We read exactly this shape and nothing else" is a claim that can be verified
 * against this file; "we ignore the parts we do not understand" is not, and it
 * is the sentence every parser CVE starts from. Widening the list later is a one
 * line change with a test. Narrowing it after clients have relied on it is not.
 */

/* ────────────────────────────── refusal plumbing ───────────────────────────── */

/**
 * Thrown internally, caught at the two public entry points, converted into a
 * `CodecRefusal`. An exception rather than a threaded return value only because
 * the alternative is an `if` after every one of ~60 checks, which is where a
 * missed branch hides. NOTHING ESCAPES: parseXlsx catches this class AND
 * everything else, so a fflate assertion or a RangeError still becomes a
 * refusal rather than a stack trace on an operator's screen.
 */
class CodecBail extends Error {}

function bail(reason: string): never {
  throw new CodecBail(reason);
}

/* ──────────────────────────────── the ZIP layer ─────────────────────────────── */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
/** The maximum an End Of Central Directory record can be from the file end. */
const EOCD_SEARCH_SPAN = 65_557;
/** An xlsx we would read cannot need more parts than this; see the subset. */
const MAX_ZIP_ENTRIES = 1_024;

type ZipEntry = { name: string; uncompressedSize: number };

/**
 * Reads the central directory and NOTHING ELSE. The declared uncompressed size
 * is what fflate allocates when it inflates an entry, so bounding it here is
 * what makes a zip bomb a refusal that allocates nothing rather than an
 * out-of-memory kill: a 40 KB archive declaring four gigabytes never reaches
 * `inflateSync`.
 */
function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) bail("The workbook archive is incomplete.");

  let eocd = -1;
  const floor = Math.max(0, buffer.length - EOCD_SEARCH_SPAN);
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) bail("The workbook archive is incomplete.");

  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (count > MAX_ZIP_ENTRIES) {
    bail(`The workbook archive holds more than ${MAX_ZIP_ENTRIES} parts.`);
  }
  if (centralOffset + centralSize > buffer.length) {
    bail("The workbook archive directory is malformed.");
  }

  const entries: ZipEntry[] = [];
  const seenNames = new Set<string>();
  let cursor = centralOffset;
  let declaredTotal = 0;

  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      bail("The workbook archive directory is malformed.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);

    // Bit 0 of the general purpose flags is the encryption bit. An encrypted
    // member cannot be read, and guessing is not on the menu.
    if ((flags & 0x1) !== 0) {
      bail("The workbook is encrypted or password-protected, so it cannot be read.");
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      bail("ZIP64 workbooks are not accepted.");
    }
    if (method !== 0 && method !== 8) {
      bail("The workbook archive uses a compression method that is not accepted.");
    }

    declaredTotal += uncompressedSize;
    if (uncompressedSize > CODEC_LIMITS.maxBytes || declaredTotal > CODEC_LIMITS.maxBytes) {
      bail(
        `The workbook declares more than ${CODEC_LIMITS.maxBytes} bytes of uncompressed content.`
      );
    }

    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > buffer.length) bail("The workbook archive directory is malformed.");
    const name = buffer.toString("utf8", cursor + 46, nameEnd);
    /**
     * TWO MEMBERS UNDER ONE NAME IS AN ATTACK, NOT AN ACCIDENT. Which copy a
     * reader gets depends on whether it walks the directory forwards or
     * backwards, so an archive carrying both a benign and a hostile
     * `xl/worksheets/sheet1.xml` can show the sanitiser one and this codec the
     * other. There is no reading of a duplicate that is worth supporting.
     */
    if (seenNames.has(name)) bail("The workbook archive names the same part twice.");
    seenNames.add(name);
    entries.push({ name, uncompressedSize });

    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

const ALLOWED_EXACT_PARTS = new Set([
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "docProps/custom.xml",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/sharedStrings.xml",
  "xl/styles.xml",
  "xl/calcChain.xml",
]);

const ALLOWED_PART_PREFIXES = ["xl/worksheets/", "xl/theme/", "xl/printerSettings/"];

function assertPartsAreInSubset(entries: ZipEntry[]): void {
  for (const entry of entries) {
    // Directory members carry a trailing slash and no content.
    if (entry.name.endsWith("/")) continue;
    if (ALLOWED_EXACT_PARTS.has(entry.name)) continue;
    if (ALLOWED_PART_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;
    /**
     * The part name is NOT quoted into the reason. A part name is a structural
     * fact, but `xl/embeddings/Q3 payroll.xlsx` is a client's own words, and a
     * refusal string travels into logs and admin screens that were never scoped
     * to hold the contents of a confidential file.
     */
    bail(
      "The workbook contains a part outside the accepted subset (macros, embedded objects, charts, pivot caches, external links and custom XML are all refused)."
    );
  }
}

function inflateParts(buffer: Buffer, wanted: (name: string) => boolean): Record<string, Uint8Array> {
  try {
    return unzipSync(buffer, { filter: (file) => wanted(file.name) });
  } catch {
    bail("The workbook archive could not be expanded.");
  }
}

function partText(parts: Record<string, Uint8Array>, name: string): string {
  const bytes = parts[name];
  if (bytes === undefined) bail("The workbook is missing a required part.");
  const text = decodeUtf8(bytes);
  if (text === null) bail("A workbook part is not valid UTF-8.");
  return text;
}

/* ─────────────────────────────── the XML scanner ────────────────────────────── */

/**
 * A pull scanner over one XML part. No library, no regex, no DOM: it walks the
 * string once and calls back.
 *
 * The three things it refuses outright are the three that turn an XML parser
 * into a weapon:
 *
 *   <!DOCTYPE / <!ENTITY   internal entity definitions are the billion laughs
 *                          amplification and, with a SYSTEM id, the file-read
 *                          primitive. There is no legitimate xlsx that needs one.
 *   an unknown &entity;    silently dropping it would change a cell's value; the
 *                          five XML built-ins and numeric references are decoded,
 *                          everything else refuses.
 *   unbalanced tags        THE ONE THAT MATTERS MOST. A sheet part cut short
 *                          mid-element still contains whole rows, and a scanner
 *                          without this check would hand them back as a complete
 *                          table: the exact silent truncation this codec exists
 *                          to prevent, arriving through the XML layer instead of
 *                          the row layer. The element stack is tracked so that a
 *                          truncated, mis-nested or over-nested part refuses.
 *
 * Text is handed over RAW and undecoded on purpose. A sheet part is mostly
 * indentation between tags, and running entity decoding over all of it would
 * cost more than the cells do; the handler decodes the fragments it keeps.
 */
type XmlHandler = {
  onStart: (name: string, attributes: string, selfClosing: boolean) => void;
  onEnd: (name: string) => void;
  onText: (raw: string, isCdata: boolean) => void;
};

function isSpaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/** Deeper than any spreadsheetml part goes; a deeper one is not a spreadsheet. */
const MAX_XML_DEPTH = 64;

function scanXml(src: string, handler: XmlHandler): void {
  const n = src.length;
  const open: string[] = [];
  let i = 0;

  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      if (i < n) handler.onText(src.slice(i), false);
      return;
    }
    if (lt > i) handler.onText(src.slice(i, lt), false);

    const marker = src.charCodeAt(lt + 1);

    if (marker === 0x21 /* ! */) {
      if (src.startsWith("<!--", lt)) {
        const end = src.indexOf("-->", lt + 4);
        if (end < 0) bail("A workbook part contains an unterminated XML comment.");
        i = end + 3;
        continue;
      }
      if (src.startsWith("<![CDATA[", lt)) {
        const end = src.indexOf("]]>", lt + 9);
        if (end < 0) bail("A workbook part contains an unterminated CDATA section.");
        handler.onText(src.slice(lt + 9, end), true);
        i = end + 3;
        continue;
      }
      bail("A workbook part declares an XML document type or entity, which is not accepted.");
    }

    if (marker === 0x3f /* ? */) {
      const end = src.indexOf("?>", lt + 2);
      if (end < 0) bail("A workbook part contains an unterminated XML declaration.");
      i = end + 2;
      continue;
    }

    if (marker === 0x2f /* / */) {
      const gt = src.indexOf(">", lt + 2);
      if (gt < 0) bail("A workbook part contains an unterminated XML tag.");
      const closing = src.slice(lt + 2, gt).trim();
      if (open.pop() !== closing) bail("A workbook part has mismatched XML tags.");
      handler.onEnd(closing);
      i = gt + 1;
      continue;
    }

    // A start tag. `>` inside a quoted attribute value is not the tag's end, so
    // the quote state has to be tracked rather than indexOf'd past.
    let j = lt + 1;
    let quote = 0;
    let gt = -1;
    while (j < n) {
      const code = src.charCodeAt(j);
      if (quote !== 0) {
        if (code === quote) quote = 0;
      } else if (code === 0x22 || code === 0x27) {
        quote = code;
      } else if (code === 0x3e /* > */) {
        gt = j;
        break;
      }
      j++;
    }
    if (gt < 0) bail("A workbook part contains an unterminated XML tag.");

    let nameEnd = lt + 1;
    while (nameEnd < gt) {
      const code = src.charCodeAt(nameEnd);
      if (isSpaceCode(code) || code === 0x2f) break;
      nameEnd++;
    }
    const name = src.slice(lt + 1, nameEnd);
    const selfClosing = src.charCodeAt(gt - 1) === 0x2f;
    const attributes = src.slice(nameEnd, selfClosing ? gt - 1 : gt);

    if (!selfClosing) {
      if (open.length >= MAX_XML_DEPTH) {
        bail("A workbook part nests XML elements deeper than this codec accepts.");
      }
      open.push(name);
    }
    handler.onStart(name, attributes, selfClosing);
    // A self-closing element is a start immediately followed by its end, so the
    // handlers never need a separate code path for `<c r="A1"/>` or `<f/>`.
    if (selfClosing) handler.onEnd(name);
    i = gt + 1;
  }

  if (open.length > 0) {
    bail("A workbook part ends with unclosed XML elements, so it is incomplete.");
  }
}

/** `x:c` and `c` are the same element; producers differ on the prefix. */
function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

/**
 * Walks attributes in order. Sequential rather than "find the attribute I want",
 * because a search would happily match `r=` inside the VALUE of a preceding
 * attribute, which is one hostile sheet name away from reading the wrong cell
 * reference.
 *
 * The visitor is allocated once by each caller and writes into its own locals,
 * so a million cells cost a million calls and zero objects.
 */
function forEachAttribute(src: string, visit: (name: string, value: string) => void): void {
  const n = src.length;
  let i = 0;
  while (i < n) {
    while (i < n && isSpaceCode(src.charCodeAt(i))) i++;
    if (i >= n) return;
    const nameStart = i;
    while (i < n) {
      const code = src.charCodeAt(i);
      if (code === 0x3d || isSpaceCode(code)) break;
      i++;
    }
    const name = src.slice(nameStart, i);
    while (i < n && isSpaceCode(src.charCodeAt(i))) i++;
    if (src.charCodeAt(i) !== 0x3d) bail("A workbook part has a malformed XML attribute.");
    i++;
    while (i < n && isSpaceCode(src.charCodeAt(i))) i++;
    const quoteCode = src.charCodeAt(i);
    if (quoteCode !== 0x22 && quoteCode !== 0x27) {
      bail("A workbook part has an unquoted XML attribute value.");
    }
    const end = src.indexOf(quoteCode === 0x22 ? '"' : "'", i + 1);
    if (end < 0) bail("A workbook part has an unterminated XML attribute value.");
    if (name.length > 0) visit(name, decodeEntities(src.slice(i + 1, end)));
    i = end + 1;
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** The longest thing we will treat as an entity: `&#x10FFFF;` is 10 characters. */
const MAX_ENTITY_LENGTH = 12;

function decodeEntities(raw: string): string {
  const first = raw.indexOf("&");
  if (first < 0) return raw;

  let out = "";
  let cursor = 0;
  let at = first;
  while (at >= 0) {
    const end = raw.indexOf(";", at + 1);
    if (end < 0 || end - at > MAX_ENTITY_LENGTH) {
      bail("A workbook part contains an XML entity this codec does not decode.");
    }
    const body = raw.slice(at + 1, end);
    let replacement: string;
    if (body.charCodeAt(0) === 0x23 /* # */) {
      const hex = body.charCodeAt(1) === 0x78 || body.charCodeAt(1) === 0x58;
      const digits = hex ? body.slice(2) : body.slice(1);
      if (digits.length === 0) {
        bail("A workbook part contains a malformed XML character reference.");
      }
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (
        !Number.isInteger(code) ||
        code < 1 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        bail("A workbook part contains an XML character reference outside Unicode.");
      }
      replacement = String.fromCodePoint(code);
    } else {
      const named = NAMED_ENTITIES[body];
      if (named === undefined) {
        bail("A workbook part contains an XML entity this codec does not decode.");
      }
      replacement = named;
    }
    out += raw.slice(cursor, at) + replacement;
    cursor = end + 1;
    at = raw.indexOf("&", cursor);
  }
  return out + raw.slice(cursor);
}

/* ─────────────────────────────── dates and styles ───────────────────────────── */

/**
 * The built-in number formats that mean "this number is a date or a time".
 * Fixed by ECMA-376 part 1, section 18.8.30, so they are a table and not a
 * heuristic. 27-36 and 50-58 are the East Asian calendar formats.
 */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);

/**
 * A custom format code is a date format when a date or time token survives
 * outside quoted literals, escapes and bracketed sections. Skipping those three
 * is the whole trick: `"Delivered "0` and `[$-409]#,##0` both contain `d` and
 * `$` inside parts that are not tokens, and a naive scan would call the first
 * one a date.
 */
function formatCodeIsDate(code: string): boolean {
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"') {
      const end = code.indexOf('"', i + 1);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (ch === "[") {
      const end = code.indexOf("]", i + 1);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if ("yYmMdDhHsS".includes(ch)) return true;
    i++;
  }
  return false;
}

type StyleTable = { xfIsDate: boolean[] };

/**
 * Resolves in TWO passes rather than in document order. The schema does put
 * `<numFmts>` before `<cellXfs>`, so a single pass would work on every
 * conforming file, and that is exactly the problem: a producer that writes them
 * the other way round would not fail, it would return raw serials like `44197`
 * where the client expects a date. A wrong value that looks like a value is the
 * failure mode with no downstream detector, so the order dependency is removed
 * rather than assumed away.
 */
function readStyles(xml: string): StyleTable {
  const customDateFormats = new Set<number>();
  const xfNumFmtIds: number[] = [];
  let inNumFmts = false;
  let inCellXfs = false;

  let numFmtId = "";
  let formatCode = "";
  const visitNumFmt = (name: string, value: string) => {
    if (name === "numFmtId") numFmtId = value;
    else if (name === "formatCode") formatCode = value;
  };
  let xfNumFmtId = "";
  const visitXf = (name: string, value: string) => {
    if (name === "numFmtId") xfNumFmtId = value;
  };

  scanXml(xml, {
    onStart: (raw, attributes) => {
      const name = localName(raw);
      if (name === "numFmts") inNumFmts = true;
      else if (name === "cellXfs") inCellXfs = true;
      else if (name === "numFmt" && inNumFmts) {
        numFmtId = "";
        formatCode = "";
        forEachAttribute(attributes, visitNumFmt);
        const id = Number.parseInt(numFmtId, 10);
        if (Number.isInteger(id) && formatCodeIsDate(formatCode)) customDateFormats.add(id);
      } else if (name === "xf" && inCellXfs) {
        if (xfNumFmtIds.length >= 65_536) {
          bail("The workbook declares an unreasonable number of cell formats.");
        }
        xfNumFmtId = "";
        forEachAttribute(attributes, visitXf);
        xfNumFmtIds.push(Number.parseInt(xfNumFmtId, 10));
      }
    },
    onEnd: (raw) => {
      const name = localName(raw);
      if (name === "numFmts") inNumFmts = false;
      else if (name === "cellXfs") inCellXfs = false;
    },
    onText: () => {},
  });

  return {
    xfIsDate: xfNumFmtIds.map(
      (id) => Number.isInteger(id) && (BUILTIN_DATE_FORMATS.has(id) || customDateFormats.has(id))
    ),
  };
}

/** 1900-01-01 is serial 1, and 1899-12-31 is the anchor that makes it so. */
const SERIAL_ANCHOR_BEFORE_BUG = Date.UTC(1899, 11, 31);
/** From serial 61 on, every date is shifted one day by the phantom 29 Feb 1900. */
const SERIAL_ANCHOR_AFTER_BUG = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
/** 9999-12-31, the last date Excel itself will represent. */
const MAX_SERIAL = 2_958_465;

/**
 * THE LOTUS 1900 LEAP YEAR BUG, HANDLED RATHER THAN INHERITED.
 *
 * 1900 was not a leap year. Lotus 1-2-3 said it was, Excel copied the mistake
 * for file compatibility, and so serial 60 renders as "29 Feb 1900" in every
 * spreadsheet on earth. The consequence for a converter is narrow and total:
 * serials 1..59 are one day off from the naive epoch arithmetic, serials 61 and
 * up are not, and using one anchor for both silently shifts every date before
 * March 1900 by a day.
 *
 * Serial 60 itself REFUSES. It denotes a day that never existed, so there is no
 * correct ISO string for it; both plausible answers (28 Feb or 1 Mar) are
 * guesses about what the person who typed it meant.
 *
 * A FRACTIONAL SERIAL ALSO REFUSES. It carries a time of day, and this function
 * returns yyyy-mm-dd, so returning anything would be discarding the time
 * without saying so. Dropping information the client will reconcile against is
 * the failure mode this codec exists to make impossible.
 */
function serialToIsoDate(raw: string): string {
  const serial = Number(raw);
  if (!Number.isFinite(serial)) {
    bail("A cell is formatted as a date but does not hold a number.");
  }
  if (serial < 1 || serial > MAX_SERIAL) {
    bail("A cell holds a date serial outside the range 1900-01-01 to 9999-12-31.");
  }
  if (!Number.isInteger(serial)) {
    bail(
      "A cell holds a date with a time of day. This codec converts whole dates only, and dropping the time would lose data silently."
    );
  }
  if (serial === 60) {
    bail(
      "A cell holds date serial 60, which spreadsheets render as 29 February 1900, a day that never existed."
    );
  }
  const anchor = serial < 60 ? SERIAL_ANCHOR_BEFORE_BUG : SERIAL_ANCHOR_AFTER_BUG;
  return new Date(anchor + serial * MS_PER_DAY).toISOString().slice(0, 10);
}

/* ────────────────────────────── the workbook parts ──────────────────────────── */

type SheetRef = { name: string; relationshipId: string };

function readWorkbook(xml: string): SheetRef[] {
  const sheets: SheetRef[] = [];
  let inSheets = false;

  let sheetName = "";
  let sheetRelId = "";
  const visitSheet = (name: string, value: string) => {
    if (name === "name") sheetName = value;
    else if (localName(name) === "id") sheetRelId = value;
  };
  const visitWorkbookPr = (name: string, value: string) => {
    if (name === "date1904" && (value === "1" || value.toLowerCase() === "true")) {
      /**
       * REFUSED, NOT CONVERTED. The 1904 system exists and the arithmetic to
       * support it is four characters long, which is exactly why it is
       * dangerous: get the branch wrong and every date in the deliverable is
       * off by four years and one day, in a file that looks perfectly normal.
       * Until there is a real 1904 workbook to test against, a person opens it.
       */
      bail(
        "The workbook uses the 1904 date system. Converting its dates without a workbook to verify against would risk shifting every one of them by four years."
      );
    }
  };

  scanXml(xml, {
    onStart: (raw, attributes) => {
      const name = localName(raw);
      if (name === "workbookPr") {
        forEachAttribute(attributes, visitWorkbookPr);
      } else if (name === "externalReferences") {
        bail("The workbook references cells in another workbook, whose contents we do not have.");
      } else if (name === "sheets") {
        inSheets = true;
      } else if (name === "sheet" && inSheets) {
        if (sheets.length >= CODEC_LIMITS.maxSheetCount) {
          bail(`The workbook has more than ${CODEC_LIMITS.maxSheetCount} sheets.`);
        }
        sheetName = "";
        sheetRelId = "";
        forEachAttribute(attributes, visitSheet);
        sheets.push({ name: sheetName, relationshipId: sheetRelId });
      }
    },
    onEnd: (raw) => {
      if (localName(raw) === "sheets") inSheets = false;
    },
    onText: () => {},
  });

  if (sheets.length === 0) bail("The workbook declares no sheets.");
  return sheets;
}

const WORKSHEET_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";

/** Relationship id to the part it points at, resolved against the `xl/` folder. */
function readWorkbookRelationships(xml: string): Map<string, { target: string; type: string }> {
  const relationships = new Map<string, { target: string; type: string }>();

  let id = "";
  let type = "";
  let target = "";
  let targetMode = "";
  const visit = (name: string, value: string) => {
    if (name === "Id") id = value;
    else if (name === "Type") type = value;
    else if (name === "Target") target = value;
    else if (name === "TargetMode") targetMode = value;
  };

  scanXml(xml, {
    onStart: (raw, attributes) => {
      if (localName(raw) !== "Relationship") return;
      id = "";
      type = "";
      target = "";
      targetMode = "";
      forEachAttribute(attributes, visit);
      if (targetMode.toLowerCase() === "external") {
        bail("The workbook points at an external target, which this codec never follows.");
      }
      if (target.includes("..")) {
        bail("The workbook has a relationship whose target escapes the archive.");
      }
      const resolved = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      if (id !== "") relationships.set(id, { target: resolved, type });
    },
    onEnd: () => {},
    onText: () => {},
  });

  return relationships;
}

function readSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  let inSi = false;
  let inT = false;
  let phoneticDepth = 0;
  let parts: string[] = [];
  let totalChars = 0;

  scanXml(xml, {
    onStart: (raw) => {
      const name = localName(raw);
      if (name === "si") {
        inSi = true;
        parts = [];
      } else if (name === "rPh") {
        // Phonetic guides for East Asian text. They live inside <si> next to the
        // real runs, and concatenating them would append a reading of the string
        // to the string itself.
        phoneticDepth++;
      } else if (name === "t") {
        inT = true;
      }
    },
    onEnd: (raw) => {
      const name = localName(raw);
      if (name === "t") inT = false;
      else if (name === "rPh") phoneticDepth--;
      else if (name === "si") {
        inSi = false;
        const value = parts.length === 1 ? parts[0] : parts.join("");
        if (value.length > CODEC_LIMITS.maxCellChars) {
          bail(`A shared string is longer than ${CODEC_LIMITS.maxCellChars} characters.`);
        }
        totalChars += value.length;
        if (totalChars > CODEC_LIMITS.maxBytes || strings.length >= CODEC_LIMITS.maxCells) {
          bail("The workbook's shared string table is larger than this codec accepts.");
        }
        strings.push(value);
      }
    },
    onText: (raw, isCdata) => {
      if (!inSi || !inT || phoneticDepth > 0) return;
      parts.push(isCdata ? raw : decodeEntities(raw));
    },
  });

  return strings;
}

/* ──────────────────────────────── the sheet reader ──────────────────────────── */

function columnIndexFromRef(ref: string): number {
  let index = 0;
  let seen = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    const letter = code >= 65 && code <= 90 ? code - 64 : code >= 97 && code <= 122 ? code - 96 : 0;
    if (letter === 0) break;
    index = index * 26 + letter;
    seen++;
    if (seen > 3) bail("A cell reference names a column beyond the accepted range.");
  }
  return seen === 0 ? -1 : index - 1;
}

/**
 * Reads `<sheetData>` into rows of strings.
 *
 * ── WHY A SHORT ROW IS PADDED HERE AND REFUSED IN csv.ts ──
 *
 * The formats disagree about what a missing cell means, so the codecs must too.
 * A worksheet does not write empty trailing cells at all and identifies every
 * cell it does write by its own column reference, so an absent `<c>` provably
 * IS an empty cell: filling it invents nothing. A short CSV row has no such
 * evidence; it is either a missing value or a missing delimiter, and choosing
 * one is a guess. Same word, opposite epistemics.
 *
 * A row with MORE cells than the header names still refuses, in both codecs, for
 * the same reason in both: a value under no column name cannot be delivered.
 */
function readSheet(xml: string, shared: string[], styles: StyleTable): string[][] {
  const rows: string[][] = [];
  let inSheetData = false;

  let row: string[] = [];
  let rowHasCells = false;
  let nextColumn = 0;
  let cellCount = 0;
  let totalChars = 0;

  let cellRef = "";
  let cellType = "";
  let cellStyle = "";
  const visitCell = (name: string, value: string) => {
    if (name === "r") cellRef = value;
    else if (name === "t") cellType = value;
    else if (name === "s") cellStyle = value;
  };

  let valueParts: string[] = [];
  let sawValueElement = false;
  let hasFormula = false;
  let inValue = false;
  let inInline = false;
  let inText = false;
  let phoneticDepth = 0;
  let inlineParts: string[] = [];

  const finishCell = () => {
    const rawValue = valueParts.length === 1 ? valueParts[0] : valueParts.join("");

    if (hasFormula && (!sawValueElement || rawValue === "")) {
      /**
       * A formula with no cached result is a cell whose value only Excel knows.
       * We do not evaluate formulas (an expression evaluator over client bytes
       * is a far larger attack surface than this whole file), so the honest
       * answer is that this workbook needs opening by a person.
       */
      bail(
        "A formula cell holds no cached value, so its result is unknown. Open and re-save the workbook so the values are stored."
      );
    }

    let value: string;
    if (cellType === "s") {
      const index = Number.parseInt(rawValue, 10);
      if (!Number.isInteger(index) || index < 0 || index >= shared.length) {
        bail("A cell points at a shared string that does not exist.");
      }
      value = shared[index];
    } else if (cellType === "inlineStr") {
      value = inlineParts.length === 1 ? inlineParts[0] : inlineParts.join("");
    } else if (cellType === "str") {
      value = rawValue;
    } else if (cellType === "b") {
      if (rawValue !== "0" && rawValue !== "1") bail("A boolean cell holds neither 0 nor 1.");
      value = rawValue === "1" ? "TRUE" : "FALSE";
    } else if (cellType === "e") {
      bail("A cell holds a spreadsheet error value such as #REF! or #N/A.");
    } else if (cellType === "" || cellType === "n") {
      if (!sawValueElement) {
        value = "";
      } else {
        const styleIndex = Number.parseInt(cellStyle, 10);
        const isDate =
          Number.isInteger(styleIndex) && styles.xfIsDate[styleIndex] === true;
        // A number is emitted EXACTLY as stored, never re-rendered through its
        // display format. The display format is a presentation choice made in
        // Excel; the stored digits are what the client will reconcile against.
        value = isDate ? serialToIsoDate(rawValue) : rawValue;
      }
    } else {
      bail("A cell uses a value type outside the accepted subset.");
    }

    if (value.length > CODEC_LIMITS.maxCellChars) {
      bail(`A cell is longer than ${CODEC_LIMITS.maxCellChars} characters.`);
    }

    let column = cellRef === "" ? nextColumn : columnIndexFromRef(cellRef);
    if (column < 0) column = nextColumn;
    if (column >= CODEC_LIMITS.maxColumns) {
      bail(`A row has more than ${CODEC_LIMITS.maxColumns} columns.`);
    }
    if (column < row.length) {
      bail("A row's cells are not in ascending column order, so their positions are ambiguous.");
    }

    // The gap fill and the value are both allocations; the bound is checked
    // before either happens.
    const added = column - row.length + 1;
    cellCount += added;
    if (cellCount > CODEC_LIMITS.maxCells) {
      bail(`The sheet holds more than ${CODEC_LIMITS.maxCells} cells.`);
    }
    totalChars += value.length;
    if (totalChars > CODEC_LIMITS.maxBytes) {
      bail("The sheet expands to more text than this codec accepts.");
    }
    while (row.length < column) row.push("");
    row.push(value);
    rowHasCells = true;
    nextColumn = column + 1;
  };

  scanXml(xml, {
    onStart: (raw, attributes) => {
      const name = localName(raw);
      if (!inSheetData) {
        if (name === "sheetData") inSheetData = true;
        return;
      }
      switch (name) {
        case "row":
          row = [];
          rowHasCells = false;
          nextColumn = 0;
          break;
        case "c":
          cellRef = "";
          cellType = "";
          cellStyle = "";
          valueParts = [];
          inlineParts = [];
          sawValueElement = false;
          hasFormula = false;
          forEachAttribute(attributes, visitCell);
          break;
        case "v":
          inValue = true;
          sawValueElement = true;
          break;
        case "f":
          hasFormula = true;
          break;
        case "is":
          inInline = true;
          break;
        case "t":
          inText = true;
          break;
        case "rPh":
          phoneticDepth++;
          break;
        default:
          break;
      }
    },
    onEnd: (raw) => {
      const name = localName(raw);
      if (!inSheetData) return;
      switch (name) {
        case "sheetData":
          inSheetData = false;
          break;
        case "v":
          inValue = false;
          break;
        case "is":
          inInline = false;
          break;
        case "t":
          inText = false;
          break;
        case "rPh":
          phoneticDepth--;
          break;
        case "c":
          finishCell();
          break;
        case "row":
          /**
           * A `<row>` carrying no cells at all is skipped. Excel writes one for
           * a row that has only formatting (a height, a fill), and materialising
           * it would insert a blank record into the middle of the client's data
           * that exists nowhere in their file. A row whose cells are all EMPTY
           * is kept: those cells were written.
           */
          if (rowHasCells) {
            if (rows.length >= CODEC_LIMITS.maxRows + 1) {
              bail(`The sheet has more than ${CODEC_LIMITS.maxRows} data rows.`);
            }
            rows.push(row);
          }
          break;
        default:
          break;
      }
    },
    onText: (text, isCdata) => {
      if (!inSheetData) return;
      if (inValue) {
        valueParts.push(isCdata ? text : decodeEntities(text));
      } else if (inInline && inText && phoneticDepth === 0) {
        inlineParts.push(isCdata ? text : decodeEntities(text));
      }
    },
  });

  return rows;
}

/* ──────────────────────────────────── read ─────────────────────────────────── */

/** The OLE compound file header an encrypted OOXML package is wrapped in. */
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function parseXlsx(
  buffer: Buffer,
  opts: { sheet: string | number | null; hasHeaderRow: boolean }
): CodecResult {
  try {
    if (buffer.length > CODEC_LIMITS.maxBytes) {
      return refuse(`The file is larger than the ${CODEC_LIMITS.maxBytes} byte ceiling.`);
    }
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(CFB_SIGNATURE)) {
      return refuse("The workbook is encrypted or password-protected, so it cannot be read.");
    }
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return refuse("The file is not an XLSX workbook.");
    }

    const entries = readCentralDirectory(buffer);
    assertPartsAreInSubset(entries);
    const names = new Set(entries.map((e) => e.name));
    for (const required of ["[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"]) {
      if (!names.has(required)) return refuse("The workbook is missing a required part.");
    }

    const manifest = inflateParts(
      buffer,
      (name) => name === "xl/workbook.xml" || name === "xl/_rels/workbook.xml.rels"
    );
    const sheets = readWorkbook(partText(manifest, "xl/workbook.xml"));
    const relationships = readWorkbookRelationships(partText(manifest, "xl/_rels/workbook.xml.rels"));

    const selected = selectSheet(sheets, opts.sheet);
    const relationship = relationships.get(selected.relationshipId);
    if (relationship === undefined) {
      return refuse("The selected sheet has no relationship pointing at its data.");
    }
    if (relationship.type !== WORKSHEET_RELATIONSHIP_TYPE) {
      return refuse("The selected sheet is not an ordinary worksheet.");
    }
    if (!names.has(relationship.target)) {
      return refuse("The selected sheet's data part is missing from the workbook.");
    }

    const hasSharedStrings = names.has("xl/sharedStrings.xml");
    const hasStyles = names.has("xl/styles.xml");
    const dataParts = inflateParts(
      buffer,
      (name) =>
        name === relationship.target ||
        (hasSharedStrings && name === "xl/sharedStrings.xml") ||
        (hasStyles && name === "xl/styles.xml")
    );

    const shared = hasSharedStrings ? readSharedStrings(partText(dataParts, "xl/sharedStrings.xml")) : [];
    const styles = hasStyles ? readStyles(partText(dataParts, "xl/styles.xml")) : { xfIsDate: [] };
    const scanned = readSheet(partText(dataParts, relationship.target), shared, styles);

    if (scanned.length === 0) return refuse("The selected sheet has no rows.");

    const headers = opts.hasHeaderRow ? scanned[0] : syntheticHeaders(scanned[0].length);
    const dataRows = opts.hasHeaderRow ? scanned.slice(1) : scanned;

    const headerProblem = validateHeaders(headers);
    if (headerProblem !== null) return refuse(headerProblem);

    if (dataRows.length > CODEC_LIMITS.maxRows) {
      return refuse(`The sheet has more than ${CODEC_LIMITS.maxRows} data rows.`);
    }

    const rows: string[][] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i];
      if (cells.length > headers.length) {
        return refuse(
          `Row ${i + (opts.hasHeaderRow ? 2 : 1)} has a value in column ${cells.length}, which the header row does not name.`
        );
      }
      while (cells.length < headers.length) cells.push("");
      rows.push(cells);
    }

    return okTable({ headers, rows });
  } catch (error) {
    if (error instanceof CodecBail) return refuse(error.message);
    /**
     * Anything else is a bug in this file or an assertion from fflate, and its
     * message may quote bytes the client owns. It is replaced, not forwarded.
     */
    return refuse("The workbook could not be read safely.");
  }
}

function selectSheet(sheets: SheetRef[], selector: string | number | null): SheetRef {
  if (selector === null) return sheets[0];
  if (typeof selector === "number") {
    if (!Number.isInteger(selector) || selector < 0 || selector >= sheets.length) {
      bail(`The workbook has ${sheets.length} sheets, so the requested sheet index does not exist.`);
    }
    return sheets[selector];
  }
  // Exact match only. A near match would be this codec deciding which of the
  // client's sheets the operator meant.
  const found = sheets.find((sheet) => sheet.name === selector);
  if (found === undefined) bail("The workbook has no sheet with the requested name.");
  return found;
}

/* ──────────────────────────────────── write ────────────────────────────────── */

/**
 * A FIXED TIMESTAMP, because ZIP stores one and fflate defaults it to the
 * current time. With the default, buildXlsx would return different bytes every
 * call, so the artifact hash of a replayed step would differ from the hash of
 * the original and nothing downstream could tell a replay from a tampered file.
 *
 * Midday on 2 January 1980 rather than the DOS epoch itself: fflate renders the
 * timestamp with the host's LOCAL calendar, and any earlier instant lands in
 * 1979 west of UTC, which the DOS date field cannot represent.
 */
const FIXED_ZIP_MTIME = Date.UTC(1980, 0, 2, 12, 0, 0);

const XLSX_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XLSX_RELS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * Escapes text for XML AND refuses what XML cannot carry.
 *
 * Tab, newline and carriage return are written as numeric references rather
 * than raw. XML 1.0 requires a parser to normalise a literal CR (and CRLF) to a
 * bare LF on the way in, so a cell containing a carriage return would come back
 * changed; a character reference is exempt from that normalisation and survives
 * the round trip exactly.
 */
function xmlEscape(value: string): string {
  let out = "";
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    let replacement: string | null = null;
    if (code === 0x26) replacement = "&amp;";
    else if (code === 0x3c) replacement = "&lt;";
    else if (code === 0x3e) replacement = "&gt;";
    else if (code === 0x22) replacement = "&quot;";
    else if (code === 0x27) replacement = "&apos;";
    else if (code === 0x09) replacement = "&#9;";
    else if (code === 0x0a) replacement = "&#10;";
    else if (code === 0x0d) replacement = "&#13;";
    else if (code < 0x20) {
      throw new Error("buildXlsx: a cell contains a control character that XML cannot represent.");
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("buildXlsx: a cell contains an unpaired surrogate.");
      }
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("buildXlsx: a cell contains an unpaired surrogate.");
    }
    if (replacement !== null) {
      out += value.slice(start, i) + replacement;
      start = i + 1;
    }
  }
  return start === 0 ? value : out + value.slice(start);
}

export function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * A value is written as a NUMBER only when the decimal text round-trips through
 * a double unchanged. That single test is what protects the values a client
 * will recognise: "007" becomes "7" and so stays text, "01234" (a postal code)
 * stays text, "1.50" stays text because the trailing zero would vanish, and a
 * 19-digit account number stays text because a double cannot hold it. A phone
 * number like 4165551234 does round-trip and becomes a number, which loses
 * nothing.
 */
function isLosslessNumber(value: string): boolean {
  if (value.length === 0) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value;
}

const FORBIDDEN_SHEET_NAME_CHARS = [":", "\\", "/", "?", "*", "[", "]"];

export function buildXlsx(table: Table, opts: { sheetName: string }): Buffer {
  /**
   * THROWS RATHER THAN REFUSING, and the asymmetry with parseXlsx is the point.
   * parseXlsx is handed a stranger's bytes, so "no" is an ordinary answer that
   * becomes human work. buildXlsx is handed OUR OWN table, assembled by steps
   * this engine ran; a bound violation here is a bug upstream, not a client's
   * file, and a `Buffer` return type has no honest way to say no. Throwing
   * fails the step, which is what a bug should do.
   */
  const { headers, rows } = table;
  if (headers.length === 0) throw new Error("buildXlsx: the table has no columns.");
  if (headers.length > CODEC_LIMITS.maxColumns) {
    throw new Error(`buildXlsx: the table has more than ${CODEC_LIMITS.maxColumns} columns.`);
  }
  if (rows.length > CODEC_LIMITS.maxRows) {
    throw new Error(`buildXlsx: the table has more than ${CODEC_LIMITS.maxRows} rows.`);
  }
  if ((rows.length + 1) * headers.length > CODEC_LIMITS.maxCells) {
    throw new Error(`buildXlsx: the table has more than ${CODEC_LIMITS.maxCells} cells.`);
  }
  const sheetName = opts.sheetName;
  if (
    sheetName.length === 0 ||
    sheetName.length > 31 ||
    FORBIDDEN_SHEET_NAME_CHARS.some((ch) => sheetName.includes(ch))
  ) {
    throw new Error("buildXlsx: the sheet name is empty, too long, or uses a forbidden character.");
  }

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<worksheet xmlns="${XLSX_MAIN_NS}"><sheetData>`,
  ];

  const writeRow = (cells: string[], rowNumber: number, forceText: boolean) => {
    if (cells.length !== headers.length) {
      throw new Error(`buildXlsx: row ${rowNumber} does not have ${headers.length} cells.`);
    }
    parts.push(`<row r="${rowNumber}">`);
    for (let c = 0; c < cells.length; c++) {
      const value = cells[c];
      if (value.length > CODEC_LIMITS.maxCellChars) {
        throw new Error(
          `buildXlsx: a cell on row ${rowNumber} is longer than ${CODEC_LIMITS.maxCellChars} characters.`
        );
      }
      const ref = `${columnLetters(c)}${rowNumber}`;
      if (value === "") {
        parts.push(`<c r="${ref}"/>`);
        continue;
      }
      if (!forceText && isLosslessNumber(value)) {
        parts.push(`<c r="${ref}"><v>${value}</v></c>`);
        continue;
      }
      /**
       * FORMULA INJECTION, NEUTRALISED WITH THE SAME RULE AS THE CSV WRITER.
       * neutralizeCsvCell is imported rather than restated so the two writers
       * cannot drift: one deliverable format quietly losing the protection the
       * other has is exactly the failure a second copy of a rule produces.
       *
       * The cost, stated because it is visible to the client: unlike a CSV
       * import, a spreadsheet does not absorb the apostrophe, so the cell reads
       * `'=SUM(A1)`. That is accepted deliberately. A string cell in a workbook
       * is inert on its own, but these files are re-exported to CSV and pasted
       * between sheets constantly, and the leading `=` is live again the moment
       * either happens.
       */
      const text = xmlEscape(neutralizeCsvCell(value));
      parts.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`);
    }
    parts.push("</row>");
  };

  // Headers are always text: a column named "2024" is a label, not a quantity.
  writeRow(headers, 1, true);
  for (let r = 0; r < rows.length; r++) writeRow(rows[r], r + 2, false);
  parts.push("</sheetData></worksheet>");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>"
    ),
    "_rels/.rels": encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="${PACKAGE_RELS_NS}">` +
        `<Relationship Id="rId1" Type="${XLSX_RELS_NS}/officeDocument" Target="xl/workbook.xml"/>` +
        "</Relationships>"
    ),
    "xl/workbook.xml": encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<workbook xmlns="${XLSX_MAIN_NS}" xmlns:r="${XLSX_RELS_NS}">` +
        `<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        "</workbook>"
    ),
    "xl/_rels/workbook.xml.rels": encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="${PACKAGE_RELS_NS}">` +
        `<Relationship Id="rId1" Type="${WORKSHEET_RELATIONSHIP_TYPE}" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${XLSX_RELS_NS}/styles" Target="styles.xml"/>` +
        "</Relationships>"
    ),
    /**
     * The smallest styles part Excel accepts. No formats are applied to any
     * cell: index 0 of cellXfs is General and every cell we write is unstyled.
     * It exists at all because Excel treats a workbook with no styles part as
     * damaged and offers to repair it, and a repair prompt on a client's
     * deliverable is not a cosmetic problem. Two fills, because the built-in
     * gray125 at index 1 is likewise assumed to be there.
     */
    "xl/styles.xml": encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<styleSheet xmlns="${XLSX_MAIN_NS}">` +
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        "</styleSheet>"
    ),
    "xl/worksheets/sheet1.xml": encode(parts.join("")),
  };

  return Buffer.from(zipSync(files, { level: 6, mtime: FIXED_ZIP_MTIME }));
}

function encode(xml: string): Uint8Array {
  return new Uint8Array(Buffer.from(xml, "utf8"));
}

import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { CODEC_LIMITS, type CodecResult, type Table } from "@/lib/ai-work-engine/codecs/table";
import { detectDelimiter, parseCsv } from "@/lib/ai-work-engine/codecs/csv";
import { buildXlsx, parseXlsx } from "@/lib/ai-work-engine/codecs/xlsx";

/**
 * These tests are written from the refusal side first. A codec that reads a
 * clean file is the easy half; the half that matters is that a file it cannot
 * read exactly becomes a refusal instead of a plausible table, because a
 * plausible table is indistinguishable from a correct one everywhere downstream.
 */

const utf8 = (text: string) => Buffer.from(text, "utf8");
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function expectTable(result: CodecResult): Table {
  if (!result.ok) throw new Error(`expected a table, got a refusal: ${result.reason}`);
  expect(result.truncated).toBe(false);
  return result.table;
}

function expectRefusal(result: CodecResult): string {
  if (result.ok) throw new Error("expected a refusal, got a table");
  expect(result.reason.length).toBeGreaterThan(0);
  return result.reason;
}

/* ────────────────────────────────── CSV ────────────────────────────────── */

describe("parseCsv reads RFC 4180 exactly", () => {
  it("keeps a delimiter, a newline and a doubled quote inside a quoted field", () => {
    const csv = 'name,note\n"Smith, John","line one\nline two"\n"say ""hi""",plain\n';
    const table = expectTable(parseCsv(utf8(csv), { hasHeaderRow: true, delimiter: null }));
    expect(table.headers).toEqual(["name", "note"]);
    expect(table.rows).toEqual([
      ["Smith, John", "line one\nline two"],
      ['say "hi"', "plain"],
    ]);
  });

  it("handles CRLF and strips a UTF-8 BOM", () => {
    const buffer = Buffer.concat([BOM, utf8("a,b\r\n1,2\r\n")]);
    const table = expectTable(parseCsv(buffer, { hasHeaderRow: true, delimiter: null }));
    expect(table.headers).toEqual(["a", "b"]);
    expect(table.rows).toEqual([["1", "2"]]);
  });

  it("keeps a quoted field that ends the file without a trailing newline", () => {
    const table = expectTable(
      parseCsv(utf8('a,b\n1,"two"'), { hasHeaderRow: true, delimiter: null })
    );
    expect(table.rows).toEqual([["1", "two"]]);
  });

  it("treats a bare CR as a record terminator", () => {
    const table = expectTable(parseCsv(utf8("a,b\r1,2\r"), { hasHeaderRow: true, delimiter: null }));
    expect(table.rows).toEqual([["1", "2"]]);
  });

  it("synthesises column names when there is no header row", () => {
    const table = expectTable(parseCsv(utf8("1,2,3\n4,5,6\n"), { hasHeaderRow: false, delimiter: null }));
    expect(table.headers).toEqual(["column_1", "column_2", "column_3"]);
    expect(table.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("skips a blank line between rows of a multi-column file", () => {
    const table = expectTable(parseCsv(utf8("a,b\n1,2\n\n3,4\n\n"), { hasHeaderRow: true, delimiter: null }));
    expect(table.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("delimiter detection is deterministic", () => {
  it("finds each of the four candidates", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
  });

  it("ignores candidates inside quoted fields", () => {
    // The comma lives inside a quoted field, so the semicolon wins on count.
    expect(detectDelimiter('"a,b";c;d')).toBe(";");
  });

  it("resolves a tie in the documented order and skips leading blank lines", () => {
    expect(detectDelimiter("a,b;c")).toBe(",");
    expect(detectDelimiter("a;b|c")).toBe(";");
    expect(detectDelimiter("a\tb|c")).toBe("\t");
    expect(detectDelimiter("\n\na;b;c")).toBe(";");
    // A single column parses identically under all four; comma is documented.
    expect(detectDelimiter("only\nrows")).toBe(",");
  });

  it("parses a semicolon file end to end without being told the delimiter", () => {
    const table = expectTable(
      parseCsv(utf8('name;city\n"Doe; Jane";Laval\n'), { hasHeaderRow: true, delimiter: null })
    );
    expect(table.rows).toEqual([["Doe; Jane", "Laval"]]);
  });

  it("honours an explicit delimiter over what detection would have chosen", () => {
    const table = expectTable(
      parseCsv(utf8("a;b,c\n1;2,3\n"), { hasHeaderRow: true, delimiter: ";" })
    );
    expect(table.headers).toEqual(["a", "b,c"]);
  });
});

describe("parseCsv refuses rather than guessing", () => {
  it("refuses a ragged row instead of padding it", () => {
    const reason = expectRefusal(
      parseCsv(utf8("a,b,c\n1,2,3\n4,5\n"), { hasHeaderRow: true, delimiter: null })
    );
    expect(reason).toContain("Row 3");
    expect(reason).toContain("invent");
  });

  it("refuses a row with too many columns as well", () => {
    expectRefusal(parseCsv(utf8("a,b\n1,2,3\n"), { hasHeaderRow: true, delimiter: null }));
  });

  it("refuses duplicate header names, case and spacing folded", () => {
    expectRefusal(parseCsv(utf8("email,email\n1,2\n"), { hasHeaderRow: true, delimiter: null }));
    const reason = expectRefusal(
      parseCsv(utf8("Email,  email \n1,2\n"), { hasHeaderRow: true, delimiter: null })
    );
    expect(reason).toContain("ambiguous");
  });

  it("refuses an empty header cell", () => {
    expectRefusal(parseCsv(utf8("a,,c\n1,2,3\n"), { hasHeaderRow: true, delimiter: null }));
    expectRefusal(parseCsv(utf8('a," ",c\n1,2,3\n'), { hasHeaderRow: true, delimiter: null }));
  });

  it("refuses an unterminated quoted field", () => {
    const reason = expectRefusal(
      parseCsv(utf8('a,b\n"never closed,2\n'), { hasHeaderRow: true, delimiter: null })
    );
    expect(reason).toContain("never closed");
  });

  it("refuses a stray quote inside a quoted field but keeps one in an unquoted field", () => {
    expectRefusal(parseCsv(utf8('a,b\n"ab"cd",2\n'), { hasHeaderRow: true, delimiter: null }));
    const table = expectTable(
      parseCsv(utf8('a,b\nab"cd,2\n'), { hasHeaderRow: true, delimiter: null })
    );
    expect(table.rows).toEqual([['ab"cd', "2"]]);
  });

  it("refuses invalid UTF-8 rather than substituting replacement characters", () => {
    // 0xC3 starts a two byte sequence that never arrives.
    const broken = Buffer.concat([utf8("a,b\n1,"), Buffer.from([0xc3]), utf8("\n")]);
    expect(expectRefusal(parseCsv(broken, { hasHeaderRow: true, delimiter: null }))).toContain(
      "UTF-8"
    );
  });

  it("refuses a file containing a NUL byte", () => {
    const withNul = Buffer.concat([utf8("a,b\n1,"), Buffer.from([0x00]), utf8("\n")]);
    expectRefusal(parseCsv(withNul, { hasHeaderRow: true, delimiter: null }));
  });

  it("refuses an empty file and a file with no rows", () => {
    expectRefusal(parseCsv(Buffer.alloc(0), { hasHeaderRow: true, delimiter: null }));
    expectRefusal(parseCsv(BOM, { hasHeaderRow: true, delimiter: null }));
  });

  it("refuses more data rows than the bound, and never truncates to fit", () => {
    const oversize = `a,b\n${"1,2\n".repeat(CODEC_LIMITS.maxRows + 1)}`;
    const reason = expectRefusal(parseCsv(utf8(oversize), { hasHeaderRow: true, delimiter: null }));
    expect(reason).toContain(String(CODEC_LIMITS.maxRows));

    // The row exactly on the bound is accepted, so the refusal is the bound and
    // not an off-by-one that quietly costs a client a row.
    const exact = `a,b\n${"1,2\n".repeat(CODEC_LIMITS.maxRows)}`;
    expect(expectTable(parseCsv(utf8(exact), { hasHeaderRow: true, delimiter: null })).rows).toHaveLength(
      CODEC_LIMITS.maxRows
    );
  });

  it("refuses a cell longer than the bound, quoted or not", () => {
    const long = "x".repeat(CODEC_LIMITS.maxCellChars + 1);
    expectRefusal(parseCsv(utf8(`a,b\n${long},2\n`), { hasHeaderRow: true, delimiter: null }));
    expectRefusal(parseCsv(utf8(`a,b\n"${long}",2\n`), { hasHeaderRow: true, delimiter: null }));

    const atBound = "x".repeat(CODEC_LIMITS.maxCellChars);
    const table = expectTable(
      parseCsv(utf8(`a,b\n${atBound},2\n`), { hasHeaderRow: true, delimiter: null })
    );
    expect(table.rows[0][0]).toHaveLength(CODEC_LIMITS.maxCellChars);
  });

  it("refuses a buffer over the byte ceiling before decoding it", () => {
    const oversize = Buffer.alloc(CODEC_LIMITS.maxBytes + 1, 0x61);
    expectRefusal(parseCsv(oversize, { hasHeaderRow: true, delimiter: null }));
  });

  it("refuses more columns than the bound", () => {
    const wide = `${Array.from({ length: CODEC_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(",")}\n`;
    expectRefusal(parseCsv(utf8(wide), { hasHeaderRow: true, delimiter: null }));
  });
});

describe("parseCsv is deterministic", () => {
  it("returns deeply equal results for the same buffer twice", () => {
    const buffer = utf8('a,b\n"x,1",2\n"multi\nline",4\n');
    const first = parseCsv(buffer, { hasHeaderRow: true, delimiter: null });
    const second = parseCsv(buffer, { hasHeaderRow: true, delimiter: null });
    expect(first).toStrictEqual(second);
    expect(expectTable(first).rows).toStrictEqual(expectTable(second).rows);
  });
});

/* ───────────────────────────────── XLSX ─────────────────────────────────── */

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function sheetPart(rowsXml: string): string {
  return `${DECLARATION}<worksheet xmlns="${MAIN_NS}"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

type WorkbookFixture = {
  sheets?: { name: string; rid: string; target: string }[];
  parts?: Record<string, string>;
  workbookPr?: string;
  extraWorkbookXml?: string;
};

function makeWorkbook(fixture: WorkbookFixture): Buffer {
  const sheets = fixture.sheets ?? [
    { name: "Sheet1", rid: "rId1", target: "worksheets/sheet1.xml" },
  ];
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, xml: string) => {
    files[name] = new Uint8Array(Buffer.from(xml, "utf8"));
  };

  put("[Content_Types].xml", `${DECLARATION}<Types/>`);
  put(
    "_rels/.rels",
    `${DECLARATION}<Relationships xmlns="${PKG_RELS_NS}"><Relationship Id="rId1" Type="${RELS_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  put(
    "xl/workbook.xml",
    `${DECLARATION}<workbook xmlns="${MAIN_NS}" xmlns:r="${RELS_NS}">${fixture.workbookPr ?? ""}${
      fixture.extraWorkbookXml ?? ""
    }<sheets>${sheets
      .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="${s.rid}"/>`)
      .join("")}</sheets></workbook>`
  );
  put(
    "xl/_rels/workbook.xml.rels",
    `${DECLARATION}<Relationships xmlns="${PKG_RELS_NS}">${sheets
      .map((s) => `<Relationship Id="${s.rid}" Type="${RELS_NS}/worksheet" Target="${s.target}"/>`)
      .join("")}</Relationships>`
  );
  for (const [name, xml] of Object.entries(fixture.parts ?? {})) put(name, xml);

  return Buffer.from(zipSync(files, { level: 6, mtime: Date.UTC(1980, 0, 2, 12, 0, 0) }));
}

/** One sheet, its XML supplied, plus whatever extra parts a test needs. */
function oneSheet(rowsXml: string, parts: Record<string, string> = {}): Buffer {
  return makeWorkbook({ parts: { "xl/worksheets/sheet1.xml": sheetPart(rowsXml), ...parts } });
}

const NUM_FMTS = '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>';
const CELL_XFS =
  '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>';
/** Style index 0 is General, 1 is the built-in date format 14, 2 is custom 164. */
const DATE_STYLES = `${DECLARATION}<styleSheet xmlns="${MAIN_NS}">${NUM_FMTS}${CELL_XFS}</styleSheet>`;
/**
 * The same table with the two sections swapped. The schema puts numFmts first,
 * so a reader that resolves in document order passes every conforming file and
 * then, on a producer that does not conform, hands back a raw serial where a
 * date was expected. Nothing downstream can tell that apart from a real number.
 */
const DATE_STYLES_REVERSED = `${DECLARATION}<styleSheet xmlns="${MAIN_NS}">${CELL_XFS}${NUM_FMTS}</styleSheet>`;

/**
 * Walks a copy of the archive's central directory and hands each entry to the
 * visitor, which may edit the copy in place. Forging the directory rather than
 * the local headers is the point of these fixtures: the directory is what both
 * fflate and readCentralDirectory read.
 */
function forgeCentralDirectory(
  zip: Buffer,
  visit: (forged: Buffer, cursor: number, name: string) => void
): Buffer {
  const forged = Buffer.from(zip);
  let eocd = -1;
  for (let i = forged.length - 22; i >= 0; i--) {
    if (forged.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("fixture has no EOCD record");
  const count = forged.readUInt16LE(eocd + 10);
  let cursor = forged.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const nameLength = forged.readUInt16LE(cursor + 28);
    const extraLength = forged.readUInt16LE(cursor + 30);
    const commentLength = forged.readUInt16LE(cursor + 32);
    visit(forged, cursor, forged.toString("utf8", cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return forged;
}

/** Renames one directory entry. Both names must be the same byte length. */
function renameCentralEntry(zip: Buffer, from: string, to: string): Buffer {
  if (Buffer.byteLength(from) !== Buffer.byteLength(to)) {
    throw new Error("rename fixture needs equal length names");
  }
  return forgeCentralDirectory(zip, (forged, cursor, name) => {
    if (name === from) forged.write(to, cursor + 46, "utf8");
  });
}

/** Overwrites the DECLARED uncompressed size of one member. */
function forgeDeclaredSize(zip: Buffer, partName: string, declared: number): Buffer {
  return forgeCentralDirectory(zip, (forged, cursor, name) => {
    if (name === partName) forged.writeUInt32LE(declared, cursor + 24);
  });
}

describe("parseXlsx reads the strict subset", () => {
  it("reads inline strings", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c><c r="B1" t="inlineStr"><is><t>city</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Ada &amp; Co</t></is></c><c r="B2" t="inlineStr"><is><t>Laval</t></is></c></row>'
    );
    const table = expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
    expect(table.headers).toEqual(["name", "city"]);
    expect(table.rows).toEqual([["Ada & Co", "Laval"]]);
  });

  it("reads shared strings, including rich text runs, and skips phonetic guides", () => {
    const shared = `${DECLARATION}<sst xmlns="${MAIN_NS}" count="3" uniqueCount="3"><si><t>name</t></si><si><r><t>Ada</t></r><r><t> Lovelace</t></r></si><si><t>Tokyo</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh></si></sst>`;
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>2</v></c></row>',
      { "xl/sharedStrings.xml": shared }
    );
    const table = expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
    expect(table.headers).toEqual(["name"]);
    expect(table.rows).toEqual([["Ada Lovelace"], ["Tokyo"]]);
  });

  it("refuses a shared string index that does not exist", () => {
    const shared = `${DECLARATION}<sst xmlns="${MAIN_NS}"><si><t>name</t></si></sst>`;
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>9</v></c></row>',
      { "xl/sharedStrings.xml": shared }
    );
    expectRefusal(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
  });

  it("reads numbers exactly as stored and booleans as TRUE or FALSE", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>qty</t></is></c><c r="B1" t="inlineStr"><is><t>flag</t></is></c></row>' +
        '<row r="2"><c r="A2"><v>0007.50</v></c><c r="B2" t="b"><v>1</v></c></row>' +
        '<row r="3"><c r="A3"><v>-12.25</v></c><c r="B3" t="b"><v>0</v></c></row>'
    );
    const table = expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
    // Verbatim: no re-rendering, no numeric normalisation, no inference.
    expect(table.rows).toEqual([
      ["0007.50", "TRUE"],
      ["-12.25", "FALSE"],
    ]);
  });

  it("pads a short row from the cell references but refuses a row wider than the header", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="B1" t="inlineStr"><is><t>b</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row>' +
        // Only A and C are written; B is genuinely empty and the reference proves it.
        '<row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c><c r="C2" t="inlineStr"><is><t>3</t></is></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>x</t></is></c></row>'
    );
    const table = expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
    expect(table.rows).toEqual([
      ["1", "", "3"],
      ["x", "", ""],
    ]);

    const tooWide = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c><c r="B2" t="inlineStr"><is><t>2</t></is></c></row>'
    );
    expect(expectRefusal(parseXlsx(tooWide, { sheet: null, hasHeaderRow: true }))).toContain(
      "does not name"
    );
  });

  it("skips a row element that carries no cells at all", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>' +
        '<row r="2" ht="30"/>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>1</t></is></c></row>'
    );
    expect(expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true })).rows).toEqual([["1"]]);
  });
});

describe("parseXlsx converts date serials with the 1900 leap year bug handled", () => {
  const dated = (serial: string, style = "1", styles = DATE_STYLES) =>
    oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>when</t></is></c></row>' +
        `<row r="2"><c r="A2" s="${style}"><v>${serial}</v></c></row>`,
      { "xl/styles.xml": styles }
    );

  it("converts a serial before the phantom leap day", () => {
    expect(expectTable(parseXlsx(dated("1"), { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["1900-01-01"],
    ]);
    expect(expectTable(parseXlsx(dated("59"), { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["1900-02-28"],
    ]);
  });

  it("converts a serial on and after 1900-03-01, where a naive epoch is a day out", () => {
    // Serial 61 is 1 March 1900. An implementation that ignores the Lotus bug
    // reports 29 February 1900 here, and every later date by one day.
    expect(expectTable(parseXlsx(dated("61"), { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["1900-03-01"],
    ]);
    expect(expectTable(parseXlsx(dated("62"), { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["1900-03-02"],
    ]);
    expect(expectTable(parseXlsx(dated("44197"), { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["2021-01-01"],
    ]);
  });

  it("uses a custom number format code as well as the built-in ids", () => {
    expect(expectTable(parseXlsx(dated("44197", "2"), { sheet: null, hasHeaderRow: true })).rows).toEqual(
      [["2021-01-01"]]
    );
  });

  it("resolves a custom format declared after the cell formats that use it", () => {
    const buffer = dated("44197", "2", DATE_STYLES_REVERSED);
    expect(expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["2021-01-01"],
    ]);
  });

  it("leaves a number alone when its format is not a date", () => {
    expect(expectTable(parseXlsx(dated("44197", "0"), { sheet: null, hasHeaderRow: true })).rows).toEqual(
      [["44197"]]
    );
  });

  it("refuses serial 60, the day that never existed", () => {
    expect(expectRefusal(parseXlsx(dated("60"), { sheet: null, hasHeaderRow: true }))).toContain(
      "29 February 1900"
    );
  });

  it("refuses a date carrying a time of day rather than dropping the time", () => {
    expectRefusal(parseXlsx(dated("44197.5"), { sheet: null, hasHeaderRow: true }));
  });

  it("refuses the 1904 date system rather than shifting every date by four years", () => {
    const buffer = makeWorkbook({
      workbookPr: '<workbookPr date1904="1"/>',
      parts: {
        "xl/worksheets/sheet1.xml": sheetPart(
          '<row r="1"><c r="A1" t="inlineStr"><is><t>when</t></is></c></row>'
        ),
      },
    });
    expect(expectRefusal(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }))).toContain("1904");
  });
});

describe("parseXlsx and formulas", () => {
  it("reads the cached value and ignores the formula itself", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>total</t></is></c></row>' +
        '<row r="2"><c r="A2"><f>SUM(B1:B9)</f><v>42</v></c></row>' +
        '<row r="3"><c r="A3" t="str"><f>CONCAT("a","b")</f><v>ab</v></c></row>'
    );
    expect(expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true })).rows).toEqual([
      ["42"],
      ["ab"],
    ]);
  });

  it("refuses a formula cell with no cached value", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>total</t></is></c></row>' +
        '<row r="2"><c r="A2"><f>SUM(B1:B9)</f></c></row>'
    );
    expect(expectRefusal(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }))).toContain(
      "cached value"
    );
  });

  it("refuses a cell holding a spreadsheet error value", () => {
    const buffer = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>total</t></is></c></row>' +
        '<row r="2"><c r="A2" t="e"><f>1/0</f><v>#DIV/0!</v></c></row>'
    );
    expectRefusal(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
  });
});

describe("parseXlsx selects a sheet exactly as asked", () => {
  const twoSheets = () =>
    makeWorkbook({
      sheets: [
        { name: "Suppliers", rid: "rId1", target: "worksheets/sheet1.xml" },
        { name: "Archive 2024", rid: "rId2", target: "worksheets/sheet2.xml" },
      ],
      parts: {
        "xl/worksheets/sheet1.xml": sheetPart(
          '<row r="1"><c r="A1" t="inlineStr"><is><t>first</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>one</t></is></c></row>'
        ),
        "xl/worksheets/sheet2.xml": sheetPart(
          '<row r="1"><c r="A1" t="inlineStr"><is><t>second</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>two</t></is></c></row>'
        ),
      },
    });

  it("selects by name", () => {
    const table = expectTable(parseXlsx(twoSheets(), { sheet: "Archive 2024", hasHeaderRow: true }));
    expect(table.headers).toEqual(["second"]);
    expect(table.rows).toEqual([["two"]]);
  });

  it("selects by zero-based index, and defaults to the first sheet", () => {
    expect(expectTable(parseXlsx(twoSheets(), { sheet: 1, hasHeaderRow: true })).headers).toEqual([
      "second",
    ]);
    expect(expectTable(parseXlsx(twoSheets(), { sheet: 0, hasHeaderRow: true })).headers).toEqual([
      "first",
    ]);
    expect(expectTable(parseXlsx(twoSheets(), { sheet: null, hasHeaderRow: true })).headers).toEqual([
      "first",
    ]);
  });

  it("refuses an unknown name and an out of range index instead of falling back", () => {
    expectRefusal(parseXlsx(twoSheets(), { sheet: "archive 2024", hasHeaderRow: true }));
    expectRefusal(parseXlsx(twoSheets(), { sheet: 2, hasHeaderRow: true }));
  });
});

describe("parseXlsx refuses hostile and out-of-subset archives", () => {
  it("refuses a zip declaring more uncompressed bytes than the ceiling", () => {
    const honest = oneSheet('<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>');
    expect(expectTable(parseXlsx(honest, { sheet: null, hasHeaderRow: true })).headers).toEqual(["a"]);

    const bomb = forgeDeclaredSize(honest, "xl/worksheets/sheet1.xml", 0x7f000000);
    expect(expectRefusal(parseXlsx(bomb, { sheet: null, hasHeaderRow: true }))).toContain(
      "uncompressed"
    );
  });

  it("refuses a part outside the accepted subset", () => {
    const withMacro = oneSheet('<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>', {
      "xl/vbaProject.bin": "not really a macro, but the name is the point",
    });
    expectRefusal(parseXlsx(withMacro, { sheet: null, hasHeaderRow: true }));

    const withPivot = oneSheet('<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>', {
      "xl/pivotCache/pivotCacheDefinition1.xml": "<x/>",
    });
    expectRefusal(parseXlsx(withPivot, { sheet: null, hasHeaderRow: true }));
  });

  it("refuses an external workbook reference and an external relationship target", () => {
    const external = makeWorkbook({
      extraWorkbookXml: '<externalReferences><externalReference r:id="rId9"/></externalReferences>',
      parts: {
        "xl/worksheets/sheet1.xml": sheetPart(
          '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>'
        ),
      },
    });
    expectRefusal(parseXlsx(external, { sheet: null, hasHeaderRow: true }));
  });

  it("refuses an encrypted workbook", () => {
    const cfb = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(512),
    ]);
    expect(expectRefusal(parseXlsx(cfb, { sheet: null, hasHeaderRow: true }))).toContain("encrypted");
  });

  it("refuses a document type declaration, the entity expansion vector", () => {
    const buffer = makeWorkbook({
      parts: {
        "xl/worksheets/sheet1.xml":
          `${DECLARATION}<!DOCTYPE worksheet [<!ENTITY boom "boomboomboom">]>` +
          `<worksheet xmlns="${MAIN_NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&boom;</t></is></c></row></sheetData></worksheet>`,
      },
    });
    expectRefusal(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
  });

  it("refuses a sheet part that is cut short instead of returning the rows it did read", () => {
    const whole = sheetPart(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>2</t></is></c></row>'
    );
    const cut = whole.indexOf('<row r="3"');

    // Cut on a clean element boundary: every tag that survives is well formed
    // and the first two rows read perfectly, which is exactly what makes
    // returning them so dangerous. Only the unclosed sheetData betrays it.
    const onBoundary = makeWorkbook({ parts: { "xl/worksheets/sheet1.xml": whole.slice(0, cut) } });
    expect(expectRefusal(parseXlsx(onBoundary, { sheet: null, hasHeaderRow: true }))).toContain(
      "incomplete"
    );

    // Cut in the middle of a tag, which the scanner catches earlier.
    const midTag = makeWorkbook({ parts: { "xl/worksheets/sheet1.xml": whole.slice(0, cut + 6) } });
    expectRefusal(parseXlsx(midTag, { sheet: null, hasHeaderRow: true }));
  });

  it("refuses an archive that names the same part twice", () => {
    const buffer = oneSheet('<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>', {
      "xl/theme/a.xml": "<a/>",
      "xl/theme/b.xml": "<b/>",
    });
    expect(expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true })).headers).toEqual(["a"]);
    // Same byte length, so only the name changes in the central directory: the
    // archive now declares two different members called xl/theme/a.xml.
    expectRefusal(
      parseXlsx(renameCentralEntry(buffer, "xl/theme/b.xml", "xl/theme/a.xml"), {
        sheet: null,
        hasHeaderRow: true,
      })
    );
  });

  it("refuses bytes that are not a zip at all", () => {
    expectRefusal(parseXlsx(utf8("a,b\n1,2\n"), { sheet: null, hasHeaderRow: true }));
    expectRefusal(parseXlsx(Buffer.alloc(0), { sheet: null, hasHeaderRow: true }));
  });

  it("refuses a workbook whose sheet part is missing", () => {
    const buffer = makeWorkbook({ parts: {} });
    expectRefusal(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
  });

  it("applies the same header rules as the CSV codec", () => {
    const duplicate = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>email</t></is></c><c r="B1" t="inlineStr"><is><t>EMAIL</t></is></c></row>'
    );
    expectRefusal(parseXlsx(duplicate, { sheet: null, hasHeaderRow: true }));

    const empty = oneSheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row>'
    );
    expectRefusal(parseXlsx(empty, { sheet: null, hasHeaderRow: true }));
  });
});

describe("buildXlsx writes a workbook this codec can read back", () => {
  const table: Table = {
    headers: ["company", "qty", "note"],
    rows: [
      ["Ada & Co", "42", "line one\nline two"],
      ["Zeta <Ltd>", "-12.25", ""],
      ["Numbers as text", "007", "tab\there"],
    ],
  };

  it("round trips a table unchanged", () => {
    const buffer = buildXlsx(table, { sheetName: "Data" });
    const parsed = expectTable(parseXlsx(buffer, { sheet: null, hasHeaderRow: true }));
    expect(parsed).toStrictEqual(table);
  });

  it("round trips when selected by the sheet name it was given", () => {
    const buffer = buildXlsx(table, { sheetName: "Data" });
    expect(expectTable(parseXlsx(buffer, { sheet: "Data", hasHeaderRow: true }))).toStrictEqual(table);
    expect(expectTable(parseXlsx(buffer, { sheet: 0, hasHeaderRow: true }))).toStrictEqual(table);
  });

  it("writes the same bytes every time, so a replayed step produces the same artifact", () => {
    expect(buildXlsx(table, { sheetName: "Data" })).toStrictEqual(
      buildXlsx(table, { sheetName: "Data" })
    );
  });

  it("neutralises a leading formula character the same way the CSV writer does", () => {
    const dangerous: Table = {
      headers: ["payload"],
      rows: [["=cmd|'/c calc'!A1"], ["+1+1"], ["@SUM(A1)"], ["-lookup"], ["safe"]],
    };
    const parsed = expectTable(
      parseXlsx(buildXlsx(dangerous, { sheetName: "Sheet1" }), { sheet: null, hasHeaderRow: true })
    );
    expect(parsed.rows).toEqual([
      ["'=cmd|'/c calc'!A1"],
      ["'+1+1"],
      ["'@SUM(A1)"],
      // "-lookup" is not a lossless number, so it is written as text and gets
      // the same apostrophe. A real negative number does not.
      ["'-lookup"],
      ["safe"],
    ]);
  });

  it("writes a value as a number only when the decimal text survives a double", () => {
    const numbers: Table = {
      headers: ["value"],
      rows: [["42"], ["-12.5"], ["0"], ["007"], ["1.50"], ["1e5"], ["12345678901234567890"]],
    };
    const parsed = expectTable(
      parseXlsx(buildXlsx(numbers, { sheetName: "Sheet1" }), { sheet: null, hasHeaderRow: true })
    );
    expect(parsed.rows).toStrictEqual(numbers.rows);
  });

  it("throws rather than writing a table it could not read back", () => {
    expect(() => buildXlsx({ headers: [], rows: [] }, { sheetName: "Sheet1" })).toThrow();
    expect(() => buildXlsx({ headers: ["a"], rows: [["1", "2"]] }, { sheetName: "Sheet1" })).toThrow();
    expect(() => buildXlsx({ headers: ["a"], rows: [] }, { sheetName: "" })).toThrow();
    expect(() => buildXlsx({ headers: ["a"], rows: [] }, { sheetName: "a/b" })).toThrow();
    expect(() =>
      buildXlsx({ headers: ["a"], rows: [[String.fromCharCode(1)]] }, { sheetName: "Sheet1" })
    ).toThrow();
  });
});

describe("parseXlsx is deterministic", () => {
  it("returns deeply equal results for the same buffer twice", () => {
    const buffer = buildXlsx(
      { headers: ["a", "b"], rows: [["1", "x"], ["2", "y"]] },
      { sheetName: "Sheet1" }
    );
    const first = parseXlsx(buffer, { sheet: null, hasHeaderRow: true });
    const second = parseXlsx(buffer, { sheet: null, hasHeaderRow: true });
    expect(first).toStrictEqual(second);
  });

  it("refuses the same hostile buffer the same way twice", () => {
    const bomb = forgeDeclaredSize(
      oneSheet('<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>'),
      "xl/worksheets/sheet1.xml",
      0x7f000000
    );
    expect(parseXlsx(bomb, { sheet: null, hasHeaderRow: true })).toStrictEqual(
      parseXlsx(bomb, { sheet: null, hasHeaderRow: true })
    );
  });
});

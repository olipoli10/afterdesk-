import "server-only";
import { createHash } from "node:crypto";
import { unzipSync, zipSync } from "fflate";
import { scrubPdfIdentity, PdfIdentityError } from "./pdf-identity";

export class FileRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileRejectedError";
  }
}

export class ScannerUnavailableError extends Error {
  constructor(message = "File scanning is temporarily unavailable.") {
    super(message);
    this.name = "ScannerUnavailableError";
  }
}

type ScanResult = {
  buffer: Buffer;
  detectedMime: string;
  sha256: string;
  details: string;
};

const MIME: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function rejectKnownPayloads(buffer: Buffer) {
  const latin = buffer.toString("latin1");
  if (latin.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    throw new FileRejectedError("The file was rejected by malware protection.");
  }
  if (/vbaProject\.bin|_VBA_PROJECT|AutoOpen|Auto_Open/i.test(latin)) {
    throw new FileRejectedError("Macro-enabled documents are not accepted.");
  }
}

function assertSignature(buffer: Buffer, ext: string) {
  const matches =
    (ext === "pdf" && buffer.subarray(0, 5).toString() === "%PDF-") ||
    (ext === "png" &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (["jpg", "jpeg"].includes(ext) &&
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) ||
    (["docx", "xlsx"].includes(ext) &&
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b) ||
    ext === "csv";
  if (!matches) throw new FileRejectedError(`The bytes do not match a valid .${ext} file.`);
}

function inspectZipEnvelope(buffer: Buffer) {
  if (buffer.length < 22) {
    throw new FileRejectedError("The Office archive is incomplete.");
  }
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FileRejectedError("The Office archive is incomplete.");
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > 2_000 || centralOffset + centralSize > buffer.length) {
    throw new FileRejectedError("The Office archive is unsafe or malformed.");
  }

  let cursor = centralOffset;
  let totalExpanded = 0;
  for (let count = 0; count < entries; count++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new FileRejectedError("The Office archive directory is malformed.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const expanded = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (flags & 0x1 || compressed === 0xffffffff || expanded === 0xffffffff) {
      throw new FileRejectedError("Encrypted and ZIP64 Office files are not accepted.");
    }
    totalExpanded += expanded;
    if (
      expanded > 50 * 1024 * 1024 ||
      totalExpanded > 100 * 1024 * 1024 ||
      (compressed > 0 && expanded / compressed > 100)
    ) {
      throw new FileRejectedError("The Office archive expands beyond the safe limit.");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}

function scrubXml(xml: Uint8Array, tags: string[]): Uint8Array {
  let text = Buffer.from(xml).toString("utf8");
  for (const tag of tags) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escaped}>`, "gi"),
      `<${tag}></${tag}>`
    );
  }
  return Buffer.from(text, "utf8");
}

function sanitizeOffice(buffer: Buffer, ext: "docx" | "xlsx"): Buffer {
  inspectZipEnvelope(buffer);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch {
    throw new FileRejectedError("The Office file could not be safely inspected.");
  }
  const names = Object.keys(entries);
  const required = ext === "docx" ? "word/document.xml" : "xl/workbook.xml";
  if (!entries["[Content_Types].xml"] || !entries[required]) {
    throw new FileRejectedError(`This archive is not a valid .${ext} document.`);
  }
  const unsafeName = names.find((name) =>
    /(?:vbaProject|macrosheets|externalLinks|embeddings|oleObject|activeX|customXml|comments|threadedComments|persons)/i.test(
      name
    )
  );
  if (unsafeName) {
    throw new FileRejectedError(
      "Documents with macros, comments, external links, embedded objects or custom XML are not accepted."
    );
  }
  for (const [name, bytes] of Object.entries(entries)) {
    if (
      name.endsWith(".rels") &&
      /TargetMode\s*=\s*["']External["']/i.test(Buffer.from(bytes).toString("utf8"))
    ) {
      throw new FileRejectedError("Documents with external relationships are not accepted.");
    }
  }
  if (
    ext === "xlsx" &&
    /state\s*=\s*["'](?:hidden|veryHidden)["']/i.test(
      Buffer.from(entries["xl/workbook.xml"]).toString("utf8")
    )
  ) {
    throw new FileRejectedError("Spreadsheets with hidden sheets must be flattened before upload.");
  }

  /**
   * RULE 1: tracked changes carry the reviser's name in a field of their own.
   * `w:author` on <w:ins>/<w:del>/<w:moveFrom>/<w:moveTo> is NOT dc:creator and
   * survives a docProps-only scrub entirely — a worker who edits with Track
   * Changes on ships their real name inline in word/document.xml, straight to
   * the client. Blank the attribute everywhere it appears (headers and footers
   * carry it too, not just the main part).
   */
  /**
   * Parts that exist only to bind a human identity to the document. Word keeps
   * word/people.xml after comments are deleted, and it carries not just the
   * display name but the directory account behind it (w15:userId — usually the
   * worker's email). docProps/custom.xml holds "Last Saved By" and whatever
   * else a corporate template stamped in. Neither is needed to render the
   * document, so neither is scrubbed — both are dropped.
   */
  for (const doomed of ["word/people.xml", "docProps/custom.xml", "xl/persons/person.xml"]) {
    delete entries[doomed];
  }

  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const text = Buffer.from(bytes).toString("utf8");
    /**
     * Any namespace prefix (w:, w15:, w16cid:, or a document that declares its
     * own), either quote style, any case. The previous pattern required a
     * literal `w:` prefix and double quotes — single quotes and w15:author
     * both walked straight through — and it carried a backslash-escape rule
     * that XML does not have, so `w:author="C:\Users\maria\"` matched past the
     * real closing quote and swallowed the next attribute, emitting XML Word
     * refuses to open.
     */
    if (!/(?:^|\s)(?:[\w.-]+:)?author\s*=/i.test(text)) continue;
    entries[name] = Buffer.from(
      text.replace(
        /((?:^|\s)(?:[\w.-]+:)?author\s*=\s*)("[^"]*"|'[^']*')/gi,
        (_full, head: string) => `${head}"Redacted"`
      ),
      "utf8"
    );
  }

  /**
   * Embedded media keeps its own metadata: a phone screenshot pasted into a
   * report carries EXIF Artist and, worse, GPS coordinates of where it was
   * taken. Identical bytes uploaded as a bare .jpg are stripped; inside a
   * .docx they used to pass through untouched. Anything we cannot strip is
   * dropped rather than delivered.
   */
  for (const [name, bytes] of Object.entries(entries)) {
    if (!/^(?:word|xl|ppt)\/media\//i.test(name)) continue;
    const media = Buffer.from(bytes);
    const lower = name.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      entries[name] = stripJpegMetadata(media);
    } else if (lower.endsWith(".png")) {
      entries[name] = stripPngMetadata(media);
    } else if (!lower.endsWith(".gif")) {
      throw new FileRejectedError(
        `Remove the embedded ${lower.split(".").pop()} image, or re-insert it as a PNG or JPEG — we cannot strip its metadata.`
      );
    }
  }

  if (entries["docProps/core.xml"]) {
    entries["docProps/core.xml"] = scrubXml(entries["docProps/core.xml"], [
      "dc:creator",
      "cp:lastModifiedBy",
      "dc:title",
      "dc:subject",
      "cp:keywords",
      "cp:category",
    ]);
  }
  if (entries["docProps/app.xml"]) {
    entries["docProps/app.xml"] = scrubXml(entries["docProps/app.xml"], [
      "Company",
      "Manager",
      "Application",
      "AppVersion",
    ]);
  }
  return Buffer.from(zipSync(entries, { level: 6 }));
}

function stripJpegMetadata(buffer: Buffer): Buffer {
  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      parts.push(buffer.subarray(offset));
      return Buffer.concat(parts);
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) {
      throw new FileRejectedError("The JPEG file is malformed.");
    }
    if (marker !== 0xe1 && marker !== 0xed) {
      parts.push(buffer.subarray(offset, offset + length + 2));
    }
    offset += length + 2;
  }
  throw new FileRejectedError("The JPEG file is malformed.");
}

function stripPngMetadata(buffer: Buffer): Buffer {
  const chunks: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  const stripped = new Set(["tEXt", "zTXt", "iTXt", "eXIf"]);
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new FileRejectedError("The PNG file is malformed.");
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (!stripped.has(type)) chunks.push(buffer.subarray(offset, end));
    offset = end;
    if (type === "IEND") return Buffer.concat(chunks);
  }
  throw new FileRejectedError("The PNG file is incomplete.");
}

function validateCsv(buffer: Buffer) {
  if (buffer.includes(0)) throw new FileRejectedError("CSV files must be plain text.");
  const text = buffer.toString("utf8");
  if ((text.match(/\uFFFD/g)?.length ?? 0) > 3) {
    throw new FileRejectedError("The CSV encoding could not be read safely. Export it as UTF-8.");
  }
  if (
    /(?:^|[\r\n,;])\s*[=+\-@]\s*(?:cmd\||powershell|WEBSERVICE|HYPERLINK|DDE|IMPORTXML|IMPORTDATA)/i.test(
      text
    )
  ) {
    throw new FileRejectedError("The CSV contains an unsafe spreadsheet formula.");
  }
}

const CLOUDMERSIVE_DEFAULT_URL = "https://api.cloudmersive.com/virus/scan/file";

/**
 * Gate C.1 found clamd architecturally unreachable from Vercel (no TLS, no
 * auth, expects a trusted local network — none of which a serverless
 * function can give it). This calls Cloudmersive's hosted scanner over
 * HTTPS instead. One request per upload attempt, no retry: a scanner-side
 * retry would double-bill and only delay an already-decided fail-closed
 * outcome.
 */
type CloudmersiveResult = { CleanResult?: unknown; FoundViruses?: unknown };

async function scanWithCloudmersive(buffer: Buffer): Promise<string> {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY;
  const required =
    process.env.NODE_ENV === "production" || process.env.FILE_SCAN_MODE === "required";
  if (!apiKey) {
    if (required) throw new ScannerUnavailableError();
    return "heuristic-only";
  }
  const endpoint = process.env.CLOUDMERSIVE_API_URL || CLOUDMERSIVE_DEFAULT_URL;

  const form = new FormData();
  // Buffer's ArrayBufferLike backing can widen to SharedArrayBuffer, which
  // BlobPart rejects; Uint8Array.from guarantees a plain ArrayBuffer.
  form.set("inputFile", new Blob([Uint8Array.from(buffer)]), "upload");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new ScannerUnavailableError(
      error instanceof Error ? error.message : "File scanner request failed."
    );
  }

  if (!response.ok) {
    throw new ScannerUnavailableError(`Scanner returned HTTP ${response.status}.`);
  }

  let result: CloudmersiveResult;
  try {
    result = await response.json();
  } catch {
    throw new ScannerUnavailableError("Scanner returned a malformed response.");
  }

  const foundViruses = Array.isArray(result.FoundViruses) ? result.FoundViruses : [];
  // A populated FoundViruses is decisive even if CleanResult disagrees —
  // never fail open on a provider response that contradicts itself.
  if (foundViruses.length > 0) {
    throw new FileRejectedError("The file was rejected by malware protection.");
  }
  if (typeof result.CleanResult !== "boolean") {
    throw new ScannerUnavailableError("Scanner returned an ambiguous result.");
  }
  if (!result.CleanResult) {
    throw new FileRejectedError("The file was rejected by malware protection.");
  }
  return "cloudmersive";
}

export async function inspectAndSanitizeFile(buffer: Buffer, ext: string): Promise<ScanResult> {
  assertSignature(buffer, ext);
  rejectKnownPayloads(buffer);
  let sanitized = buffer;
  if (ext === "docx" || ext === "xlsx") sanitized = sanitizeOffice(buffer, ext);
  if (ext === "pdf") {
    // scrubPdfIdentity fails CLOSED — it refuses anything it cannot prove is
    // anonymous. Re-thrown as FileRejectedError so the upload route's existing
    // handling shows the worker the actionable message.
    try {
      sanitized = scrubPdfIdentity(buffer);
    } catch (e) {
      if (e instanceof PdfIdentityError) throw new FileRejectedError(e.message);
      throw e;
    }
  }
  if (ext === "jpg" || ext === "jpeg") sanitized = stripJpegMetadata(buffer);
  if (ext === "png") sanitized = stripPngMetadata(buffer);
  if (ext === "csv") validateCsv(buffer);
  const scanner = await scanWithCloudmersive(sanitized);
  return {
    buffer: sanitized,
    detectedMime: MIME[ext] ?? "application/octet-stream",
    sha256: createHash("sha256").update(sanitized).digest("hex"),
    details: `${scanner}; signature verified; metadata policy applied`,
  };
}

import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";
import { inspectAndSanitizeFile, FileRejectedError } from "@/lib/file-security";

/**
 * RULE 1 regression net.
 *
 * Every desktop exporter (Word, Canva, LibreOffice, Chrome's print dialog)
 * writes the operating-system account name into a PDF's /Author, so a worker
 * delivering a PDF was handing the client their real name — on a surface whose
 * whole premise is that the two sides never learn who the other is.
 *
 * A PDF's cross-reference table is a list of BYTE OFFSETS, so the scrub has to
 * be length-preserving or the file stops opening. These tests pin all three
 * properties the fix depends on: the name is gone, the byte length is
 * untouched, and a name we cannot reach gets the file REFUSED rather than
 * delivered with the leak intact.
 */

function pdf(body: string): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, "latin1");
}

/** Count unescaped parens the way a PDF lexer does. */
function parenBalance(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
  }
  return depth;
}

const WORKER = "Juan Dela Cruz";

describe("PDF identity scrubbing (RULE 1)", () => {
  it("removes the worker's name from the Info dictionary", async () => {
    const input = pdf(`1 0 obj\n<< /Author (${WORKER}) /Creator (Microsoft Word) >>\nendobj`);
    const out = await inspectAndSanitizeFile(input, "pdf");
    const text = out.buffer.toString("latin1");
    expect(text).not.toContain(WORKER);
    expect(text).not.toContain("Microsoft Word");
  });

  it("preserves byte length exactly, so the xref offsets stay valid", async () => {
    const input = pdf(`1 0 obj\n<< /Author (${WORKER}) /Title (Q3 report) >>\nendobj`);
    const out = await inspectAndSanitizeFile(input, "pdf");
    expect(out.buffer.length).toBe(input.length);
  });

  it("keeps the PDF structurally intact", async () => {
    const input = pdf(`1 0 obj\n<< /Author (${WORKER}) >>\nendobj\ntrailer\n<< /Root 1 0 R >>`);
    const out = await inspectAndSanitizeFile(input, "pdf");
    const text = out.buffer.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/Author (");
    expect(text).toContain("trailer");
    expect(text).toContain("%%EOF");
    expect(parenBalance(text)).toBe(0);
  });

  it("handles hex strings and escaped parentheses without corrupting the file", async () => {
    const hex = Buffer.from(WORKER, "latin1").toString("hex");
    const input = pdf(`<< /Author <${hex}> /Creator (Acme \\(Pro\\) Suite) >>`);
    const out = await inspectAndSanitizeFile(input, "pdf");
    const text = out.buffer.toString("latin1");
    expect(text).not.toContain(hex);
    expect(text).not.toContain("Acme");
    expect(out.buffer.length).toBe(input.length);
    expect(parenBalance(text)).toBe(0);
  });

  it("blanks the XMP packet but leaves its markup standing", async () => {
    const input = pdf(
      `<x:xmpmeta><rdf:RDF><dc:creator><rdf:Seq><rdf:li>${WORKER}</rdf:li></rdf:Seq></dc:creator>` +
        `<xmp:CreatorTool>Canva</xmp:CreatorTool></rdf:RDF></x:xmpmeta>`
    );
    const out = await inspectAndSanitizeFile(input, "pdf");
    const text = out.buffer.toString("latin1");
    expect(text).not.toContain(WORKER);
    expect(text).not.toContain("Canva");
    expect(text).toContain("<rdf:li>");
    expect(text).toContain("</dc:creator>");
    expect(out.buffer.length).toBe(input.length);
  });

  it("refuses a file whose name is hidden inside a compressed stream", async () => {
    const hidden = Buffer.from(`<< /Author (${WORKER}) >>`, "latin1");
    const deflated = Buffer.from(zlibSync(new Uint8Array(hidden)));
    const input = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
      deflated,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    await expect(inspectAndSanitizeFile(input, "pdf")).rejects.toBeInstanceOf(FileRejectedError);
  });

  it("refuses an encrypted PDF, which cannot be inspected at all", async () => {
    const input = pdf(`trailer\n<< /Encrypt 9 0 R /Root 1 0 R >>`);
    await expect(inspectAndSanitizeFile(input, "pdf")).rejects.toBeInstanceOf(FileRejectedError);
  });

  it("leaves a PDF that never named anyone byte-identical", async () => {
    const input = pdf(`1 0 obj\n<< /Type /Catalog >>\nendobj`);
    const out = await inspectAndSanitizeFile(input, "pdf");
    expect(out.buffer.equals(input)).toBe(true);
  });
});

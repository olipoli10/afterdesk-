import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";
import { inspectAndSanitizeFile, FileRejectedError } from "@/lib/file-security";

/**
 * The attacks that defeated the first version of the PDF scrubber, kept as a
 * suite so they can never come back.
 *
 * The first version was a denylist of ONE syntactic shape (`/Key(` or `/Key<`)
 * with a verifier that covered strictly less than the scrub, so 13 of 20
 * crafted inputs walked a worker's name through to the client. It also read
 * its match offsets from a snapshot taken before its own edits, which let a
 * hex fill run past its terminator and destroy a valid page object.
 *
 * The rule now is FAIL CLOSED: whatever the scrub cannot prove it cleaned,
 * the verifier refuses. So the assertion for a bypass is not "the name was
 * removed" — it is "the upload was rejected". Either is safe; silence is not.
 */

const WORKER = "Juan Dela Cruz";

function pdf(body: string): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, "latin1");
}

async function rejects(input: Buffer) {
  await expect(inspectAndSanitizeFile(input, "pdf")).rejects.toBeInstanceOf(FileRejectedError);
}

/** Accepted is only OK if the name is genuinely gone from the bytes. */
async function acceptedWithoutTheName(input: Buffer) {
  const out = await inspectAndSanitizeFile(input, "pdf");
  expect(out.buffer.toString("latin1")).not.toContain(WORKER);
}

describe("PDF scrubber — the bypasses that used to work", () => {
  it("indirect /Author reference is refused, not waved through", async () => {
    await rejects(
      pdf(
        `1 0 obj\n<< /Author 5 0 R >>\nendobj\n5 0 obj\n(${WORKER})\nendobj\ntrailer\n<< /Info 1 0 R >>`
      )
    );
  });

  it("a #-escaped key name (/Auth#6Fr) does not slip past", async () => {
    await rejects(pdf(`<< /Auth#6Fr (${WORKER}) >>`));
  });

  it("attribute-form XMP is handled", async () => {
    await acceptedWithoutTheName(
      pdf(`<x:xmpmeta><rdf:RDF><rdf:Description rdf:about="" xmp:CreatorTool="${WORKER}" ` +
        `pdf:Producer="${WORKER}"/></rdf:RDF></x:xmpmeta>`)
    );
  });

  it("XMP tags outside the original nine are handled", async () => {
    await acceptedWithoutTheName(
      pdf(
        `<x:xmpmeta><dc:contributor><rdf:Seq><rdf:li>${WORKER}</rdf:li></rdf:Seq></dc:contributor>` +
          `<pdfx:Company>${WORKER} Freelance</pdfx:Company>` +
          `<xmpRights:Owner><rdf:Bag><rdf:li>${WORKER}</rdf:li></rdf:Bag></xmpRights:Owner>` +
          `</x:xmpmeta>`
      )
    );
  });

  it("Title/Subject/Keywords hidden in a compressed stream are refused", async () => {
    const hidden = Buffer.from(
      `<< /Title (${WORKER} - timesheet) /Subject (by ${WORKER}) /Keywords (${WORKER}) >>`,
      "latin1"
    );
    const input = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
      Buffer.from(zlibSync(new Uint8Array(hidden))),
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    await rejects(input);
  });

  it("a compressed XMP CreatorTool is refused", async () => {
    const hidden = Buffer.from(
      `<x:xmpmeta><xmp:CreatorTool>${WORKER} MacBook Pro</xmp:CreatorTool></x:xmpmeta>`,
      "latin1"
    );
    const input = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Metadata >>\nstream\n", "latin1"),
      Buffer.from(zlibSync(new Uint8Array(hidden))),
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    await rejects(input);
  });

  it("a stream introduced by a bare CR is still inspected", async () => {
    const hidden = Buffer.from(`<< /Author (${WORKER}) >>`, "latin1");
    const input = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\r", "latin1"),
      Buffer.from(zlibSync(new Uint8Array(hidden))),
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    await rejects(input);
  });

  it("burying the payload past hundreds of decoy streams does not help", async () => {
    const decoy = Buffer.from(zlibSync(new Uint8Array(Buffer.from("<< /Type /Page >>", "latin1"))));
    const parts: Buffer[] = [Buffer.from("%PDF-1.7\n", "latin1")];
    for (let i = 0; i < 420; i += 1) {
      parts.push(Buffer.from("stream\n", "latin1"), decoy, Buffer.from("\nendstream\n", "latin1"));
    }
    const hidden = Buffer.from(`<< /Author (${WORKER}) >>`, "latin1");
    parts.push(
      Buffer.from("stream\n", "latin1"),
      Buffer.from(zlibSync(new Uint8Array(hidden))),
      Buffer.from("\nendstream\n%%EOF\n", "latin1")
    );
    await rejects(Buffer.concat(parts));
  });
});

describe("PDF scrubber — it must not corrupt a valid file", () => {
  it("a key-lookalike inside a string body does not run away over the object", async () => {
    // `/Title <4A75616E>` here is string CONTENT of /Author, not a second key.
    // The first version treated it as one and filled to the next '>' in the
    // file, destroying /Type and /MediaBox and leaving an unclosed literal.
    const input = pdf(
      `1 0 obj\n<< /Author (x /Title <4A75616E> y) /Type /Page /MediaBox [0 0 612 792] >>\nendobj`
    );
    const out = await inspectAndSanitizeFile(input, "pdf");
    const text = out.buffer.toString("latin1");
    expect(out.buffer.length).toBe(input.length);
    expect(text).toContain("/Type /Page");
    expect(text).toContain("/MediaBox [0 0 612 792]");
    let depth = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\\") { i += 1; continue; }
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") depth -= 1;
    }
    expect(depth).toBe(0);
  });

  it("a dictionary after /Creator is not mistaken for a hex string", async () => {
    const input = pdf(`<< /Creator << /Nested /Val >> /Type /Page /MediaBox [0 0 10 10] >>`);
    const out = await inspectAndSanitizeFile(input, "pdf");
    const text = out.buffer.toString("latin1");
    expect(out.buffer.length).toBe(input.length);
    expect(text).toContain("/MediaBox [0 0 10 10]");
  });
});

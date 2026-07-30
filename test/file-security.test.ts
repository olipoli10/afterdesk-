import { beforeEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
} from "@/lib/file-security";

describe("file inspection", () => {
  beforeEach(() => {
    delete process.env.CLAMAV_HOST;
    process.env.FILE_SCAN_MODE = "optional";
  });

  it("hashes and accepts a signature-valid PDF in local heuristic mode", async () => {
    const result = await inspectAndSanitizeFile(
      Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8"),
      "pdf"
    );
    expect(result.detectedMime).toBe("application/pdf");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.details).toContain("signature verified");
  });

  it("rejects extension spoofing and the antivirus test payload", async () => {
    await expect(inspectAndSanitizeFile(Buffer.from("not a pdf"), "pdf")).rejects.toBeInstanceOf(
      FileRejectedError
    );
    await expect(
      inspectAndSanitizeFile(
        Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!"),
        "csv"
      )
    ).rejects.toBeInstanceOf(FileRejectedError);
  });

  it("blocks dangerous spreadsheet formulas in CSV", async () => {
    await expect(
      inspectAndSanitizeFile(
        Buffer.from("name,value\nAlice,=HYPERLINK(\"https://evil.invalid\")"),
        "csv"
      )
    ).rejects.toThrow("unsafe spreadsheet formula");
    await expect(
      inspectAndSanitizeFile(Buffer.from("name,value\nAlice,-DDE(server)"), "csv")
    ).rejects.toThrow("unsafe spreadsheet formula");
  });

  it("blocks Office documents with external relationships", async () => {
    const document = zipSync({
      "[Content_Types].xml": strToU8("<Types></Types>"),
      "word/document.xml": strToU8("<w:document></w:document>"),
      "word/_rels/document.xml.rels": strToU8(
        '<Relationships><Relationship TargetMode="External" Target="https://evil.invalid"/></Relationships>'
      ),
    });
    await expect(
      inspectAndSanitizeFile(Buffer.from(document), "docx")
    ).rejects.toThrow("external relationships");
  });

  it("rejects truncated Office archives without leaking a parser error", async () => {
    await expect(
      inspectAndSanitizeFile(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "docx")
    ).rejects.toThrow("archive is incomplete");
  });
});

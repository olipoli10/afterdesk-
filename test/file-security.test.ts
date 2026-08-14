import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  FileRejectedError,
  ScannerUnavailableError,
  inspectAndSanitizeFile,
} from "@/lib/file-security";

describe("file inspection", () => {
  beforeEach(() => {
    delete process.env.CLOUDMERSIVE_API_KEY;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const pdfBytes = () => Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8");

describe("Cloudmersive scanning", () => {
  const TEST_KEY = "test-cloudmersive-key";

  beforeEach(() => {
    process.env.CLOUDMERSIVE_API_KEY = TEST_KEY;
    process.env.FILE_SCAN_MODE = "required";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.CLOUDMERSIVE_API_KEY;
  });

  it("accepts a clean file and records the truthful scanner label", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ CleanResult: true, FoundViruses: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await inspectAndSanitizeFile(pdfBytes(), "pdf");
    expect(result.details).toContain("cloudmersive");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a file the scanner reports as infected", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({
            CleanResult: false,
            FoundViruses: [{ FileName: "upload", VirusName: "Trojan.Generic" }],
          })
        )
    );
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      FileRejectedError
    );
  });

  it("rejects a mocked EICAR-positive provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({
            CleanResult: false,
            FoundViruses: [{ FileName: "upload", VirusName: "Eicar-Test-Signature" }],
          })
        )
    );
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      FileRejectedError
    );
  });

  it("fails closed on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
  });

  it("fails closed on a scanner timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"))
    );
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
  });

  it.each([401, 403])("fails closed on HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status })));
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
  });

  it("fails closed on HTTP 429 with exactly one outbound request and no retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed on HTTP 500 with no retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
  });

  it("fails closed when CleanResult is missing from an otherwise-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ FoundViruses: [] })));
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
  });

  it("rejects a contradictory response — CleanResult true but a virus listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({
            CleanResult: true,
            FoundViruses: [{ FileName: "upload", VirusName: "Trojan.Generic" }],
          })
        )
    );
    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      FileRejectedError
    );
  });

  it("fails closed in production when the API key is missing, before any provider call", async () => {
    delete process.env.CLOUDMERSIVE_API_KEY;
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(inspectAndSanitizeFile(pdfBytes(), "pdf")).rejects.toBeInstanceOf(
      ScannerUnavailableError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the documented request contract: HTTPS POST, Apikey header, multipart inputFile field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ CleanResult: true, FoundViruses: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await inspectAndSanitizeFile(pdfBytes(), "pdf");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\//);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Apikey).toBe(TEST_KEY);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).has("inputFile")).toBe(true);
  });

  it("never puts the API key into a thrown error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    const error = await inspectAndSanitizeFile(pdfBytes(), "pdf").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScannerUnavailableError);
    expect(String((error as Error).message)).not.toContain(TEST_KEY);
  });
});

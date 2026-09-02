import { describe, expect, it } from "vitest";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
} from "@/lib/file-security";

function minimalM4a() {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftyp", "ascii"),
    Buffer.from("M4A ", "ascii"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("M4A isom", "ascii"),
  ]);
}

describe("R25 selected voice-note security", () => {
  it("recognizes a bounded recorder-generated M4A envelope", async () => {
    const result = await inspectAndSanitizeFile(minimalM4a(), "m4a");
    expect(result.detectedMime).toBe("audio/mp4");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("refuses extension-only and executable-shaped uploads", async () => {
    await expect(inspectAndSanitizeFile(Buffer.from("not audio"), "m4a"))
      .rejects.toBeInstanceOf(FileRejectedError);
    await expect(inspectAndSanitizeFile(
      Buffer.concat([minimalM4a(), Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")]),
      "m4a",
    )).rejects.toBeInstanceOf(FileRejectedError);
  });
});

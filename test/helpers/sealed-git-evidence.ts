import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function assertCheckoutMatchesSealedBlob(checkout: Buffer, blob: Buffer): void {
  if (checkout.equals(blob)) return;
  const decoded = checkout.toString("utf8");
  // Permit Git's CRLF checkout conversion only; reject invalid UTF-8, content,
  // whitespace, BOM and final-newline edits. Never hash these normalized bytes.
  if (!Buffer.from(decoded, "utf8").equals(checkout) ||
      !Buffer.from(decoded.replaceAll("\r\n", "\n"), "utf8").equals(blob)) {
    throw new Error("SEALED_EVIDENCE_CHECKOUT_CONTENT_CHANGED");
  }
}

export function readSealedGitEvidence(path: string): Buffer {
  const blob = execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: process.cwd(), windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  assertCheckoutMatchesSealedBlob(readFileSync(path), blob);
  return blob;
}

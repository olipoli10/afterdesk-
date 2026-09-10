import "server-only";
import { timingSafeEqual } from "node:crypto";
export function personalWorkerAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header || header.length > 2048) return false;
  const expected = Buffer.from(`Bearer ${secret}`); const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Storage abstraction. Local-disk driver for development; the production
 * driver will be Cloudflare R2 with presigned PUT/GET (required anyway —
 * Vercel caps direct uploads at ~4.5MB and the platform cap is 200MB).
 * Keys are server-generated and opaque; original filenames never appear in
 * keys or URLs.
 */

const ROOT = path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");

function resolveKey(key: string): string {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep) && p !== ROOT) {
    throw new Error("Invalid storage key.");
  }
  return p;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const p = resolveKey(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await stat(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch {
    // already gone — purge is idempotent
  }
}

/** Returns a web ReadableStream for a stored object (route handlers stream it out). */
export function objectStream(key: string): ReadableStream {
  const nodeStream = createReadStream(resolveKey(key));
  return Readable.toWeb(nodeStream) as ReadableStream;
}

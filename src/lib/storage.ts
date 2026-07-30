import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Private local-disk storage driver. Production must mount a persistent,
 * non-public volume at ./storage or replace this module with an object-storage
 * adapter. Keeping the root statically scoped also prevents deployment
 * tracing from sweeping the entire application directory.
 * Keys are server-generated and opaque; original filenames never appear in
 * keys or URLs.
 */

const ROOT = path.join(process.cwd(), "storage");

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

export async function readObject(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await stat(resolveKey(key));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch (error) {
    // Only an already-absent object is a successful idempotent purge. Storage
    // outages and permission failures must be retried, never hidden.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Returns a web ReadableStream for a stored object (route handlers stream it out). */
export function objectStream(key: string): ReadableStream {
  const nodeStream = createReadStream(resolveKey(key));
  return Readable.toWeb(nodeStream) as ReadableStream;
}

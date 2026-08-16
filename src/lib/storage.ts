import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Private object storage. Every consumer (upload route, download route,
 * admin file actions, the retention sweep) calls only the five functions
 * below — putObject / readObject / objectExists / deleteObject /
 * objectStream — and never learns which backend is behind them. Access
 * control is enforced entirely by the CALLING route before any of these
 * run (see src/app/api/files/[id]/download/route.ts): this module has no
 * concept of who is allowed to read a key, on purpose. It is a bucket, not
 * a gate.
 *
 * TWO BACKENDS, chosen at import time by whether R2 credentials exist —
 * the same "dev falls back, prod configures" convention as googleEnabled
 * in src/lib/auth.ts and the RESEND_API_KEY gate in src/lib/email.ts:
 *
 *   - R2 (Cloudflare, S3-compatible) when R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
 *     R2_SECRET_ACCESS_KEY / R2_BUCKET are all set. This is REQUIRED in
 *     production — Vercel's filesystem is ephemeral per invocation, so a
 *     task's uploaded files would silently vanish between requests on the
 *     local-disk path.
 *   - Local disk (./storage) otherwise, so `npm run dev` keeps working with
 *     no cloud account. NODE_ENV === "production" refuses to fall back
 *     silently to disk, same fail-fast posture as BETTER_AUTH_SECRET.
 *
 * Keys are server-generated and opaque (src/app/api/upload/route.ts);
 * original filenames never appear in a key.
 */

/* Explicit, testable storage mode (Phase 1.4B.4). Decided once at import:
 *
 *   preview-disabled  every VERCEL_ENV=preview deployment. No S3 client is
 *                     ever constructed, no disk and no network are touched,
 *                     and all five operations fail with the named
 *                     StoragePreviewDisabledError - synchronously for
 *                     objectStream, before any stream exists. Even four
 *                     accidentally-present R2 values cannot re-enable it.
 *   r2                the existing Cloudflare backend when all four
 *                     credentials are present outside preview.
 *   local-dev         the existing disk backend, outside preview AND
 *                     outside production only.
 *
 * A PARTIAL R2 configuration (1-3 of the four values) is a configuration
 * mistake in every environment: it throws at import instead of silently
 * degrading to disabled-or-disk. Production without full R2 keeps its
 * original import-time failure verbatim. */
export type StorageMode = "preview-disabled" | "r2" | "local-dev";

export class StoragePreviewDisabledError extends Error {
  constructor(op: string) {
    super(
      `StoragePreviewDisabledError: ${op} is disabled on preview deployments - ` +
        "preview carries no file storage by design (the preview write gate " +
        "already refuses every mutation; no real task file can exist here)."
    );
    this.name = "StoragePreviewDisabledError";
  }
}

const R2_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
const r2Present = R2_KEYS.filter((k) => Boolean(process.env[k]));
const r2Configured = r2Present.length === R2_KEYS.length;

if (r2Present.length > 0 && !r2Configured) {
  throw new Error(
    `partial R2 configuration: ${r2Present.length} of ${R2_KEYS.length} values set ` +
      `(${r2Present.join(", ")}). Set all four or none - a partial set never ` +
      "falls back to disk or to disabled storage."
  );
}

export const STORAGE_MODE: StorageMode =
  process.env.VERCEL_ENV === "preview"
    ? "preview-disabled"
    : r2Configured
      ? "r2"
      : "local-dev";

if (process.env.NODE_ENV === "production" && STORAGE_MODE === "local-dev") {
  throw new Error(
    "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET must all be set in " +
      "production. Local-disk storage does not survive a request past a serverless " +
      "invocation and must never be used for real task files."
  );
}

const bucket = process.env.R2_BUCKET as string;
const s3 =
  STORAGE_MODE === "r2"
    ? new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
        },
      })
    : null;

/** local-disk backend — unchanged from before, dev-only. */
const ROOT = path.join(process.cwd(), "storage");
function resolveKey(key: string): string {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep) && p !== ROOT) {
    throw new Error("Invalid storage key.");
  }
  return p;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  if (STORAGE_MODE === "preview-disabled") throw new StoragePreviewDisabledError("putObject");
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }));
    return;
  }
  const p = resolveKey(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
}

export async function readObject(key: string): Promise<Buffer> {
  if (STORAGE_MODE === "preview-disabled") throw new StoragePreviewDisabledError("readObject");
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return readFile(resolveKey(key));
}

export async function objectExists(key: string): Promise<boolean> {
  if (STORAGE_MODE === "preview-disabled") throw new StoragePreviewDisabledError("objectExists");
  if (s3) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      // The S3 SDK reports a missing object as either a typed NotFound
      // error or a raw 404, depending on provider — R2 has been observed
      // doing both across SDK versions, so both are treated as "absent"
      // and anything else still propagates.
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }
  try {
    await stat(resolveKey(key));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (STORAGE_MODE === "preview-disabled") throw new StoragePreviewDisabledError("deleteObject");
  if (s3) {
    // S3-compatible DeleteObject is already idempotent — deleting an
    // absent key succeeds rather than 404ing, matching the local-disk
    // path's own ENOENT-is-success handling below.
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
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
  /* synchronous refusal BEFORE any stream object is created */
  if (STORAGE_MODE === "preview-disabled") throw new StoragePreviewDisabledError("objectStream");
  if (s3) {
    // objectStream() has to be synchronous (its return value goes straight
    // into `new NextResponse(...)`, which needs a real ReadableStream, not
    // a Promise<ReadableStream>), but fetching the object from R2 is
    // inherently async. This wrapper defers that fetch to the stream's
    // first pull() — a caller that never reads the body never opens a
    // connection, same laziness createReadStream already gave the
    // local-disk path — then holds ONE upstream reader for the rest of the
    // transfer instead of re-acquiring it per chunk.
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    return new ReadableStream({
      async pull(controller) {
        if (!reader) {
          const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          const upstream = (await res.Body!.transformToWebStream()) as ReadableStream<Uint8Array>;
          reader = upstream.getReader();
        }
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      async cancel(reason) {
        // A client that aborts the download (closes the tab mid-transfer)
        // must not leave the R2 connection open for the rest of its
        // lifetime — release it the same way an early break out of a
        // for-await loop would.
        await reader?.cancel(reason);
      },
    });
  }
  const nodeStream = createReadStream(resolveKey(key));
  return Readable.toWeb(nodeStream) as ReadableStream;
}

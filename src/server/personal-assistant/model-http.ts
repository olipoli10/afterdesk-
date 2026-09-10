import "server-only";

/** Bound streamed command bodies too; Content-Length is not an authority. */
export async function readPersonalModelCommandBody(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 4096) { await reader.cancel(); return null; }
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

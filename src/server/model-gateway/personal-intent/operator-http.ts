import "server-only";
import { types } from "node:util";
import { z } from "zod";

type Refusal = "INVALID_BODY" | "BODY_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "REQUEST_EXPIRED";
export class PersonalModelOperatorHttpError extends Error {
  constructor(readonly code: Refusal) { super(`PERSONAL_MODEL_OPERATOR_${code}`); }
}
const refuse = (code: Refusal): never => { throw new PersonalModelOperatorHttpError(code); };

/** Captured once at route entry. This is a deadline, never actor authority. */
export function personalModelOperatorRequestContext(request: Request) {
  let wall = Date.now(), mono = performance.now();
  if (!Number.isFinite(wall) || !Number.isFinite(mono)) return refuse("REQUEST_EXPIRED");
  const deadlineAt = wall + 15000, monotoneDeadlineAt = mono + 15000, signal = request.signal;
  const remaining = () => {
    const nextWall = Date.now(), nextMono = performance.now();
    if (!Number.isFinite(nextWall) || !Number.isFinite(nextMono) || nextWall < wall || nextMono < mono
      || signal.aborted || nextWall >= deadlineAt || nextMono >= monotoneDeadlineAt) return refuse("REQUEST_EXPIRED");
    wall = nextWall; mono = nextMono;
    return Math.min(deadlineAt - wall, monotoneDeadlineAt - mono);
  };
  remaining();
  return Object.freeze({ deadlineAt, monotoneDeadlineAt, signal, remaining });
}
export type PersonalModelOperatorRequestContext = ReturnType<typeof personalModelOperatorRequestContext>;

const setupCommand = z.object({ version: z.literal("personal-model-setup-command-v1"),
  setupRef: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  apiKey: z.string().min(24).max(512).regex(/^[A-Za-z0-9_-]+$/),
}).strict();
const rotationCommand = setupCommand.extend({
  version: z.literal("personal-model-credential-rotation-v1"),
  commandId: z.string().uuid(),
}).strict();
const command = z.discriminatedUnion("version", [setupCommand, rotationCommand]);

/** Specialized secret-bearing JSON body reader. No DB, env, auth, logging or
 * network call. The route must independently enforce exact origin and owner.
 */
export async function readPersonalModelOperatorCommand(request: Request, context: PersonalModelOperatorRequestContext) {
  context.remaining();
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return refuse("UNSUPPORTED_MEDIA_TYPE");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d{1,10}$/.test(length) || !Number.isSafeInteger(Number(length)))) return refuse("INVALID_BODY");
  if (length !== null && Number(length) > 4096) return refuse("BODY_TOO_LARGE");
  if (!request.body) return refuse("INVALID_BODY");
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = request.body.getReader(); } catch { return refuse("INVALID_BODY"); }
  const chunks: Uint8Array[] = []; let bytes = 0, count = 0, assembled: Buffer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectWait!: (error: Error) => void;
  const ended = new Promise<never>((_, reject) => { rejectWait = reject; });
  const cancel = () => { try { void reader.cancel().catch(() => {}); } catch { /* best effort, never expose a stream error */ } };
  const stop = () => { rejectWait(new PersonalModelOperatorHttpError("REQUEST_EXPIRED")); cancel(); };
  try {
    context.signal.addEventListener("abort", stop, { once: true });
    timer = setTimeout(stop, Math.max(1, Math.floor(context.remaining())));
    for (;;) {
      context.remaining();
      const next = await Promise.race([reader.read(), ended]);
      context.remaining();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return refuse("INVALID_BODY");
      if (++count > 4096 || bytes + next.value.byteLength > 4096) return refuse("BODY_TOO_LARGE");
      const copy = new Uint8Array(next.value); bytes += copy.byteLength; chunks.push(copy);
    }
    assembled = Buffer.concat(chunks, bytes);
    const data = command.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(assembled)));
    if (!data.success) return refuse("INVALID_BODY");
    context.remaining();
    return Object.freeze(data.data);
  } catch (error) {
    // A stream may reject a mutated lookalike of our exported error. Never
    // return the dependency's object/message or execute a code accessor/proxy.
    if (error !== null && typeof error === "object" && !types.isProxy(error)
      && Object.getPrototypeOf(error) === PersonalModelOperatorHttpError.prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(error, "code");
      const code = descriptor && "value" in descriptor ? descriptor.value : undefined;
      if (code === "INVALID_BODY" || code === "BODY_TOO_LARGE" || code === "UNSUPPORTED_MEDIA_TYPE" || code === "REQUEST_EXPIRED") return refuse(code);
    }
    return refuse("INVALID_BODY");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    context.signal.removeEventListener("abort", stop);
    cancel();
    try { reader.releaseLock(); } catch { /* do not wait for a hung cancellation */ }
    chunks.forEach(chunk => chunk.fill(0)); assembled?.fill(0);
    // Parsed JavaScript strings cannot guarantee secure erasure; never persist them.
  }
}

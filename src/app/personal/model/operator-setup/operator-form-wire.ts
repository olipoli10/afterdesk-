import { z } from "zod";

export const OPERATOR_FORM_ORIGIN = "https://endvera-core-sandbox-afterdesk.vercel.app";
export const OPERATOR_FORM_API = "/api/endvera/v1/personal/model/operator-setup";
const fail = (): never => { throw new Error("OPERATOR_FORM_REFUSED"); };
const validText = (v: string) => !v.includes("\0") && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const label = z.string().min(1).max(160).refine(validText);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,191}$/);
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const canonical = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/).refine(v => {
  const n = Date.parse(v); return Number.isFinite(n) && new Date(n).toISOString() === (v.length === 20 ? v.slice(0, -1) + ".000Z" : v);
});
const viewSchema = z.object({ version: z.literal("personal-model-operator-form-v1"), setupRef: uuid,
  provider: z.literal("openrouter"), model: label, providerEndpoint: label, purpose: z.literal("personal_intent_candidate_v1"),
  expiresAt: utc, state: z.enum(["INPUT_AVAILABLE", "HISTORY_ONLY"]), executionAuthorized: z.literal(false), providerVerified: z.literal(false),
}).strict();
export type OperatorFormView = Readonly<z.infer<typeof viewSchema>>;

/** Flat, bounded RSC metadata copy. No Node/server imports or authority claim. */
export function parseOperatorFormView(raw: unknown): OperatorFormView {
  try {
    if (!raw || typeof raw !== "object" || Object.getPrototypeOf(raw) !== Object.prototype) return fail();
    const keys = Reflect.ownKeys(raw); if (keys.length !== 10) return fail();
    const descriptors = Object.getOwnPropertyDescriptors(raw), copy: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string" || key === "__proto__") return fail();
      const d = descriptors[key]; if (!d.enumerable || !("value" in d) || !(typeof d.value === "string" || d.value === false)) return fail();
      if (typeof d.value === "string" && d.value.length > 160) return fail(); copy[key] = d.value;
    }
    return Object.freeze(viewSchema.parse(copy));
  } catch { return fail(); }
}

const receiptSchema = z.object({ version: z.literal("personal-model-setup-receipt-v1"), status: z.literal("APPLIED_NOT_ACTIVATED"),
  setupRef: uuid, targetProfile: z.literal("PERSONAL_PILOT"), sourceHead: z.string().regex(/^[a-f0-9]{40}$/),
  schemaCatalogSha256: sha, manifestSha256: sha, manifestHash: canonical, artifactHash: canonical, configurationSha256: sha,
  routeId: id, routeHash: canonical, policyId: id, policyHash: canonical, publishedAt: utc, inspectedAt: utc,
  executionAuthorized: z.literal(false), providerVerified: z.literal(false), consentCreated: z.literal(false),
  runtimeActivated: z.literal(false), billingSettled: z.literal(false), automaticRetry: z.literal(false),
}).strict();

/** Wire shape/scope only, not B1 archive integrity or independent DB proof. */
export function parseOperatorSetupReceipt(rawJson: unknown, setupRef: string) {
  try {
    if (typeof rawJson !== "string" || rawJson.length > 16384 || new TextEncoder().encode(rawJson).byteLength > 16384) return fail();
    const receipt = receiptSchema.parse(JSON.parse(rawJson));
    if (receipt.setupRef !== setupRef || Date.parse(receipt.publishedAt) > Date.parse(receipt.inspectedAt)) return fail();
    return Object.freeze(receipt);
  } catch { return fail(); }
}

export async function readOperatorSetupReceipt(response: Response, setupRef: string, signal: AbortSignal) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { try { void reader?.cancel().catch(() => {}); } catch { /* opaque */ } };
  let stop!: () => void;
  const aborted = new Promise<never>((_, reject) => { stop = () => { cancel(); reject(new Error("OPERATOR_FORM_REFUSED")); }; });
  try {
    if (signal.aborted || response.status !== 200 || response.redirected || !response.body
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") ?? "")) return fail();
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d{1,6}$/.test(length) || Number(length) > 16384)) return fail();
    reader = response.body.getReader(); signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) return fail();
    let bytes = 0, count = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      if (signal.aborted) return fail();
      const part = await Promise.race([reader.read(), aborted]); if (signal.aborted) return fail();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || ++count > 16384 || bytes + part.value.byteLength > 16384) return fail();
      const copy = new Uint8Array(part.value); chunks.push(copy); bytes += copy.byteLength;
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const value = parseOperatorSetupReceipt(new TextDecoder("utf-8", { fatal: true }).decode(joined), setupRef);
    if (signal.aborted) return fail(); return value;
  } catch { return fail(); }
  finally { signal.removeEventListener("abort", stop); cancel(); try { reader?.releaseLock(); } catch { /* no wait */ } }
}

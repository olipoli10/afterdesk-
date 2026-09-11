import { getSessionUser, consumeRateLimit } from "@/lib/authz";
import { types } from "node:util";
import { inspectPersonalModelIngressConfiguration, assertPersonalModelIngressWindow,
  PERSONAL_MODEL_INGRESS_TARGET, PERSONAL_MODEL_INGRESS_LIMITS } from "@/server/model-gateway/personal-intent/operator-ingress-contract";
import { applyPersonalModelOperatorIngress, readPersonalModelOperatorIngress,
  assertPersonalModelOperatorIngressPublication } from "@/server/model-gateway/personal-intent/operator-ingress";
import { personalModelOperatorRequestContext, readPersonalModelOperatorCommand,
  PersonalModelOperatorHttpError, type PersonalModelOperatorRequestContext } from "@/server/model-gateway/personal-intent/operator-http";

export const runtime = "nodejs";
const configKey = "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION";
const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization",
  "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };
const response = (status: number, code: string) => new Response(JSON.stringify({ status: code, automaticRetry: false }), { status, headers });

// An HttpOnly browser session and exact Origin are required. This is not the
// native/mobile connector API and does not accept its absent/custom Origin.
async function handle(request: Request, write: boolean) {
  let dispatched = false;
  try {
    const context = personalModelOperatorRequestContext(request);
    const raw = process.env[configKey];
    let config: ReturnType<typeof inspectPersonalModelIngressConfiguration>;
    try {
      config = inspectPersonalModelIngressConfiguration(raw);
      if (write) assertPersonalModelIngressWindow(raw, Date.now());
    } catch { return response(404, "UNAVAILABLE"); }
    const live = () => {
      context.remaining();
      if (process.env[configKey] !== raw) throw new Error("SETUP_CONTEXT_CHANGED");
      if (write) assertPersonalModelIngressWindow(raw, Date.now());
    };
    live();
    const url = new URL(request.url);
    if (url.origin !== PERSONAL_MODEL_INGRESS_TARGET.origin || url.username || url.password || url.hash) return response(404, "UNAVAILABLE");
    const origin = request.headers.get("origin");
    if (write ? origin !== PERSONAL_MODEL_INGRESS_TARGET.origin : origin !== null && origin !== PERSONAL_MODEL_INGRESS_TARGET.origin) return response(403, "REFUSED");
    if (request.headers.get("sec-fetch-site") === "cross-site") return response(403, "REFUSED");
    if (request.headers.has("authorization")) return response(401, "AUTHENTICATION_REQUIRED");
    if (write ? url.search !== "" : [...url.searchParams.keys()].length !== 1
      || url.searchParams.get("setupRef") !== config.configuration.setupRef) return response(400, "INVALID_REQUEST");
    const user = await getSessionUser(); live();
    if (!user || user.role !== "CLIENT" || user.emailVerified !== true) return response(401, "AUTHENTICATION_REQUIRED");
    if (user.id !== config.manifest.ownerUserId) return response(404, "UNAVAILABLE");
    const actor = Object.freeze({ userId: user.id, role: user.role, emailVerified: user.emailVerified });
    const limited = await consumeRateLimit(`personal-model-setup:${actor.userId}`, { window: 60, max: 5 }); live();
    if (limited !== true) return response(429, "RATE_LIMITED");
    // The orchestrator requires a closed context: do not spread the HTTP helper.
    const ingressContext = coreContext(context);
    let receipt: Awaited<ReturnType<typeof applyPersonalModelOperatorIngress>>;
    if (write) {
      let command: Awaited<ReturnType<typeof readPersonalModelOperatorCommand>>;
      try { command = await readPersonalModelOperatorCommand(request, context); }
      catch (error) {
        live();
        // Never reflect a stream/dependency error or execute an error getter.
        const code = error !== null && typeof error === "object" && !types.isProxy(error)
          && Object.getPrototypeOf(error) === PersonalModelOperatorHttpError.prototype
          ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
        const value = code && "value" in code ? code.value : undefined;
        if (value === "BODY_TOO_LARGE") return response(413, "INVALID_REQUEST");
        if (value === "UNSUPPORTED_MEDIA_TYPE") return response(415, "INVALID_REQUEST");
        return response(400, "INVALID_REQUEST");
      }
      live();
      if (command.setupRef !== config.configuration.setupRef) return response(404, "UNAVAILABLE");
      dispatched = true;
      receipt = await applyPersonalModelOperatorIngress({ actor, setupRef: command.setupRef, apiKey: command.apiKey }, process.env, ingressContext);
    } else {
      dispatched = true;
      receipt = await readPersonalModelOperatorIngress({ actor, setupRef: config.configuration.setupRef }, process.env, ingressContext);
    }
    live(); assertPersonalModelOperatorIngressPublication(receipt);
    const serialized = JSON.stringify(receipt);
    if (Buffer.byteLength(serialized, "utf8") > PERSONAL_MODEL_INGRESS_LIMITS.receiptUtf8) throw new Error("RECEIPT_TOO_LARGE");
    live(); assertPersonalModelOperatorIngressPublication(receipt);
    return new Response(serialized, { status: 200, headers });
  } catch {
    // UNKNOWN does not assert rollback. In particular, do not retry POST after
    // timeout or lost acknowledgement; only authenticated GET may reconcile.
    return response(503, dispatched ? "UNKNOWN" : "REFUSED");
  }
}
function coreContext(context: PersonalModelOperatorRequestContext) {
  return { deadlineAt: context.deadlineAt, monotoneDeadlineAt: context.monotoneDeadlineAt, signal: context.signal };
}
export async function POST(request: Request) { return handle(request, true); }
export async function GET(request: Request) { return handle(request, false); }

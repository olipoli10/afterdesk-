import { timingSafeEqual } from "node:crypto";
import { inspectPersonalModelIngressConfiguration, PERSONAL_MODEL_INGRESS_LIMITS } from "@/server/model-gateway/personal-intent/operator-ingress-contract";
import {
  applyPersonalModelOperatorIngress,
  assertPersonalModelOperatorIngressPublication,
} from "@/server/model-gateway/personal-intent/operator-ingress";
import {
  personalModelOperatorRequestContext,
  readPersonalModelOperatorCommand,
} from "@/server/model-gateway/personal-intent/operator-http";

export const runtime = "nodejs";
const headers = {
  "cache-control": "private, no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};
const response = (status: number, code: string) => new Response(
  JSON.stringify({ status: code, automaticRetry: false }),
  { status, headers },
);

function authorized(request: Request): boolean {
  const expected = process.env.ENDVERA_PERSONAL_MODEL_BOOTSTRAP_TOKEN;
  const supplied = request.headers.get("x-endvera-bootstrap-token");
  if (!expected || !supplied || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

/** One-time controller bootstrap for the exact signed owner manifest.
 * Removing ENDVERA_PERSONAL_MODEL_BOOTSTRAP_TOKEN makes this route unavailable.
 */
export async function POST(request: Request) {
  let dispatched = false;
  try {
    if (!authorized(request)) return response(404, "UNAVAILABLE");
    let ingress: ReturnType<typeof inspectPersonalModelIngressConfiguration>;
    try {
      ingress = inspectPersonalModelIngressConfiguration(
        process.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION,
      );
    } catch {
      return response(503, "CONFIGURATION_REFUSED");
    }
    let context: ReturnType<typeof personalModelOperatorRequestContext>;
    try {
      context = personalModelOperatorRequestContext(request);
    } catch {
      return response(408, "REQUEST_CONTEXT_REFUSED");
    }
    let command: Awaited<ReturnType<typeof readPersonalModelOperatorCommand>>;
    try {
      command = await readPersonalModelOperatorCommand(request, context);
    } catch {
      return response(400, "COMMAND_REFUSED");
    }
    if (command.setupRef !== ingress.configuration.setupRef) return response(404, "UNAVAILABLE");
    dispatched = true;
    const receipt = await applyPersonalModelOperatorIngress({
      actor: { userId: ingress.manifest.ownerUserId, role: "CLIENT", emailVerified: true },
      setupRef: command.setupRef,
      apiKey: command.apiKey,
    }, process.env, {
      deadlineAt: context.deadlineAt,
      monotoneDeadlineAt: context.monotoneDeadlineAt,
      signal: context.signal,
    });
    context.remaining();
    assertPersonalModelOperatorIngressPublication(receipt);
    const encoded = JSON.stringify(receipt);
    if (Buffer.byteLength(encoded, "utf8") > PERSONAL_MODEL_INGRESS_LIMITS.receiptUtf8) throw new Error("RECEIPT_TOO_LARGE");
    return new Response(encoded, { status: 200, headers });
  } catch {
    return response(503, dispatched ? "UNKNOWN" : "REFUSED");
  }
}

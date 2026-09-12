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
import { requireConnectorKey } from "@/server/personal-assistant/credential-cipher";

export const runtime = "nodejs";
const headers = {
  "access-control-allow-origin": "https://openrouter.ai",
  "cache-control": "private, no-store",
  "content-type": "application/json; charset=utf-8",
  vary: "Origin",
  "x-content-type-options": "nosniff",
};
const response = (status: number, code: string) => new Response(
  JSON.stringify({ status: code, automaticRetry: false }),
  { status, headers },
);

function storedConfiguration(): string | undefined {
  const count = process.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_COUNT;
  if (count === undefined) return process.env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION;
  if (!/^[1-4]$/.test(count)) return undefined;
  const parts = Array.from({ length: Number(count) }, (_, index) =>
    process.env[`ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_${index + 1}`]);
  if (parts.some(part => typeof part !== "string" || part.length === 0)) return undefined;
  return parts.join("");
}

function authorizedValue(supplied: string | null): boolean {
  const expected = process.env.ENDVERA_PERSONAL_MODEL_BOOTSTRAP_TOKEN;
  if (!expected || !supplied || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

function authorized(request: Request): boolean {
  return authorizedValue(request.headers.get("x-endvera-bootstrap-token"));
}

async function browserHandoff(request: Request): Promise<{ request: Request; authorized: boolean }> {
  if (request.headers.get("origin") !== "https://openrouter.ai"
    || !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
    return { request, authorized: false };
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d{1,10}$/.test(length) || Number(length) > 4096)) return { request, authorized: false };
  let encoded: string;
  try { encoded = await request.text(); } catch { return { request, authorized: false }; }
  if (Buffer.byteLength(encoded, "utf8") > 4096) return { request, authorized: false };
  const parameters = new URLSearchParams(encoded);
  const keys = [...parameters.keys()].sort();
  if (keys.length !== 4 || keys.join(",") !== "apiKey,setupRef,token,version"
    || [...new Set(keys)].length !== keys.length) return { request, authorized: false };
  const token = parameters.get("token");
  const setupRef = parameters.get("setupRef") ?? "";
  const apiKey = parameters.get("apiKey") ?? "";
  const version = parameters.get("version") ?? "";
  const forwarded = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ version, setupRef, apiKey }),
    signal: request.signal,
  });
  return { request: forwarded, authorized: authorizedValue(token) };
}

export function OPTIONS(request: Request) {
  if (request.headers.get("origin") !== "https://openrouter.ai") return response(403, "ORIGIN_REFUSED");
  return new Response(null, { status: 204, headers: {
    ...headers,
    "access-control-allow-headers": "content-type,x-endvera-bootstrap-token",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "60",
  } });
}

/** One-time controller bootstrap for the exact signed owner manifest.
 * Removing ENDVERA_PERSONAL_MODEL_BOOTSTRAP_TOKEN makes this route unavailable.
 */
export async function POST(request: Request) {
  let dispatched = false;
  try {
    const handoff = await browserHandoff(request);
    if (!authorized(request) && !handoff.authorized) return response(404, "UNAVAILABLE");
    request = handoff.request;
    const stored = storedConfiguration();
    const normalizedConfiguration = typeof stored === "string" ? stored.replace(/^\uFEFF/, "").trim() : stored;
    let ingress: ReturnType<typeof inspectPersonalModelIngressConfiguration>;
    try {
      ingress = inspectPersonalModelIngressConfiguration(
        normalizedConfiguration,
      );
    } catch {
      const raw = normalizedConfiguration;
      if (typeof raw !== "string") return response(503, "CONFIGURATION_MISSING");
      if (Buffer.byteLength(raw, "utf8") > PERSONAL_MODEL_INGRESS_LIMITS.configurationUtf8) {
        return response(503, "CONFIGURATION_TOO_LARGE");
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.version !== "personal-model-operator-ingress-configuration-v1") {
          return response(503, "CONFIGURATION_VERSION_REFUSED");
        }
      } catch {
        const length = Buffer.byteLength(raw, "utf8");
        if (!raw.startsWith("{")) return response(503, `CONFIGURATION_JSON_PREFIX_${raw.charCodeAt(0) || 0}_${length}`);
        if (!raw.endsWith("}")) return response(503, `CONFIGURATION_JSON_TRUNCATED_${raw.charCodeAt(raw.length - 1) || 0}_${length}`);
        return response(503, `CONFIGURATION_JSON_PARSE_${length}`);
      }
      return response(503, "CONFIGURATION_CONTRACT_REFUSED");
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
    try {
      const connectorKey = requireConnectorKey(process.env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
      connectorKey.fill(0);
    } catch {
      return response(503, "CREDENTIAL_STORAGE_REFUSED");
    }
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

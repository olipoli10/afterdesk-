import {
  commandResultSchema,
  mobileBootstrapSchema,
  parseMobileCockpit,
} from "@/lib/contracts";
import { mobileApiBaseUrl } from "@/lib/config";
import { mobileCommandSchema } from "@/lib/commands";

export type MobileApiErrorCode =
  | "UNAUTHENTICATED"
  | "REFUSED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "OUTCOME_UNKNOWN"
  | "INVALID_RESPONSE";

export class MobileApiError extends Error {
  constructor(
    public readonly code: MobileApiErrorCode,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "MobileApiError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function statusCode(status: number): MobileApiErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "REFUSED";
}

export class MobileApi {
  constructor(
    private readonly options: {
      baseUrl?: string;
      fetchImpl?: FetchLike;
      getCookie: () => string;
      timeoutMs?: number;
    },
  ) {}

  private async request(path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    const cookie = this.options.getCookie();
    try {
      const response = await (this.options.fetchImpl ?? fetch)(
        `${this.options.baseUrl ?? mobileApiBaseUrl()}${path}`,
        {
          ...init,
          credentials: "omit",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...init.headers,
          },
        },
      );
      if (!response.ok) throw new MobileApiError(statusCode(response.status), response.status);
      try {
        return await response.json();
      } catch {
        throw new MobileApiError("INVALID_RESPONSE", response.status);
      }
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError("OUTCOME_UNKNOWN");
    } finally {
      clearTimeout(timeout);
    }
  }

  async bootstrap() {
    const value = await this.request("/api/endvera/v1/mobile/bootstrap", { method: "GET" });
    try {
      return mobileBootstrapSchema.parse(value);
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async cockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/construction/operations?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      return parseMobileCockpit(value);
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async command(command: unknown) {
    const parsedCommand = mobileCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/construction/operations", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = commandResultSchema.parse(value);
      const expectedResult = {
        RECORD_RECEIVABLE: "RECEIVABLE_RECORDED",
        RECORD_PAYMENT: "PAYMENT_RECORDED",
        SCHEDULE_FOLLOW_UP: "FOLLOW_UP_SCHEDULED",
      }[parsedCommand.type];
      if (result.resultType !== expectedResult || result.requestId !== parsedCommand.requestId) {
        throw new Error("MOBILE_COMMAND_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }
}

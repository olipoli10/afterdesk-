import {
  commandResultSchema,
  mobileBootstrapSchema,
  parseMobileCockpit,
} from "@/lib/contracts";
import { mobileApiBaseUrl } from "@/lib/config";
import { mobileCommandSchema } from "@/lib/commands";
import {
  mobileAssistantHistorySchema,
  mobileAssistantRequestSchema,
  mobileAssistantResultSchema,
} from "@/lib/assistant";
import {
  mobilePreparedActionDecisionCommandSchema,
  mobilePreparedActionDecisionResultSchema,
} from "@/lib/prepared-actions";
import {
  mobileEvidenceUploadCommandSchema,
  mobileEvidenceUploadResultSchema,
} from "@/lib/evidence";
import { parseMobileProjectTimeline } from "@/lib/timeline";
import {
  mobileRevokePermissionCommandSchema,
  mobileRevokePermissionResultSchema,
  parseMobilePermissionCenter,
} from "@/lib/permissions";
import {
  mobileUnifiedIntentEnvelopeSchema,
  mobileUnifiedIntentResultSchema,
} from "@/lib/intent";
import {
  mobileJobCommandResultSchema,
  mobileJobCommandSchema,
  parseMobileJobSchedule,
} from "@/lib/jobs";
import {
  mobileFollowUpCommandSchema,
  mobileFollowUpResultSchema,
  parseMobileFollowUpQueue,
} from "@/lib/follow-ups";
import {
  mobileEconomicCommandSchema,
  mobileEconomicResultSchema,
  parseMobileEconomicCockpit,
} from "@/lib/invoices";
import {
  mobileHumanEscalationCommandSchema,
  mobileHumanEscalationResultSchema,
  parseMobileHumanEscalationCockpit,
} from "@/lib/human-escalations";
import {
  mobileCalendarConnectorCommandResultSchema,
  mobileCalendarConnectorCommandSchema,
  parseMobileCalendarConnectorCockpit,
} from "@/lib/calendar-connectors";
import {
  mobileMessagingCommandResultSchema,
  mobileMessagingCommandSchema,
  parseMobileMessagingCockpit,
} from "@/lib/messages";
import {
  mobilePrepareCallWorkCommandSchema,
  mobilePrepareCallWorkResultSchema,
  mobileVoiceNoteCommandSchema,
  mobileVoiceNoteResultSchema,
  parseMobileVoiceCallsCockpit,
} from "@/lib/voice-calls";
import {mobileEmailAccountCommandSchema,mobileEmailDraftCommandSchema,parseMobileEmailCockpit} from "@/lib/email-inbox";

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
            ...(init.body && !(init.body instanceof FormData)
              ? { "Content-Type": "application/json" }
              : {}),
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

  async assistantHistory(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/assistant?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const history = mobileAssistantHistorySchema.parse(value);
      if (history.workspaceId !== workspaceId) throw new Error("MOBILE_ASSISTANT_HISTORY_MISMATCH");
      return history;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async assistant(request: unknown) {
    const parsedRequest = mobileAssistantRequestSchema.parse(request);
    const value = await this.request("/api/endvera/v1/mobile/assistant", {
      method: "POST",
      body: JSON.stringify(parsedRequest),
    });
    try {
      const result = mobileAssistantResultSchema.parse(value);
      if (result.commandId !== parsedRequest.requestId) {
        throw new Error("MOBILE_ASSISTANT_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async unifiedIntent(envelope: unknown) {
    const parsedEnvelope = mobileUnifiedIntentEnvelopeSchema.parse(envelope);
    const value = await this.request("/api/endvera/v1/mobile/intent", {
      method: "POST",
      body: JSON.stringify(parsedEnvelope),
    });
    try {
      const result = mobileUnifiedIntentResultSchema.parse(value);
      if (
        result.envelopeId !== parsedEnvelope.envelopeId ||
        result.workspaceId !== parsedEnvelope.workspaceId ||
        result.provenance.sourceId !== parsedEnvelope.source.sourceId
      ) {
        throw new Error("MOBILE_INTENT_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async decidePreparedAction(command: unknown) {
    const parsedCommand = mobilePreparedActionDecisionCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/prepared-actions", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobilePreparedActionDecisionResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.actionId !== parsedCommand.actionId ||
        result.decision !== parsedCommand.decision ||
        result.version !== parsedCommand.expectedVersion ||
        result.fingerprint !== parsedCommand.expectedFingerprint
      ) {
        throw new Error("MOBILE_PREPARED_ACTION_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async uploadEvidence(command: unknown) {
    const parsedCommand = mobileEvidenceUploadCommandSchema.parse(command);
    const form = new FormData();
    for (const [key, value] of Object.entries(parsedCommand)) {
      if (key === "uri") continue;
      form.append(key, String(value));
    }
    form.append(
      "file",
      {
        uri: parsedCommand.uri,
        name: parsedCommand.fileName,
        type: parsedCommand.mimeType,
      } as unknown as Blob,
    );
    const value = await this.request("/api/endvera/v1/mobile/evidence", {
      method: "POST",
      body: form,
    });
    try {
      const result = mobileEvidenceUploadResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.projectId !== parsedCommand.projectId ||
        result.loopId !== parsedCommand.loopId ||
        result.kind !== parsedCommand.kind
      ) {
        throw new Error("MOBILE_EVIDENCE_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async projectTimeline(workspaceId: string, projectId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/timeline?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileProjectTimeline(value);
      if (result.workspaceId !== workspaceId || result.project.id !== projectId) {
        throw new Error("MOBILE_TIMELINE_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async jobSchedule(workspaceId: string, projectId?: string) {
    const query = new URLSearchParams({ workspaceId });
    if (projectId) query.set("projectId", projectId);
    const value = await this.request(`/api/endvera/v1/mobile/jobs?${query.toString()}`, { method: "GET" });
    try {
      const result = parseMobileJobSchedule(value);
      if (result.workspaceId !== workspaceId) throw new Error("MOBILE_JOB_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async jobCommand(command: unknown) {
    const parsedCommand = mobileJobCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/jobs", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileJobCommandResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.jobId !== parsedCommand.jobId ||
        result.action !== parsedCommand.action
      ) {
        throw new Error("MOBILE_JOB_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async followUpQueue(workspaceId: string, projectId?: string) {
    const query = new URLSearchParams({ workspaceId });
    if (projectId) query.set("projectId", projectId);
    const value = await this.request(`/api/endvera/v1/mobile/follow-ups?${query.toString()}`, { method: "GET" });
    try {
      const result = parseMobileFollowUpQueue(value);
      if (result.workspaceId !== workspaceId) throw new Error("MOBILE_FOLLOW_UP_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async followUpCommand(command: unknown) {
    const parsedCommand = mobileFollowUpCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/follow-ups", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileFollowUpResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.followUpId !== parsedCommand.followUpId ||
        result.action !== parsedCommand.action
      ) {
        throw new Error("MOBILE_FOLLOW_UP_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async economicCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/invoices?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileEconomicCockpit(value);
      if (result.workspaceId !== workspaceId) {
        throw new Error("MOBILE_INVOICE_WORKSPACE_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async economicCommand(command: unknown) {
    const parsedCommand = mobileEconomicCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/invoices", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileEconomicResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.action !== parsedCommand.action
      ) {
        throw new Error("MOBILE_INVOICE_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async humanEscalationCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/human-escalations?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileHumanEscalationCockpit(value);
      if (result.workspaceId !== workspaceId) {
        throw new Error("MOBILE_HUMAN_SUPPORT_WORKSPACE_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async humanEscalationCommand(command: unknown) {
    const parsedCommand = mobileHumanEscalationCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/human-escalations", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileHumanEscalationResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.action !== parsedCommand.action
      ) {
        throw new Error("MOBILE_HUMAN_SUPPORT_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async calendarConnectorCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/calendar-connectors?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileCalendarConnectorCockpit(value);
      if (result.workspaceId !== workspaceId) {
        throw new Error("MOBILE_CALENDAR_CONNECTOR_WORKSPACE_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async calendarConnectorCommand(command: unknown) {
    const parsedCommand = mobileCalendarConnectorCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/calendar-connectors", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileCalendarConnectorCommandResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.provider !== parsedCommand.provider
      ) {
        throw new Error("MOBILE_CALENDAR_CONNECTOR_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async messagingCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/communications?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileMessagingCockpit(value);
      if (result.workspaceId !== workspaceId) {
        throw new Error("MOBILE_MESSAGING_WORKSPACE_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async messagingCommand(command: unknown) {
    const parsedCommand = mobileMessagingCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/communications", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileMessagingCommandResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.purpose !== parsedCommand.purpose ||
        (parsedCommand.action === "PREPARE_POLICY_BOUND_SMS"
          ? !("actionId" in result) || result.actionId !== parsedCommand.actionId
          : !("contactId" in result) || result.contactId !== parsedCommand.contactId)
      ) {
        throw new Error("MOBILE_MESSAGING_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async voiceCallsCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/voice-calls?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileVoiceCallsCockpit(value);
      if (result.workspaceId !== workspaceId) {
        throw new Error("MOBILE_VOICE_WORKSPACE_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async prepareCallWork(command: unknown) {
    const parsedCommand = mobilePrepareCallWorkCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/voice-calls", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobilePrepareCallWorkResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.projectId !== parsedCommand.projectId ||
        result.contactId !== parsedCommand.contactId
      ) {
        throw new Error("MOBILE_VOICE_CALL_WORK_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async uploadVoiceNote(command: unknown) {
    const parsedCommand = mobileVoiceNoteCommandSchema.parse(command);
    const form = new FormData();
    for (const [key, value] of Object.entries(parsedCommand)) {
      if (key === "uri") continue;
      form.append(key, String(value));
    }
    form.append(
      "file",
      {
        uri: parsedCommand.uri,
        name: parsedCommand.fileName,
        type: parsedCommand.mimeType,
      } as unknown as Blob,
    );
    const value = await this.request("/api/endvera/v1/mobile/voice-calls/notes", {
      method: "POST",
      body: form,
    });
    try {
      const result = mobileVoiceNoteResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.projectId !== parsedCommand.projectId ||
        result.durationMs !== parsedCommand.durationMs ||
        result.sizeBytes !== parsedCommand.sizeBytes
      ) {
        throw new Error("MOBILE_VOICE_NOTE_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async emailCockpit(workspaceId:string){const value=await this.request(`/api/endvera/v1/mobile/email-inbox?workspaceId=${encodeURIComponent(workspaceId)}`,{method:"GET"});try{const result=parseMobileEmailCockpit(value);if(result.workspaceId!==workspaceId)throw new Error("MOBILE_EMAIL_WORKSPACE_MISMATCH");return result;}catch{throw new MobileApiError("INVALID_RESPONSE");}}

  async emailCommand(command:unknown){const account=mobileEmailAccountCommandSchema.safeParse(command);const draft=mobileEmailDraftCommandSchema.safeParse(command);const parsed=account.success?account.data:draft.success?draft.data:null;if(!parsed)throw new MobileApiError("REFUSED");return this.request("/api/endvera/v1/mobile/email-inbox",{method:"POST",body:JSON.stringify(parsed)});}

  async permissionCenter(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/permissions?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobilePermissionCenter(value);
      if (result.workspace.id !== workspaceId) {
        throw new Error("MOBILE_PERMISSION_WORKSPACE_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async revokePermission(command: unknown) {
    const parsedCommand = mobileRevokePermissionCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/permissions", {
      method: "POST",
      body: JSON.stringify(parsedCommand),
    });
    try {
      const result = mobileRevokePermissionResultSchema.parse(value);
      if (
        result.commandId !== parsedCommand.commandId ||
        result.workspaceId !== parsedCommand.workspaceId ||
        result.accountId !== parsedCommand.accountId ||
        result.grantId !== (parsedCommand.action === "REVOKE_GRANT_LOCAL" ? parsedCommand.grantId : null)
      ) {
        throw new Error("MOBILE_PERMISSION_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }
}

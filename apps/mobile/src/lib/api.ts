import {
  commandResultSchema,
  mobileBootstrapSchema,
  parseMobileCockpit,
} from "@/lib/contracts";
import { mobileApiBaseUrl } from "@/lib/config";
import { personalGoogleStatusSchema, personalGoogleDisconnectSchema, personalGoogleEventsSchema, personalGoogleActionsSchema, validatePersonalGoogleLaunch } from "@/lib/personal-google";
import { personalOutboxSchema, personalPairingSchema, personalPhoneSchema } from "@/lib/personal-service";
import { personalModelCommand, personalModelStatusSchema, personalModelPreparedSchema, personalModelConsentSchema, personalModelDisconnectedSchema } from "@/lib/personal-model";
import { personalModelReviewsSchema } from "@/lib/personal-model-reviews";
import { parsePersonalCorrelatedCalendarList } from "@/lib/personal-correlated-calendar-list";
import {
  personalDeviceClaimResultSchema,
  personalDeviceReceiptResultSchema,
  personalDeviceRegistrationSchema,
  personalDeviceStatusSchema,
  type PersonalDeviceReceipt,
  type PersonalDeviceRegistration,
} from "@/lib/personal-device-bridge";
import { correlatedApprovalId, snapshotCorrelatedApprovalJson, personalCorrelatedCalendarApprovalCommandSchema,
  parsePersonalCorrelatedCalendarApprovalOffer, parsePersonalCorrelatedCalendarApprovalResult, parsePersonalCorrelatedCalendarApprovalResponse,
  type PersonalCorrelatedCalendarApprovalCommand } from "@/lib/personal-correlated-calendar-approval";
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
import { parseMobileProjectProvenance } from "@/lib/provenance";
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
import {mobileAccountingAccountCommandSchema,mobileAccountingDraftCommandSchema,parseMobileAccountingCockpit} from "@/lib/accounting";
import {
  mobileAuthorityDecisionCommandSchema,
  mobileAuthorityEvaluateCommandSchema,
  mobileAuthorityPolicyCommandSchema,
  mobileAuthorityResultSchema,
  parseMobileAuthorityCockpit,
} from "@/lib/authority-policies";
import {
  mobilePrivacyCommandSchema,
  mobilePrivacyResultSchema,
  parseMobilePrivacyCockpit,
} from "@/lib/privacy";
import {
  mobileReliabilityCommandSchema,
  mobileReliabilityResultSchema,
  parseMobileReliabilityCockpit,
} from "@/lib/reliability";
import {
  mobileOnboardingCommandSchema,
  mobileOnboardingResultSchema,
  parseMobileOnboardingCockpit,
} from "@/lib/onboarding";
import { parseMobileGoldenWorkflow } from "@/lib/golden-workflow";
import {
  mobileProjectBrainCommandResultSchema,
  mobileProjectBrainCommandSchema,
  mobileProjectBrainSourceCommandSchema,
  parseMobileProjectBrainIntake,
} from "@/lib/project-brain-intake";
import {
  mobileProjectBrainUnderstandingCommandSchema,
  parseProjectBrainUnderstandingProjection,
} from "@/lib/project-brain-understanding-review";
import {
  mobileProjectBrainAssistantCommandSchema,
  mobileProjectBrainAssistantMemoryProjectionSchema,
  mobileProjectBrainAssistantResultSchema,
} from "@/lib/project-brain-assistant-memory";
import {
  mobileApproveSecretaryBroadcastCommandSchema,
  mobileSecretaryBroadcastApprovalResultSchema,
  mobileSecretaryBroadcastCockpitSchema,
} from "@/lib/secretary-broadcasts";

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
  async personalCorrelatedCalendarApprovalOffer(workspaceId: string, reviewId: string, signal?: AbortSignal) {
    const workspace = correlatedApprovalId.parse(workspaceId), review = correlatedApprovalId.parse(reviewId);
    const value = await this.request(`/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer?workspaceId=${encodeURIComponent(workspace)}&reviewId=${encodeURIComponent(review)}`, { method: "GET", signal }, 15_000);
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
    let result: ReturnType<typeof parsePersonalCorrelatedCalendarApprovalOffer>;
    try { result = parsePersonalCorrelatedCalendarApprovalOffer(value, workspace, review); } catch { throw new MobileApiError("INVALID_RESPONSE"); }
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN"); return result;
  }
  async personalCorrelatedCalendarApprovalResult(workspaceId: string, reviewId: string, signal?: AbortSignal) {
    const workspace = correlatedApprovalId.parse(workspaceId), review = correlatedApprovalId.parse(reviewId);
    const value = await this.request(`/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result?workspaceId=${encodeURIComponent(workspace)}&reviewId=${encodeURIComponent(review)}`, { method: "GET", signal }, 15_000);
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
    let result: ReturnType<typeof parsePersonalCorrelatedCalendarApprovalResult>;
    try { result = parsePersonalCorrelatedCalendarApprovalResult(value, workspace, review); } catch { throw new MobileApiError("INVALID_RESPONSE"); }
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN"); return result;
  }
  async approvePersonalCorrelatedCalendar(raw: PersonalCorrelatedCalendarApprovalCommand, signal?: AbortSignal) {
    const command = personalCorrelatedCalendarApprovalCommandSchema.parse(snapshotCorrelatedApprovalJson(raw));
    const value = await this.request("/api/endvera/v1/personal/model/correlated-calendar-reviews/approve", { method: "POST", signal, body: JSON.stringify(command) }, 30_000);
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
    let result: ReturnType<typeof parsePersonalCorrelatedCalendarApprovalResponse>;
    try { result = parsePersonalCorrelatedCalendarApprovalResponse(value, command); } catch { throw new MobileApiError("INVALID_RESPONSE"); }
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN"); return result;
  }
  async personalCorrelatedCalendarReviews(workspaceId: string, signal?: AbortSignal) {
    const value = await this.request(`/api/endvera/v1/personal/model/correlated-calendar-reviews?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET", signal }, 15_000);
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
    let list: ReturnType<typeof parsePersonalCorrelatedCalendarList>;
    try { list = parsePersonalCorrelatedCalendarList(value, workspaceId); }
    catch { throw new MobileApiError("INVALID_RESPONSE"); }
    if (signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
    return list;
  }
  async personalModelReviews(workspaceId: string) {
    return personalModelReviewsSchema.parse(await this.request(`/api/endvera/v1/personal/model/reviews?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" }));
  }
  async personalModelStatus(workspaceId: string) {
    return personalModelStatusSchema.parse(await this.request(`/api/endvera/v1/personal/model/status?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" }));
  }
  async preparePersonalModel(workspaceId: string) {
    return personalModelPreparedSchema.parse(await this.request("/api/endvera/v1/personal/model/consent", { method: "POST", body: JSON.stringify(personalModelCommand(workspaceId, "PREPARE")) }));
  }
  async consentPersonalModel(workspaceId: string) {
    return personalModelConsentSchema.parse(await this.request("/api/endvera/v1/personal/model/consent", { method: "POST", body: JSON.stringify(personalModelCommand(workspaceId, "CONSENT")) }));
  }
  async disconnectPersonalModel(workspaceId: string) {
    return personalModelDisconnectedSchema.parse(await this.request("/api/endvera/v1/personal/model/disconnect", { method: "POST", body: JSON.stringify(personalModelCommand(workspaceId, "DISCONNECT")) }));
  }
  async personalPhone(workspaceId: string) {
    return personalPhoneSchema.parse(await this.request(`/api/endvera/v1/personal/phone?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" }));
  }
  async pairPersonalPhone(workspaceId: string, allowSelfSms: boolean, allowSelfVoice: boolean) {
    return personalPairingSchema.parse(await this.request("/api/endvera/v1/personal/phone", { method: "POST", body: JSON.stringify({ action: "PAIR", workspaceId, allowSelfSms, allowSelfVoice }) }));
  }
  async disconnectPersonalPhone(workspaceId: string) {
    return this.request("/api/endvera/v1/personal/phone", { method: "POST", body: JSON.stringify({ action: "DISCONNECT", workspaceId }) });
  }
  async personalOutbox(workspaceId: string) {
    return personalOutboxSchema.parse(await this.request(`/api/endvera/v1/personal/outbox?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" }));
  }
  async preparePersonalMessage(workspaceId: string, to: string, text: string, kind: "sms_outbound" | "voice_outbound", requestId: string) {
    return this.request("/api/endvera/v1/personal/outbox", { method: "POST", body: JSON.stringify({ action: "PREPARE", workspaceId, kind, to, text, requestId }) });
  }
  async approvePersonalMessage(workspaceId: string, operationId: string, expectedRequestHash: string) {
    return this.request("/api/endvera/v1/personal/outbox", { method: "POST", body: JSON.stringify({ action: "APPROVE_AND_SEND", workspaceId, operationId, expectedRequestHash }) });
  }
  async personalGoogleStatus(workspaceId: string) {
    return personalGoogleStatusSchema.parse(await this.request(`/api/endvera/v1/personal/google/status?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" }));
  }
  async personalGoogleActions(workspaceId: string) {
    return personalGoogleActionsSchema.parse(await this.request(`/api/endvera/v1/personal/google/actions?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" }));
  }
  async approvePersonalCalendar(workspaceId: string, operationId: string, expectedRequestHash: string) {
    return this.request("/api/endvera/v1/personal/google/actions", { method: "POST", body: JSON.stringify({ action: "APPROVE_AND_INSERT", workspaceId, operationId, expectedRequestHash }) });
  }

  async connectPersonalGoogle(workspaceId: string, mode: "READ_ONLY" | "READ_WRITE") {
    return validatePersonalGoogleLaunch(await this.request("/api/endvera/v1/personal/google/connect", { method: "POST", body: JSON.stringify({ workspaceId, action: "CONNECT", mode }) }), this.options.baseUrl ?? mobileApiBaseUrl());
  }

  async disconnectPersonalGoogle(workspaceId: string) {
    return personalGoogleDisconnectSchema.parse(await this.request("/api/endvera/v1/personal/google/connect", { method: "POST", body: JSON.stringify({ workspaceId, action: "DISCONNECT" }) }));
  }

  async personalGoogleEvents(workspaceId: string, start: string, end: string) {
    return personalGoogleEventsSchema.parse(await this.request(`/api/endvera/v1/personal/google/events?${new URLSearchParams({ workspaceId, start, end })}`, { method: "GET" }));
  }

  async registerPersonalDevice(command: PersonalDeviceRegistration) {
    const parsed = personalDeviceRegistrationSchema.parse(command);
    return personalDeviceStatusSchema.parse(await this.request("/api/endvera/v1/mobile/device-bridge", {
      method: "POST", body: JSON.stringify(parsed),
    }));
  }

  async personalDeviceStatus(workspaceId: string, deviceId: string, deviceSecret: string) {
    return personalDeviceStatusSchema.parse(await this.request(
      `/api/endvera/v1/mobile/device-bridge?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET", headers: { "X-Endvera-Device-Id": deviceId, "X-Endvera-Device-Secret": deviceSecret } },
    ));
  }

  async claimPersonalDeviceDirective(workspaceId: string, deviceId: string, deviceSecret: string, directiveId: string, expectedRequestHash: string) {
    return personalDeviceClaimResultSchema.parse(await this.request("/api/endvera/v1/mobile/device-bridge", {
      method: "POST", headers: { "X-Endvera-Device-Id": deviceId, "X-Endvera-Device-Secret": deviceSecret },
      body: JSON.stringify({ schemaVersion: 1, action: "CLAIM", workspaceId, directiveId, expectedRequestHash }),
    }));
  }

  async recordPersonalDeviceReceipt(deviceId: string, deviceSecret: string, receipt: PersonalDeviceReceipt) {
    return personalDeviceReceiptResultSchema.parse(await this.request("/api/endvera/v1/mobile/device-bridge", {
      method: "POST", headers: { "X-Endvera-Device-Id": deviceId, "X-Endvera-Device-Secret": deviceSecret },
      body: JSON.stringify(receipt),
    }));
  }

  async revokePersonalDevice(workspaceId: string, deviceId: string) {
    return this.request("/api/endvera/v1/mobile/device-bridge", {
      method: "POST", body: JSON.stringify({ schemaVersion: 1, action: "REVOKE", workspaceId, deviceId }),
    });
  }

  async approvePersonalDeviceCalendar(workspaceId: string, operationId: string, expectedRequestHash: string) {
    return this.request("/api/endvera/v1/personal/device-calendar/actions", {
      method: "POST", body: JSON.stringify({ schemaVersion: 1, action: "APPROVE_EXACT_DEVICE_CALENDAR_WRITE", workspaceId, operationId, expectedRequestHash }),
    });
  }

  constructor(
    private readonly options: {
      baseUrl?: string;
      fetchImpl?: FetchLike;
      getCookie: () => string;
      browserManagedCredentials?: boolean;
      timeoutMs?: number;
    },
  ) {}

  private async request(path: string, init: RequestInit, boundedTimeoutMs?: number) {
    const controller = new AbortController();
    let removeCallerAbort: (() => void) | undefined;
    let rejectBoundedDeadline: ((reason: unknown) => void) | undefined;
    const boundedDeadline = boundedTimeoutMs === undefined ? null : new Promise<never>((_, reject) => { rejectBoundedDeadline = reject; });
    const timeout = setTimeout(() => { controller.abort(); rejectBoundedDeadline?.(new MobileApiError("OUTCOME_UNKNOWN")); }, boundedTimeoutMs ?? this.options.timeoutMs ?? 15_000);
    const browserManagedCredentials = this.options.browserManagedCredentials === true;
    try {
      if (init.signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
      const callerAbort = init.signal ? new Promise<never>((_, reject) => {
        const signal = init.signal!;
        const abort = () => { controller.abort(); reject(new MobileApiError("OUTCOME_UNKNOWN")); };
        signal.addEventListener("abort", abort, { once: true });
        removeCallerAbort = () => signal.removeEventListener("abort", abort);
      }) : null;
      // Mark handled even when a synchronous cookie/transport failure wins first.
      void callerAbort?.catch(() => undefined);
      const cookie = browserManagedCredentials ? "" : this.options.getCookie();
      if (init.signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
      const readResponse = async () => {
      const response = await (this.options.fetchImpl ?? fetch)(
        `${this.options.baseUrl ?? mobileApiBaseUrl()}${path}`,
        {
          ...init,
          credentials: browserManagedCredentials ? "include" : "omit",
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
      };
      // A stalled native transport/body must not retain this source-upload UI forever.
      // The outcome stays unknown; abort is not evidence that server admission was undone.
      const pending = readResponse();
      const result = boundedDeadline || callerAbort
        ? await Promise.race([pending, ...(boundedDeadline ? [boundedDeadline] : []), ...(callerAbort ? [callerAbort] : [])])
        : await pending;
      if (init.signal?.aborted) throw new MobileApiError("OUTCOME_UNKNOWN");
      return result;
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError("OUTCOME_UNKNOWN");
    } finally {
      clearTimeout(timeout);
      removeCallerAbort?.();
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

  async projectProvenance(workspaceId: string, projectId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/provenance?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileProjectProvenance(value);
      if (result.workspaceId !== workspaceId || result.project.id !== projectId) {
        throw new Error("MOBILE_PROVENANCE_RESULT_MISMATCH");
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

  async secretaryBroadcastCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/secretary-broadcasts?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = mobileSecretaryBroadcastCockpitSchema.parse(value);
      if (result.workspaceId !== workspaceId) throw new Error("MOBILE_BROADCAST_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async approveSecretaryBroadcast(command: unknown) {
    const parsed = mobileApproveSecretaryBroadcastCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/secretary-broadcasts", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    try {
      const result = mobileSecretaryBroadcastApprovalResultSchema.parse(value);
      if (
        result.commandId !== parsed.commandId ||
        result.workspaceId !== parsed.workspaceId ||
        result.draftId !== parsed.draftId ||
        result.version !== parsed.expectedVersion ||
        result.payloadHash !== parsed.expectedPayloadHash
      ) throw new Error("MOBILE_BROADCAST_APPROVAL_MISMATCH");
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

  async accountingCockpit(workspaceId:string){const value=await this.request(`/api/endvera/v1/mobile/accounting?workspaceId=${encodeURIComponent(workspaceId)}`,{method:"GET"});try{const result=parseMobileAccountingCockpit(value);if(result.workspaceId!==workspaceId)throw new Error("MOBILE_ACCOUNTING_WORKSPACE_MISMATCH");return result;}catch{throw new MobileApiError("INVALID_RESPONSE");}}

  async accountingCommand(command:unknown){const account=mobileAccountingAccountCommandSchema.safeParse(command);const draft=mobileAccountingDraftCommandSchema.safeParse(command);const parsed=account.success?account.data:draft.success?draft.data:null;if(!parsed)throw new MobileApiError("REFUSED");return this.request("/api/endvera/v1/mobile/accounting",{method:"POST",body:JSON.stringify(parsed)});}

  async authorityCockpit(workspaceId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/authority-policies?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    );
    try {
      const result = parseMobileAuthorityCockpit(value);
      if (result.workspaceId !== workspaceId) throw new Error("MOBILE_AUTHORITY_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async authorityCommand(command: unknown) {
    const policy = mobileAuthorityPolicyCommandSchema.safeParse(command);
    const evaluation = mobileAuthorityEvaluateCommandSchema.safeParse(command);
    const decision = mobileAuthorityDecisionCommandSchema.safeParse(command);
    const parsed = policy.success ? policy.data : evaluation.success ? evaluation.data : decision.success ? decision.data : null;
    if (!parsed) throw new MobileApiError("REFUSED");
    const value = await this.request("/api/endvera/v1/mobile/authority-policies", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    try {
      const result = mobileAuthorityResultSchema.parse(value);
      if (result.commandId !== parsed.commandId || result.workspaceId !== parsed.workspaceId) {
        throw new Error("MOBILE_AUTHORITY_RESULT_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async privacyCockpit(workspaceId: string) {
    const value = await this.request(`/api/endvera/v1/mobile/privacy?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" });
    try {
      const result = parseMobilePrivacyCockpit(value);
      if (result.workspace.id !== workspaceId) throw new Error("MOBILE_PRIVACY_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async privacyCommand(command: unknown) {
    const parsed = mobilePrivacyCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/privacy", { method: "POST", body: JSON.stringify(parsed) });
    try {
      const result = mobilePrivacyResultSchema.parse(value);
      if (result.commandId !== parsed.commandId || result.workspaceId !== parsed.workspaceId) throw new Error("MOBILE_PRIVACY_RESULT_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async reliabilityCockpit(workspaceId: string) {
    const value = await this.request(`/api/endvera/v1/mobile/reliability?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" });
    try {
      const result = parseMobileReliabilityCockpit(value);
      if (result.workspace.id !== workspaceId) throw new Error("MOBILE_RELIABILITY_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async reliabilityCommand(command: unknown) {
    const parsed = mobileReliabilityCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/reliability", { method: "POST", body: JSON.stringify(parsed) });
    try {
      const result = mobileReliabilityResultSchema.parse(value);
      if (result.commandId !== parsed.commandId || result.workspaceId !== parsed.workspaceId) throw new Error("MOBILE_RELIABILITY_RESULT_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async onboardingCockpit(workspaceId?: string) {
    const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const value = await this.request(`/api/endvera/v1/mobile/onboarding${suffix}`, { method: "GET" });
    try {
      const result = parseMobileOnboardingCockpit(value);
      if (workspaceId && result.workspace?.id !== workspaceId) throw new Error("MOBILE_ONBOARDING_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async goldenWorkflow(workspaceId: string) {
    const value = await this.request(`/api/endvera/v1/mobile/golden-workflow?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "GET" });
    try {
      const result = parseMobileGoldenWorkflow(value);
      if (result.workspace.id !== workspaceId) throw new Error("MOBILE_GOLDEN_WORKFLOW_WORKSPACE_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async onboardingCommand(command: unknown) {
    const parsed = mobileOnboardingCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/onboarding", { method: "POST", body: JSON.stringify(parsed) });
    try {
      const result = mobileOnboardingResultSchema.parse(value);
      if (result.commandId !== parsed.commandId || ("workspaceId" in parsed && result.workspaceId !== parsed.workspaceId)) throw new Error("MOBILE_ONBOARDING_RESULT_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

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

  async projectBrainIntake(workspaceId: string, projectId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/project-brain-intake?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`,
      { method: "GET", cache: "no-store" },
    );
    try {
      const result = parseMobileProjectBrainIntake(value);
      if (result.intake && (result.intake.workspaceId !== workspaceId || result.intake.projectId !== projectId)) {
        throw new Error("MOBILE_PROJECT_BRAIN_PROJECTION_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async projectBrainCommand(command: unknown) {
    const parsed = mobileProjectBrainCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/project-brain-intake", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    try {
      const result = mobileProjectBrainCommandResultSchema.parse(value);
      if (
        result.commandId !== parsed.commandId ||
        result.workspaceId !== parsed.workspaceId ||
        result.projectId !== parsed.projectId ||
        result.action !== parsed.action
      ) throw new Error("MOBILE_PROJECT_BRAIN_COMMAND_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async projectBrainUnderstanding(workspaceId: string, projectId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/project-brain-understanding-review?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`,
      { method: "GET", cache: "no-store" },
    );
    try {
      const result = parseProjectBrainUnderstandingProjection(value);
      if (result.review && (result.review.workspaceId !== workspaceId || result.review.projectId !== projectId)) {
        throw new Error("MOBILE_PROJECT_BRAIN_UNDERSTANDING_MISMATCH");
      }
      return result;
    } catch { throw new MobileApiError("INVALID_RESPONSE"); }
  }

  async projectBrainUnderstandingCommand(command: unknown) {
    const parsed = mobileProjectBrainUnderstandingCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/project-brain-understanding-review", {
      method: "POST", body: JSON.stringify(parsed),
    });
    if (!value || typeof value !== "object") throw new MobileApiError("INVALID_RESPONSE");
    const result = value as { commandId?: string; workspaceId?: string; projectId?: string; action?: string };
    if (result.commandId !== parsed.commandId || result.workspaceId !== parsed.workspaceId || result.projectId !== parsed.projectId || result.action !== parsed.action) {
      throw new MobileApiError("INVALID_RESPONSE");
    }
    return value;
  }

  async projectBrainAssistantMemory(workspaceId: string, projectId: string) {
    const value = await this.request(
      `/api/endvera/v1/mobile/assistant/project-memory?workspaceId=${encodeURIComponent(workspaceId)}&projectId=${encodeURIComponent(projectId)}`,
      { method: "GET", cache: "no-store" },
    );
    try {
      const result = mobileProjectBrainAssistantMemoryProjectionSchema.parse(value);
      if (result.workspaceId !== workspaceId || result.projectId !== projectId) {
        throw new Error("MOBILE_PROJECT_BRAIN_ASSISTANT_MEMORY_MISMATCH");
      }
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async projectBrainAssistantMemoryCommand(command: unknown) {
    const parsed = mobileProjectBrainAssistantCommandSchema.parse(command);
    const value = await this.request("/api/endvera/v1/mobile/assistant", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    try {
      const result = mobileProjectBrainAssistantResultSchema.parse(value);
      if (
        result.commandId !== parsed.commandId ||
        result.workspaceId !== parsed.workspaceId ||
        result.projectId !== parsed.projectId ||
        result.action !== parsed.action
      ) throw new Error("MOBILE_PROJECT_BRAIN_ASSISTANT_RESULT_MISMATCH");
      return result;
    } catch {
      throw new MobileApiError("INVALID_RESPONSE");
    }
  }

  async uploadProjectBrainSource(command: unknown) {
    const parsed = mobileProjectBrainSourceCommandSchema.parse(command);
    const { uri, ...wireCommand } = parsed;
    const form = new FormData();
    form.append("command", JSON.stringify(wireCommand));
    form.append("file", {
      uri,
      name: parsed.fileName,
      type: parsed.mimeType,
    } as unknown as Blob);
    const value = await this.request("/api/endvera/v1/mobile/project-brain-intake/sources", {
      method: "POST",
      body: form,
    }, 120_000);
    try {
      const result = mobileProjectBrainCommandResultSchema.parse(value);
      if (
        result.commandId !== parsed.commandId ||
        result.workspaceId !== parsed.workspaceId ||
        result.projectId !== parsed.projectId ||
        result.action !== parsed.action
      ) throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_MISMATCH");
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

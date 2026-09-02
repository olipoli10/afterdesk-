import { describe, expect, it } from "vitest";
import { MobileApi } from "../src/lib/api";
import {
  beginVoiceNoteAttempt,
  createPrepareCallWorkCommand,
  createVoiceNoteAttempt,
  finishVoiceNoteAttempt,
  mobilePrepareCallWorkResultSchema,
  parseMobileVoiceCallsCockpit,
} from "../src/lib/voice-calls";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

const ownerWorkspace = {
  id: "workspace-1",
  name: "ENDVERA Construction",
  defaultTimezone: "America/Toronto",
  defaultLocale: "fr-CA",
  role: "OWNER" as const,
  permissions: {
    financialsVisible: true,
    canManageReceivables: true,
    canScheduleFollowUps: true,
    canApprovePreparedActions: true,
    canAddEvidence: true,
    externalTransportAuthorized: false as const,
  },
};

const commandId = "7cbfa360-f57e-40b6-b10e-6a4835a8427f";

function managerCockpit() {
  return {
    schemaVersion: 1,
    workspaceId: "workspace-1",
    role: "owner",
    sessions: [],
    voiceNotes: [],
    preparedWork: [{
      id: "work-1",
      projectId: "project-1",
      contactId: "contact-1",
      contactName: "Marc",
      recipientRef: `ref_${"a".repeat(64)}`,
      purpose: "service",
      objective: "Confirmer la livraison.",
      disclosureVersion: "r25-disclosure-v1",
      disclosureScript: "Bonjour, ici l’assistant ENDVERA.",
      resultSchema: ["CONTACT_REACHED", "RESULT_SUMMARY"],
      status: "PREPARED_UNSENT",
      createdAt: "2026-09-02T04:00:00.000Z",
    }],
    counts: { sessions: 0, voiceNotes: 0, preparedUnsent: 1 },
    rawPhoneVisible: false,
    providerRecordingUrlVisible: false,
    providerCallObserved: false,
    externalTransportEnabled: false,
  };
}

describe("native R25 voice calls and selected notes", () => {
  it("prepares one bounded service call and refuses field management", () => {
    const command = createPrepareCallWorkCommand({
      workspace: ownerWorkspace,
      commandId,
      projectId: "project-1",
      contactId: "contact-1",
      objective: "Confirmer la date de livraison des fenêtres.",
    });
    expect(command).toMatchObject({
      purpose: "service",
      expectedPolicyVersion: "r25-local-disabled-v1",
    });
    expect(() => createPrepareCallWorkCommand({
      workspace: { ...ownerWorkspace, role: "FIELD_WORKER" as const },
      commandId,
      projectId: "project-1",
      contactId: "contact-1",
      objective: "Appeler Marc.",
    })).toThrow("MOBILE_VOICE_MANAGEMENT_REFUSED");
  });

  it("parses manager detail and recursively refuses field-call leaks", () => {
    const manager = parseMobileVoiceCallsCockpit(managerCockpit());
    expect(manager.preparedWork[0]?.contactName).toBe("Marc");
    const field = parseMobileVoiceCallsCockpit({
      ...managerCockpit(),
      role: "field_worker",
      sessions: [],
      preparedWork: [],
      voiceNotes: [{
        id: "note-1",
        projectId: "project-1",
        durationMs: 12_000,
        sizeBytes: 5_000,
        transcriptionState: "TRANSCRIPTION_PREPARED",
        createdByCurrentUser: true,
        createdAt: "2026-09-02T04:00:00.000Z",
      }],
      counts: { sessions: 0, voiceNotes: 1, preparedUnsent: 0 },
    });
    expect(field.voiceNotes).toHaveLength(1);
    expect(() => parseMobileVoiceCallsCockpit({
      ...field,
      nested: { transcript: "secret" },
    })).toThrow("MOBILE_VOICE_FIELD_LEAK_REFUSED");
  });

  it("keeps voice-note recording selected, bounded and explicitly retriable", () => {
    const attempt = createVoiceNoteAttempt({
      workspace: ownerWorkspace,
      projectId: "project-1",
      commandId,
      uri: "file:///selected-note.m4a",
      fileName: "selected-note.m4a",
      durationMs: 119_000,
      sizeBytes: 8_000,
    });
    const sending = beginVoiceNoteAttempt(attempt);
    const unknown = finishVoiceNoteAttempt(sending, {
      state: "OUTCOME_UNKNOWN",
      publicError: "Réessaie exactement la même note.",
    });
    expect(beginVoiceNoteAttempt(unknown).command).toEqual(attempt.command);
    expect(() => createVoiceNoteAttempt({
      workspace: ownerWorkspace,
      projectId: "project-1",
      commandId,
      uri: "file:///too-long.m4a",
      fileName: "too-long.m4a",
      durationMs: 120_001,
      sizeBytes: 8_000,
    })).toThrow();
  });

  it("restores an interrupted call preparation without automatic dispatch", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const command = createPrepareCallWorkCommand({
      workspace: ownerWorkspace,
      commandId,
      projectId: "project-1",
      contactId: "contact-1",
      objective: "Confirmer la livraison.",
    });
    const entry = await enqueueMobileOutbox({ kind: "VOICE_CALL_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: "workspace-1", store });
    expect(restored[0]).toMatchObject({
      kind: "VOICE_CALL_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });

  it("validates API identity and zero transport", async () => {
    const command = createPrepareCallWorkCommand({
      workspace: ownerWorkspace,
      commandId,
      projectId: "project-1",
      contactId: "contact-1",
      objective: "Confirmer la livraison.",
    });
    const result = mobilePrepareCallWorkResultSchema.parse({
      schemaVersion: 1,
      commandId,
      workspaceId: "workspace-1",
      projectId: "project-1",
      contactId: "contact-1",
      workId: "work-1",
      recipientRef: `ref_${"a".repeat(64)}`,
      purpose: "service",
      objective: command.objective,
      disclosureVersion: command.disclosureVersion,
      disclosureScript: command.disclosureScript,
      resultSchema: command.resultSchema,
      policyVersion: "r25-local-disabled-v1",
      status: "PREPARED_UNSENT",
      nextOwnerRole: "HUMAN_CALLER",
      replayed: false,
      externalTransportPerformed: false,
    });
    const api = new MobileApi({
      baseUrl: "https://local.invalid",
      getCookie: () => "session=synthetic",
      fetchImpl: async () => new Response(JSON.stringify(result), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    });
    await expect(api.prepareCallWork(command)).resolves.toEqual(result);
  });
});

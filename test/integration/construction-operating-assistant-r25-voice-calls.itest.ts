import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { opaqueVoiceContactRef } from "@/lib/construction-operating-assistant-r25/policy";
import {
  admitSelectedVoiceNoteR25,
  prepareOutboundCallWorkR25,
  processCallTranscriptR25,
  voiceCallsCockpitForUserR25,
} from "@/server/construction-operating-assistant-r25/voice-calls";
import { prepareCommunicationChannel } from "@/server/construction-operating-assistant-r4/connectors";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const assertion = {
  adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4" as const,
  authenticityVerified: true,
  externalTransportPerformed: false as const,
};

function minimalM4a() {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftyp", "ascii"),
    Buffer.from("M4A ", "ascii"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("M4A isom", "ascii"),
  ]);
}

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R25 owner ${label}`,
      email: `r25-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const office = await prisma.user.create({
    data: {
      name: `R25 office ${label}`,
      email: `r25-office-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R25 field ${label}`,
      email: `r25-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R25 ${label}`,
  });
  await prisma.constructionWorkspaceMember.createMany({
    data: [
      { workspaceId: workspace.workspaceId, userId: office.id, role: "admin", status: "active" },
      { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
    ],
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `LAVAL-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Fournisseur synthétique",
    normalizedPhone: "+15555550184",
  });
  const prepared = await prepareCommunicationChannel({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "PREPARE_CHANNEL",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      channel: "VOICE",
    },
  });
  const contactRef = opaqueVoiceContactRef({ workspaceId: workspace.workspaceId, contactId: contact.id });
  await prisma.constructionCommunicationIdentity.create({
    data: {
      workspaceId: workspace.workspaceId,
      contactId: contact.id,
      channel: "voice",
      normalizedAddress: contactRef,
      verified: true,
      permissions: ["CALL"],
      status: "active",
    },
  });
  return {
    ownerId: owner.id,
    officeId: office.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    contactId: contact.id,
    ownerVoiceRef: prepared.senderIdentityRef,
    contactRef,
    projectName: `Rénovation Laval ${label}`,
  };
}

function inbound(
  f: Awaited<ReturnType<typeof fixture>>,
  transcript: string,
  overrides: Partial<{
    eventId: string;
    callId: string;
    proof: "HUMAN_TRANSCRIBED" | "SYNTHETIC_LOCAL";
  }> = {},
) {
  return {
    schemaVersion: 1 as const,
    eventId: overrides.eventId ?? crypto.randomUUID(),
    callId: overrides.callId ?? crypto.randomUUID(),
    workspaceId: f.workspaceId,
    projectId: f.projectId,
    callerIdentityRef: f.ownerVoiceRef,
    occurredAt: "2026-08-31T13:00:00.000Z",
    direction: "INBOUND" as const,
    purpose: "internal" as const,
    disclosure: {
      version: "r25-disclosure-v1",
      presented: true,
      acknowledged: true,
    },
    recordingConsent: "NOT_RECORDED" as const,
    transcriptionConsent: "GRANTED" as const,
    normalizedTranscript: transcript,
    transcriptProofLevel: overrides.proof ?? "HUMAN_TRANSCRIBED" as const,
    sourceAudioPersisted: false as const,
    externalTransportPerformed: false as const,
  };
}

describe("Construction Operating Assistant R25 voice calls on PostgreSQL", () => {
  it("serializes one trusted transcript, reconstructs restart state and refuses drift", async () => {
    const f = await fixture("TRUSTED");
    const event = inbound(
      f,
      `Rendez-vous avec Marc mardi à 14 h pour ${f.projectName}.`,
    );
    const results = await Promise.all([
      processCallTranscriptR25({ event, assertion }),
      processCallTranscriptR25({ event, assertion }),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => result.sessionId)).size).toBe(1);
    expect(results[0]).toMatchObject({
      status: "APPLIED",
      projectId: f.projectId,
      sourceAudioPersisted: false,
      externalTransportPerformed: false,
    });
    expect(await prisma.constructionCallSession.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionCallTransition.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionCalendarItem.count({
      where: { workspaceId: f.workspaceId, projectId: f.projectId, status: "scheduled" },
    })).toBe(1);
    const transition = await prisma.constructionCallTransition.findFirstOrThrow({
      where: { workspaceId: f.workspaceId },
    });
    await expect(prisma.constructionCallTransition.update({
      where: { id: transition.id },
      data: { stateAfter: "REFUSED" },
    })).rejects.toThrow("ConstructionCallTransition is immutable");

    const afterRestart = await voiceCallsCockpitForUserR25({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    expect(afterRestart.sessions).toHaveLength(1);
    expect(afterRestart.sessions[0]).toMatchObject({
      lifecycleState: "COMPLETED",
      transcript: event.normalizedTranscript,
    });
    expect(afterRestart).toMatchObject({
      rawPhoneVisible: false,
      providerRecordingUrlVisible: false,
      providerCallObserved: false,
      externalTransportEnabled: false,
    });

    await expect(processCallTranscriptR25({
      event: { ...event, normalizedTranscript: `Rendez-vous avec Marc mardi à 16 h pour ${f.projectName}.` },
      assertion,
    })).rejects.toThrow("VOICE_CALL_IDEMPOTENCY_CONFLICT");
  });

  it("keeps ambiguous and synthetic transcripts out of consequential state", async () => {
    const f = await fixture("GUARDS");
    const ambiguous = await processCallTranscriptR25({
      event: inbound(f, `Rendez-vous avec Marc mardi à 2 pour ${f.projectName}.`),
      assertion,
    });
    expect(ambiguous).toMatchObject({ status: "CLARIFICATION_REQUIRED", canonicalEffectId: null });

    const synthetic = await processCallTranscriptR25({
      event: inbound(
        f,
        `Rendez-vous avec Marc mardi à 14 h pour ${f.projectName}.`,
        { proof: "SYNTHETIC_LOCAL" },
      ),
      assertion,
    });
    expect(synthetic).toMatchObject({ status: "REFUSED", canonicalEffectId: null });
    expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    expect(await prisma.constructionAction.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
  });

  it("admits one selected foreground M4A without inventing a transcript", async () => {
    const f = await fixture("NOTE");
    const bytes = minimalM4a();
    const command = {
      schemaVersion: 1 as const,
      action: "ADMIT_SELECTED_VOICE_NOTE" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      fileName: "note-chantier.m4a",
      mimeType: "audio/mp4" as const,
      durationMs: 12_000,
      sizeBytes: bytes.length,
      foregroundRecorded: true as const,
      transcriptionRequested: false as const,
    };
    const first = await admitSelectedVoiceNoteR25({ userId: f.fieldId, command, bytes });
    const replay = await admitSelectedVoiceNoteR25({ userId: f.fieldId, command, bytes });
    expect(first).toMatchObject({
      projectId: f.projectId,
      transcriptCreated: false,
      transcriptionState: "TRANSCRIPTION_PREPARED",
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(replay).toMatchObject({ voiceNoteId: first.voiceNoteId, evidenceId: first.evidenceId, replayed: true });
    expect(await prisma.constructionVoiceNoteReference.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    const file = await prisma.file.findUniqueOrThrow({ where: { id: first.evidenceId } });
    expect(file).toMatchObject({ mime: "audio/mp4", scanStatus: "clean", sizeBytes: bytes.length });
    expect(JSON.stringify(first)).not.toMatch(/transcript\s*:/u);

    const other = await fixture("NOTE-OTHER");
    await expect(admitSelectedVoiceNoteR25({
      userId: other.ownerId,
      command: { ...command, commandId: crypto.randomUUID() },
      bytes,
    })).rejects.toThrow();

    const field = await voiceCallsCockpitForUserR25({ userId: f.fieldId, workspaceId: f.workspaceId });
    expect(field).toMatchObject({ role: "field_worker", sessions: [], preparedWork: [] });
    expect(field.voiceNotes).toHaveLength(1);
  });

  it("prepares exact service-call work without dialing and hides it from field workers", async () => {
    const f = await fixture("OUTBOUND");
    const command = {
      schemaVersion: 1 as const,
      action: "PREPARE_OUTBOUND_CALL_WORK" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      contactId: f.contactId,
      purpose: "service" as const,
      objective: "Confirmer la date de livraison des fenêtres.",
      disclosureVersion: "r25-disclosure-v1",
      disclosureScript: "Bonjour, ici l’assistant ENDVERA de Construction ABC.",
      resultSchema: ["CONTACT_REACHED", "RESULT_SUMMARY", "FOLLOW_UP_DATE"] as const,
      expectedPolicyVersion: "r25-local-disabled-v1" as const,
    };
    const prepared = await prepareOutboundCallWorkR25({ userId: f.officeId, command });
    const replay = await prepareOutboundCallWorkR25({ userId: f.officeId, command });
    expect(prepared).toMatchObject({
      recipientRef: f.contactRef,
      status: "PREPARED_UNSENT",
      nextOwnerRole: "HUMAN_CALLER",
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(replay).toMatchObject({ workId: prepared.workId, replayed: true });
    expect(JSON.stringify(prepared)).not.toContain("+15555550184");

    await expect(prepareOutboundCallWorkR25({
      userId: f.ownerId,
      command: { ...command, commandId: crypto.randomUUID(), purpose: "commercial" as const },
    })).rejects.toThrow("COMMERCIAL_AUTOMATED_CALL_PROHIBITED");

    const field = await voiceCallsCockpitForUserR25({ userId: f.fieldId, workspaceId: f.workspaceId });
    expect(field).toMatchObject({ role: "field_worker", sessions: [], preparedWork: [] });
    expect(JSON.stringify(field)).not.toMatch(/Marc|livraison|disclosure|155555/u);
    const owner = await voiceCallsCockpitForUserR25({ userId: f.ownerId, workspaceId: f.workspaceId });
    expect(owner.preparedWork[0]).toMatchObject({
      contactName: "Marc",
      objective: command.objective,
      status: "PREPARED_UNSENT",
    });
    expect(await prisma.constructionCallWork.count({
      where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
  });
});

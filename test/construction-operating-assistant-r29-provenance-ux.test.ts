import { describe, expect, it } from "vitest";
import {
  fieldProjectProvenanceSchema,
  orderProvenanceEntries,
  ownerProjectProvenanceSchema,
  rejectFieldProvenanceLeaks,
} from "@/lib/construction-operating-assistant-r29/provenance";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-02T06:00:00.000Z",
  workspaceId: "workspace-1",
  project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
  summary: { total: 0, verified: 0, proposed: 0, contradicted: 0, humanAssisted: 0 },
  externalEffectCount: 0 as const,
};

const ref = { entityType: "ConstructionOpenLoopFact" as const, entityId: "fact-1" };
const source = { kind: "MESSAGE" as const, label: "Message reçu", sourceEntityId: "message-1" };

describe("R29 plain-language provenance contracts", () => {
  it("keeps fact, inference and verified state as distinct closed kinds", () => {
    const entries = [
      {
        id: "FACT:fact-1", kind: "FACT" as const, recordedAt: "2026-09-02T05:00:00.000Z",
        statement: "Description du travail: Dosseret.", stateLabel: "PROPOSED", canonicalRef: ref,
        source, causalParent: null,
        details: { field: "WORK_DESCRIPTION" as const, valueLabel: "Dosseret", truthState: "PROPOSED" as const, sourceType: "message_claim", observedAt: null },
      },
      {
        id: "INFERENCE:i1", kind: "INFERENCE" as const, recordedAt: "2026-09-02T05:00:01.000Z",
        statement: "ENDVERA a interprété le message sans le vérifier.", stateLabel: "INFERENCE_ONLY",
        canonicalRef: { entityType: "ConstructionInterpretation" as const, entityId: "i1" }, source,
        causalParent: null, details: { intent: "REPORT_WORK_FINISHED", confidenceBand: "HIGH" as const, interpreterVersion: "r29-test" },
      },
      {
        id: "VERIFIED_STATE:loop-1:1", kind: "VERIFIED_STATE" as const, recordedAt: "2026-09-02T05:00:02.000Z",
        statement: "État actuel du dossier enregistré.", stateLabel: "WAITING_FOR_EVIDENCE",
        canonicalRef: { entityType: "ConstructionOpenLoopSnapshot" as const, entityId: "snapshot-1" },
        source: { kind: "CANONICAL_STATE" as const, label: "Snapshot PostgreSQL", sourceEntityId: "loop-1" }, causalParent: null,
        details: { stateVersion: 1, snapshotFingerprint: "a".repeat(64), current: true, nextResponsibleRole: "OFFICE_MANAGER", nextAction: "OBTAIN_WRITTEN_APPROVAL" },
      },
    ];
    const result = ownerProjectProvenanceSchema.parse({ ...base, role: "OWNER", summary: { ...base.summary, total: 3, verified: 1, proposed: 2 }, entries });
    expect(result.entries.map((entry) => entry.kind)).toEqual(["FACT", "INFERENCE", "VERIFIED_STATE"]);
    expect(() => ownerProjectProvenanceSchema.parse({ ...result, entries: [{ ...entries[0], kind: "VERIFIED_STATE" }] })).toThrow();
  });

  it("orders deterministically and does not mutate the input", () => {
    const input = [
      { id: "z", kind: "ACTION" as const, recordedAt: "2026-09-02T05:00:00.000Z" },
      { id: "a", kind: "FACT" as const, recordedAt: "2026-09-02T05:00:00.000Z" },
      { id: "b", kind: "DECISION" as const, recordedAt: "2026-09-02T04:00:00.000Z" },
    ];
    expect(orderProvenanceEntries(input).map((entry) => entry.id)).toEqual(["b", "a", "z"]);
    expect(input.map((entry) => entry.id)).toEqual(["z", "a", "b"]);
  });

  it("refuses unknown fields, invalid state labels and missing causal parents", () => {
    const fact = {
      id: "FACT:fact-1", kind: "FACT" as const, recordedAt: "2026-09-02T05:00:00.000Z",
      statement: "Description du travail: Dosseret.", stateLabel: "PROPOSED", canonicalRef: ref,
      source, causalParent: null,
      details: { field: "WORK_DESCRIPTION" as const, valueLabel: "Dosseret", truthState: "PROPOSED" as const, sourceType: "message_claim", observedAt: null },
    };
    expect(() => ownerProjectProvenanceSchema.parse({
      ...base, role: "OWNER", summary: { ...base.summary, total: 1, proposed: 1 },
      entries: [{ ...fact, details: { ...fact.details, field: "UNKNOWN_FIELD" } }],
    })).toThrow();
    expect(() => ownerProjectProvenanceSchema.parse({
      ...base, role: "OWNER", summary: { ...base.summary, total: 1, proposed: 1 },
      entries: [{ ...fact, stateLabel: "proposed" }],
    })).toThrow();
    expect(() => ownerProjectProvenanceSchema.parse({
      ...base, role: "OWNER", summary: { ...base.summary, total: 1, proposed: 1 },
      entries: [{ ...fact, causalParent: { entryId: "FACT:missing", relation: "DERIVED_FROM" } }],
    })).toThrow("PROVENANCE_CAUSAL_PARENT_NOT_FOUND");
  });

  it("accepts a minimized field projection and recursively refuses protected keys", () => {
    const field = {
      ...base,
      role: "FIELD_WORKER" as const,
      summary: { ...base.summary, total: 1 },
      entries: [{
        id: "FACT:fact-1", kind: "FACT" as const, recordedAt: "2026-09-02T05:00:00.000Z",
        statement: "Information de chantier: Description du travail.", stateLabel: "PROPOSED",
        canonicalRef: ref, source: { kind: "MESSAGE" as const, label: "Information déclarée" }, causalParent: null,
        details: { workLabel: "Description du travail", responsibleRole: null },
      }],
    };
    expect(fieldProjectProvenanceSchema.parse(field)).toEqual(field);
    expect(() => rejectFieldProvenanceLeaks({ nested: { amountMinor: 120_000 } })).toThrow("FIELD_PROVENANCE_LEAK_REFUSED");
    expect(() => fieldProjectProvenanceSchema.parse({ ...field, unexpected: true })).toThrow();
  });
});

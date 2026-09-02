import { describe, expect, it } from "vitest";
import { parseMobileProjectProvenance } from "@/lib/provenance";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-02T06:00:00.000Z",
  workspaceId: "workspace-1",
  project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
  summary: { total: 1, verified: 0, proposed: 1, contradicted: 0, humanAssisted: 0 },
  externalEffectCount: 0 as const,
};

describe("mobile R29 provenance contract", () => {
  it("parses one exact owner fact and refuses unknown fields", () => {
    const value = { ...base, role: "OWNER" as const, entries: [{
      id: "FACT:f1", kind: "FACT" as const, recordedAt: "2026-09-02T05:00:00.000Z", statement: "Travail déclaré.", stateLabel: "PROPOSED",
      canonicalRef: { entityType: "ConstructionOpenLoopFact" as const, entityId: "f1" },
      source: { kind: "MESSAGE" as const, label: "Message reçu", sourceEntityId: "m1" }, causalParent: null,
      details: { field: "WORK_DESCRIPTION" as const, valueLabel: "Dosseret", truthState: "PROPOSED" as const, sourceType: "message_claim", observedAt: null },
    }] };
    expect(parseMobileProjectProvenance(value)).toEqual(value);
    expect(() => parseMobileProjectProvenance({ ...value, extra: true })).toThrow();
  });

  it("recursively refuses financial and internal provenance fields in field views", () => {
    const field = { ...base, role: "FIELD_WORKER" as const, entries: [{
      id: "FACT:f1", kind: "FACT" as const, recordedAt: "2026-09-02T05:00:00.000Z", statement: "Information de chantier.", stateLabel: "PROPOSED",
      canonicalRef: { entityType: "ConstructionOpenLoopFact" as const, entityId: "f1" },
      source: { kind: "MESSAGE" as const, label: "Information déclarée" }, causalParent: null,
      details: { workLabel: "Description du travail", responsibleRole: null },
    }] };
    expect(parseMobileProjectProvenance(field)).toEqual(field);
    expect(() => parseMobileProjectProvenance({ ...field, entries: [{ ...field.entries[0], nested: { amountMinor: 120_000 } }] })).toThrow();
  });

  it("accepts a historical immutable snapshot without inventing a current next step", () => {
    const historical = { ...base, role: "OWNER" as const, summary: { ...base.summary, verified: 1, proposed: 0 }, entries: [{
      id: "VERIFIED_STATE:loop-1:1", kind: "VERIFIED_STATE" as const, recordedAt: "2026-09-02T05:00:00.000Z",
      statement: "Snapshot historique immuable du dossier, version 1.", stateLabel: "HISTORICAL_STATE",
      canonicalRef: { entityType: "ConstructionOpenLoopSnapshot" as const, entityId: "snapshot-1" },
      source: { kind: "CANONICAL_STATE" as const, label: "Snapshot PostgreSQL immuable", sourceEntityId: "loop-1" }, causalParent: null,
      details: { stateVersion: 1, snapshotFingerprint: "a".repeat(64), current: false, nextResponsibleRole: null, nextAction: null },
    }] };
    expect(parseMobileProjectProvenance(historical)).toEqual(historical);
  });
});

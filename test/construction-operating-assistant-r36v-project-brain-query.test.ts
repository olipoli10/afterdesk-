import { describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { canonicalProjectBrainSnapshotSchema } from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import {
  answerProjectBrainQueryFromSnapshots,
  classifyProjectBrainQuery,
  projectBrainQueryAuditAction,
  projectBrainRoutingProjection,
  resolveProjectFromMessage,
  selectLatestConfirmedProjectBrainSnapshot,
  type ProjectBrainSnapshotCandidate,
} from "@/server/construction-operating-assistant-r36v/project-brain-query";

const workspaceId = "workspace-r36v";
const projectId = "project-laval";

function candidate(input: {
  id: string;
  status: "PROPOSED" | "CONFIRMED";
  createdAt: string;
  summary: string;
  blockers: string;
  nextDecision: string;
  candidateWorkspaceId?: string;
  candidateProjectId?: string;
  intakeSequence?: number;
  stateVersion?: number;
  sourceDisplayName?: string;
}): ProjectBrainSnapshotCandidate {
  const snapshot = {
    schemaVersion: 1 as const,
    project: { id: input.candidateProjectId ?? projectId, code: "LAVAL-001", name: "Rénovation Laval" },
    ownerBrief: {
      provenance: "OWNER_CONFIRMED" as const,
      summary: input.summary,
      scope: "Dosseret de cuisine",
      importantPeople: "Marc, fournisseur",
      importantDates: "Mardi",
      blockers: input.blockers,
      nextDecision: input.nextDecision,
    },
    sources: [
      {
        sourceId: `${input.id}-pdf`,
        kind: "DOCUMENT" as const,
        displayName: input.sourceDisplayName ?? "devis-synthetique.pdf",
        contentHash: "a".repeat(64),
        transcriptionState: "NOT_REQUESTED_LOCAL_ONLY" as const,
        documentUnderstandingState: "NOT_REQUESTED_LOCAL_ONLY" as const,
      },
      {
        sourceId: `${input.id}-voice`,
        kind: "VOICE_NOTE" as const,
        displayName: "note-locale.m4a",
        contentHash: "b".repeat(64),
        transcriptionState: "NOT_REQUESTED_LOCAL_ONLY" as const,
        documentUnderstandingState: "NOT_REQUESTED_LOCAL_ONLY" as const,
      },
    ],
    limitations: ["VOICE_NOT_TRANSCRIBED", "DOCUMENT_CONTENT_NOT_INTERPRETED"] as const,
  };
  return {
    id: input.id,
    workspaceId: input.candidateWorkspaceId ?? workspaceId,
    projectId: input.candidateProjectId ?? projectId,
    intakeSequence: input.intakeSequence ?? 1,
    stateVersion: input.stateVersion ?? 1,
    status: input.status,
    canonicalHash: sha256Canonical(snapshot),
    snapshot,
    createdAt: input.createdAt,
  };
}

const olderConfirmed = candidate({
  id: "confirmed-older",
  status: "CONFIRMED",
  createdAt: "2026-09-03T10:00:00.000Z",
  summary: "Ancien résumé confirmé.",
  blockers: "Ancien blocage confirmé.",
  nextDecision: "Ancienne décision confirmée.",
});

const latestConfirmed = candidate({
  id: "confirmed-latest",
  status: "CONFIRMED",
  createdAt: "2026-09-03T11:00:00.000Z",
  summary: "Résumé exact confirmé par Olivier.",
  blockers: "Attendre la livraison du coulis.",
  nextDecision: "Confirmer la date de pose avec Marc.",
  stateVersion: 2,
});

const newerProposed = candidate({
  id: "proposed-newer",
  status: "PROPOSED",
  createdAt: "2026-09-03T12:00:00.000Z",
  summary: "DRAFT_POISON_SUMMARY",
  blockers: "DRAFT_POISON_BLOCKER",
  nextDecision: "DRAFT_POISON_DECISION",
});

describe("R36V confirmed-only project brain queries", () => {
  it("resolves the exact longest project reference and refuses two separately named projects", () => {
    const projects = [
      { id: "project-main", code: "LAVAL-001", name: "Rénovation Laval" },
      { id: "project-other", code: "LAVAL-001-OTHER", name: "Rénovation Laval annexe" },
    ];
    expect(resolveProjectFromMessage("Blocages de LAVAL-001-OTHER?", projects)?.id)
      .toBe("project-other");
    expect(resolveProjectFromMessage("Compare LAVAL-001 et LAVAL-001-OTHER.", projects))
      .toBeNull();
    expect(resolveProjectFromMessage("Blocages de LAVAL-001 pour Rénovation Laval annexe?", projects))
      .toBeNull();
  });

  it("does not resolve a project code or name embedded inside a longer word", () => {
    const projects = [
      { id: "project-main", code: "ABC", name: "Laval" },
    ];
    expect(resolveProjectFromMessage("État de FABRICATION?", projects)).toBeNull();
    expect(resolveProjectFromMessage("État de LAVAL-0012?", [
      { id: "project-main", code: "LAVAL-001", name: "Rénovation Laval" },
    ])).toBeNull();
    expect(resolveProjectFromMessage("État du projet ABC.", projects)?.id).toBe("project-main");
  });

  it.each([
    ["Quel est le résumé du chantier LAVAL-001?", "SUMMARY"],
    ["Quels sont les blocages pour Rénovation Laval?", "BLOCKERS"],
    ["Quelle est la prochaine décision pour LAVAL-001?", "NEXT_DECISION"],
    ["Montre l’inventaire des sources de Rénovation Laval.", "SOURCE_INVENTORY"],
    ["Transcris la note vocale du chantier LAVAL-001.", "BINARY_INTERPRETATION"],
    ["Fais l’OCR du PDF pour Rénovation Laval.", "BINARY_INTERPRETATION"],
    ["Quel est le montant du devis PDF pour LAVAL-001?", "BINARY_INTERPRETATION"],
    ["Montant devis pour LAVAL-001?", "BINARY_INTERPRETATION"],
    ["Quelle date est écrite sur le plan de Rénovation Laval?", "BINARY_INTERPRETATION"],
    ["Combien selon la soumission PDF de LAVAL-001?", "BINARY_INTERPRETATION"],
    ["What is the amount on the invoice PDF for LAVAL-001?", "BINARY_INTERPRETATION"],
    ["What amount does the invoice show for LAVAL-001?", "BINARY_INTERPRETATION"],
    ["How much is listed on the quote for Rénovation Laval?", "BINARY_INTERPRETATION"],
    ["Read the attachment for project LAVAL-001.", "BINARY_INTERPRETATION"],
  ] as const)("classifies only the narrow project-memory surface: %s", (message, expected) => {
    expect(classifyProjectBrainQuery(message)).toBe(expected);
  });

  it.each([
    ["Quel est le résumé du projet PDF Laval?", "SUMMARY"],
    ["Quels sont les blocages du projet Plan B?", "BLOCKERS"],
    ["Quelle est la prochaine décision du chantier Devis Montréal?", "NEXT_DECISION"],
  ] as const)("does not let an artifact-like project name poison routing: %s", (message, expected) => {
    expect(classifyProjectBrainQuery(message)).toBe(expected);
  });

  it.each([
    "Rendez-vous avec Marc mardi à 14 h pour Laval.",
    "Texte Marc que je serai 30 minutes en retard.",
    "Recherche la réputation publique du fournisseur ABC avec des sources.",
    "Qu’est-ce que j’ai demain?",
    "Bloque le rendez-vous de Laval demain.",
    "Ajoute ce blocage au chantier Laval.",
    "Block the Laval appointment tomorrow.",
    "Texte Marc que l’état du projet Laval est à jour.",
    "Envoie à Marc le sommaire du chantier Laval.",
    "Ajoute l’état du projet Laval au suivi de demain.",
    "Peux-tu envoyer à Marc le sommaire du chantier Laval?",
    "Est-ce que tu peux texter Marc avec le résumé du projet Laval?",
    "Quels sont les blocages du chantier Laval et texte Marc avec le résumé.",
    "Donne-moi le sommaire du projet Laval puis envoie-le à Marc.",
    "What is the project Laval summary and send it to Marc?",
  ])("does not capture an existing non-project-brain intent: %s", (message) => {
    expect(classifyProjectBrainQuery(message)).toBeNull();
  });

  it("selects the newest CONFIRMED snapshot and ignores a newer PROPOSED snapshot", () => {
    const selected = selectLatestConfirmedProjectBrainSnapshot({
      workspaceId,
      projectId,
      candidates: [newerProposed, olderConfirmed, latestConfirmed],
    });
    expect(selected?.id).toBe("confirmed-latest");
  });

  it("orders confirmed snapshots by canonical intake sequence and state version, never random ids", () => {
    const newerIntakeWithLexicallyOlderId = candidate({
      id: "aaa-random-id",
      status: "CONFIRMED",
      createdAt: "2026-09-03T09:00:00.000Z",
      summary: "Latest canonical intake.",
      blockers: "",
      nextDecision: "",
      intakeSequence: 3,
      stateVersion: 1,
    });
    const olderIntakeWithLexicallyNewerId = candidate({
      id: "zzz-random-id",
      status: "CONFIRMED",
      createdAt: "2026-09-03T13:00:00.000Z",
      summary: "Older canonical intake.",
      blockers: "",
      nextDecision: "",
      intakeSequence: 2,
      stateVersion: 99,
    });
    expect(selectLatestConfirmedProjectBrainSnapshot({
      workspaceId,
      projectId,
      candidates: [olderIntakeWithLexicallyNewerId, newerIntakeWithLexicallyOlderId],
    })?.id).toBe("aaa-random-id");

    const newestVersion = candidate({
      id: "000-random-id",
      status: "CONFIRMED",
      createdAt: "2026-09-03T08:00:00.000Z",
      summary: "Latest canonical state.",
      blockers: "",
      nextDecision: "",
      intakeSequence: 3,
      stateVersion: 2,
    });
    expect(selectLatestConfirmedProjectBrainSnapshot({
      workspaceId,
      projectId,
      candidates: [newerIntakeWithLexicallyOlderId, newestVersion],
    })?.id).toBe("000-random-id");
  });

  it.each([
    ["SUMMARY", "Résumé exact confirmé par Olivier."],
    ["BLOCKERS", "Attendre la livraison du coulis."],
    ["NEXT_DECISION", "Confirmer la date de pose avec Marc."],
  ] as const)("answers %s only from the latest owner-confirmed text", (queryKind, expected) => {
    const answer = answerProjectBrainQueryFromSnapshots({
      queryKind,
      workspaceId,
      projectId,
      candidates: [newerProposed, olderConfirmed, latestConfirmed],
    });
    expect(answer).toMatchObject({
      queryKind,
      status: "ANSWERED",
      snapshotId: "confirmed-latest",
      provenance: "OWNER_CONFIRMED",
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
    expect(answer.reply).toContain(expected);
    expect(answer.reply).toContain("confirmée par le propriétaire");
    expect(answer.reply).not.toMatch(/DRAFT_POISON/u);
  });

  it("returns only the admitted source inventory with every local-only limitation", () => {
    const latestSnapshot = canonicalProjectBrainSnapshotSchema.parse(latestConfirmed.snapshot);
    const identicalSelection = {
      ...latestConfirmed,
      id: "confirmed-identical-selection",
      snapshot: {
        ...latestSnapshot,
        sources: [
          ...latestSnapshot.sources,
          {
            ...latestSnapshot.sources[0],
            sourceId: "confirmed-latest-pdf-second-selection",
            displayName: "devis-renomme.pdf",
          },
        ],
      },
    };
    identicalSelection.canonicalHash = sha256Canonical(identicalSelection.snapshot);
    const answer = answerProjectBrainQueryFromSnapshots({
      queryKind: "SOURCE_INVENTORY",
      workspaceId,
      projectId,
      candidates: [identicalSelection],
    });
    expect(answer.status).toBe("ANSWERED");
    expect(answer.reply).toContain("devis-synthetique.pdf");
    expect(answer.reply).toContain("note-locale.m4a");
    expect(answer.reply).toContain("non interprété");
    expect(answer.reply).toContain("non transcrite");
    expect(answer.reply).toContain("mêmes octets que la source 1; aucune preuve distincte");
  });

  it("refuses transcription, OCR and binary interpretation without inventing source contents", () => {
    const fetchSentinel = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const answer = answerProjectBrainQueryFromSnapshots({
      queryKind: "BINARY_INTERPRETATION",
      workspaceId,
      projectId,
      candidates: [latestConfirmed],
    });
    expect(answer).toMatchObject({
      status: "REFUSED",
      snapshotId: "confirmed-latest",
      provenance: "OWNER_CONFIRMED",
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
    expect(answer.reply).toContain("n’a pas été analysé");
    expect(answer.reply).toContain("n’a pas été transcrit");
    expect(answer.reply).not.toMatch(/coulis|Marc|mardi|DRAFT_POISON/u);
    expect(fetchSentinel).not.toHaveBeenCalled();
    fetchSentinel.mockRestore();
  });

  it("does not echo poison from filenames, metadata, proposed memory or another workspace in a binary refusal", () => {
    const confirmedWithPoisonName = {
      ...candidate({
        id: "confirmed-poison-name",
        status: "CONFIRMED",
        createdAt: "2026-09-03T14:00:00.000Z",
        summary: "Owner-confirmed text that must not answer a binary question.",
        blockers: "CONFIRMED_TEXT_POISON",
        nextDecision: "",
        intakeSequence: 4,
        sourceDisplayName: "FILENAME_POISON_SECRET.pdf",
      }),
      metadata: { extractedAmount: "METADATA_POISON_999999" },
    } as ProjectBrainSnapshotCandidate & { metadata: { extractedAmount: string } };
    const foreignWorkspace = candidate({
      id: "foreign-binary-poison",
      status: "CONFIRMED",
      createdAt: "2026-09-03T15:00:00.000Z",
      summary: "FOREIGN_WORKSPACE_POISON",
      blockers: "",
      nextDecision: "",
      candidateWorkspaceId: "workspace-foreign",
      intakeSequence: 99,
    });
    const answer = answerProjectBrainQueryFromSnapshots({
      queryKind: "BINARY_INTERPRETATION",
      workspaceId,
      projectId,
      candidates: [newerProposed, foreignWorkspace, confirmedWithPoisonName],
    });
    expect(answer.status).toBe("REFUSED");
    expect(answer.snapshotId).toBe("confirmed-poison-name");
    expect(answer.reply).not.toMatch(
      /FILENAME_POISON|METADATA_POISON|DRAFT_POISON|FOREIGN_WORKSPACE|CONFIRMED_TEXT_POISON/u,
    );
  });

  it("uses neither draft/proposed memory nor cross-workspace/project snapshots", () => {
    const foreignWorkspace = candidate({
      id: "foreign-workspace",
      status: "CONFIRMED",
      createdAt: "2026-09-03T13:00:00.000Z",
      summary: "FOREIGN_WORKSPACE_SECRET",
      blockers: "FOREIGN_BLOCKER",
      nextDecision: "FOREIGN_DECISION",
      candidateWorkspaceId: "workspace-other",
    });
    const answer = answerProjectBrainQueryFromSnapshots({
      queryKind: "SUMMARY",
      workspaceId,
      projectId,
      candidates: [newerProposed, foreignWorkspace],
    });
    expect(answer).toMatchObject({
      status: "REFUSED",
      snapshotId: null,
      provenance: null,
    });
    expect(answer.reply).toContain("Aucune mémoire de chantier confirmée");
    expect(answer.reply).not.toMatch(/DRAFT_POISON|FOREIGN_/u);
  });

  it("projects local canonical-state routing for reads and a truthful refusal for binary claims", () => {
    expect(projectBrainRoutingProjection("SUMMARY")).toMatchObject({
      intentClass: "CANONICAL_STATE_QUERY",
      capabilityKey: "CANONICAL_STATE",
      disposition: "INTERNAL_TOOL",
      readiness: "INTERNAL_READY",
      providerExecutionAuthorized: false,
      externalDispatchPerformed: false,
    });
    expect(projectBrainRoutingProjection("BINARY_INTERPRETATION")).toMatchObject({
      intentClass: "DOCUMENT_UNDERSTANDING",
      capabilityKey: "DOCUMENT_UNDERSTANDING",
      disposition: "REFUSED",
      readiness: "REFUSED",
      providerExecutionAuthorized: false,
      externalDispatchPerformed: false,
    });
  });

  it("names audit actions by the observed disposition and exact replay status", () => {
    expect(projectBrainQueryAuditAction({ status: "ANSWERED", replayed: false }))
      .toBe("project_brain_query_answered");
    expect(projectBrainQueryAuditAction({ status: "REFUSED", replayed: false }))
      .toBe("project_brain_query_refused");
    expect(projectBrainQueryAuditAction({ status: "CLARIFICATION_REQUIRED", replayed: false }))
      .toBe("project_brain_query_clarification_required");
    expect(projectBrainQueryAuditAction({ status: "REFUSED", replayed: true }))
      .toBe("project_brain_query_refused_replayed");
  });
});

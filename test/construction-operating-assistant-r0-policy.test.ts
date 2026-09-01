import { describe, expect, it } from "vitest";
import {
  invoiceReadinessInputSchema,
  projectOpenLoopProjection,
  reportWorkFinishedCommandSchema,
  type InvoiceReadinessInput,
} from "../src/lib/construction-operating-assistant-r0/contracts";
import { evaluateInvoiceReadiness } from "../src/lib/construction-operating-assistant-r0/evaluator";

function claimed<T>(value: T) {
  return { value, state: "CLAIMED" as const };
}

function verified<T>(value: T) {
  return { value, state: "VERIFIED" as const };
}

function baseInput(): InvoiceReadinessInput {
  return {
    schemaVersion: 1,
    loopId: "loop-laval-extra-001",
    workspaceId: "workspace-olivier",
    projectId: "project-laval",
    stateVersion: 1,
    billingBasis: "CHANGE_ORDER",
    facts: {
      projectAssociation: verified(true),
      workDescription: claimed("Dosseret de cuisine terminé"),
      amount: claimed({ amountMinor: 120000, currency: "CAD" }),
      completion: claimed(true),
      approval: claimed("APPROVED"),
    },
    evidence: [
      {
        id: "evidence-written-approval",
        workspaceId: "workspace-olivier",
        projectId: "project-laval",
        kind: "WRITTEN_APPROVAL",
        state: "VERIFIED",
      },
      {
        id: "evidence-photo",
        workspaceId: "workspace-olivier",
        projectId: "project-laval",
        kind: "PHOTO",
        state: "VERIFIED",
      },
    ],
    contradictions: [],
  };
}

describe("Construction Operating Assistant R0 invoice-readiness policy", () => {
  it("keeps the R0 contract closed and rejects unknown fields or billing bases", () => {
    expect(() => invoiceReadinessInputSchema.parse({ ...baseInput(), unexpected: true })).toThrow();
    expect(() => invoiceReadinessInputSchema.parse({ ...baseInput(), billingBasis: "CONTRACT" })).toThrow();
  });

  it("does not let an interpreter or model declare its own facts verified", () => {
    const valid = {
      schemaVersion: 1,
      commandId: "command-001",
      workspaceId: "workspace-olivier",
      projectId: "project-laval",
      actorId: "user-olivier",
      sourceMessageId: "message-001",
      commandType: "REPORT_WORK_FINISHED",
      claims: {
        billingBasis: "CHANGE_ORDER",
        workDescription: "Dosseret terminé",
        amountMinor: 120000,
        currency: "CAD",
        completion: true,
        approvalState: "APPROVED",
      },
    } as const;

    expect(reportWorkFinishedCommandSchema.parse(valid)).toEqual(valid);
    expect(() =>
      reportWorkFinishedCommandSchema.parse({
        ...valid,
        claims: { ...valid.claims, verificationState: "VERIFIED" },
      }),
    ).toThrow();
  });

  it("reaches READY_TO_INVOICE only with the complete verified package", () => {
    const decision = evaluateInvoiceReadiness(baseInput());

    expect(decision.status).toBe("READY_TO_INVOICE");
    expect(decision.ready).toBe(true);
    expect(decision.missing).toEqual([]);
    expect(decision.verificationRequired).toEqual([]);
    expect(decision.nextResponsible).toEqual({
      kind: "USER",
      role: "OFFICE_OR_ACCOUNTING",
    });
    expect(decision.nextAction).toBe("PREPARE_INVOICE");
    expect(decision.decisionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not turn a verbal approval claim into written approval evidence", () => {
    const input = baseInput();
    input.evidence = input.evidence.filter((item) => item.kind !== "WRITTEN_APPROVAL");

    const decision = evaluateInvoiceReadiness(input);

    expect(decision.ready).toBe(false);
    expect(decision.status).toBe("WAITING_FOR_EVIDENCE");
    expect(decision.missing).toContain("WRITTEN_APPROVAL");
    expect(decision.nextAction).toBe("OBTAIN_WRITTEN_APPROVAL");
  });

  it("does not accept unrelated project evidence", () => {
    const input = baseInput();
    input.evidence = input.evidence.map((item) => ({ ...item, projectId: "project-other" }));

    const decision = evaluateInvoiceReadiness(input);

    expect(decision.ready).toBe(false);
    expect(decision.missing).toEqual(["SUPPORTING_EVIDENCE", "WRITTEN_APPROVAL"]);
  });

  it("keeps an unknown amount unknown instead of coercing it to zero", () => {
    const input = baseInput();
    input.facts.amount = { value: null, state: "UNKNOWN" };

    const decision = evaluateInvoiceReadiness(input);

    expect(decision.ready).toBe(false);
    expect(decision.missing).toContain("AMOUNT");
    expect(decision.reasons).toContain("AMOUNT_UNKNOWN");
    expect(projectOpenLoopProjection(input, decision, "OWNER").amountMinor).toBeNull();
  });

  it("preserves open contradictions and assigns an authorized verifier", () => {
    const input = baseInput();
    input.contradictions = [
      {
        id: "contradiction-approval-001",
        field: "approval",
        status: "OPEN",
      },
    ];

    const decision = evaluateInvoiceReadiness(input);

    expect(decision.ready).toBe(false);
    expect(decision.status).toBe("WAITING_FOR_VERIFICATION");
    expect(decision.contradictions).toEqual(["contradiction-approval-001"]);
    expect(decision.nextResponsible.role).toBe("AUTHORIZED_VERIFIER");
    expect(decision.nextAction).toBe("VERIFY_OR_RESOLVE");
  });

  it("assigns missing field evidence to the field role", () => {
    const input = baseInput();
    input.evidence = input.evidence.filter((item) => item.kind === "WRITTEN_APPROVAL");

    const decision = evaluateInvoiceReadiness(input);

    expect(decision.missing).toContain("SUPPORTING_EVIDENCE");
    expect(decision.nextResponsible.role).toBe("ASSIGNED_FIELD_ROLE");
    expect(decision.nextAction).toBe("SUPPLY_FIELD_EVIDENCE");
  });

  it("removes financial data from the field-worker projection", () => {
    const input = baseInput();
    const decision = evaluateInvoiceReadiness(input);

    expect(projectOpenLoopProjection(input, decision, "OWNER").amountMinor).toBe(120000);
    expect(projectOpenLoopProjection(input, decision, "OFFICE_MANAGER").amountMinor).toBe(120000);
    expect(projectOpenLoopProjection(input, decision, "ACCOUNTANT").amountMinor).toBe(120000);
    expect(projectOpenLoopProjection(input, decision, "FIELD_WORKER")).not.toHaveProperty(
      "amountMinor",
    );
  });

  it("produces the same canonical decision hash regardless of evidence order", () => {
    const first = baseInput();
    const second = baseInput();
    second.evidence = [...second.evidence].reverse();

    expect(evaluateInvoiceReadiness(first).decisionHash).toBe(
      evaluateInvoiceReadiness(second).decisionHash,
    );
  });
});

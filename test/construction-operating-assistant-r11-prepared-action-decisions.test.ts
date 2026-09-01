import { describe, expect, it } from "vitest";
import {
  preparedActionDecisionCommandSchema,
  preparedActionDecisionResultSchema,
} from "@/lib/construction-operating-assistant-r11/prepared-action-decisions";

const command = {
  schemaVersion: 1,
  commandId: "97be8436-0c98-44f4-a78d-11e710aeb12f",
  workspaceId: "workspace-1",
  actionId: "action-1",
  expectedVersion: 1,
  expectedFingerprint: "a".repeat(64),
  decision: "APPROVE",
} as const;

describe("Construction Operating Assistant R11 decision contracts", () => {
  it("accepts exact approve, reject and revoke commands", () => {
    expect(preparedActionDecisionCommandSchema.parse(command)).toEqual(command);
    expect(
      preparedActionDecisionCommandSchema.parse({
        ...command,
        decision: "REJECT",
        reason: "Le texte doit être corrigé.",
      }),
    ).toBeTruthy();
    expect(
      preparedActionDecisionCommandSchema.parse({
        ...command,
        decision: "REVOKE",
        reason: "Le rendez-vous a changé.",
      }),
    ).toBeTruthy();
  });

  it("refuses missing reasons, client actors, unknown decisions and unknown fields", () => {
    expect(
      preparedActionDecisionCommandSchema.safeParse({
        ...command,
        decision: "REJECT",
      }).success,
    ).toBe(false);
    expect(
      preparedActionDecisionCommandSchema.safeParse({
        ...command,
        actorUserId: "attacker",
      }).success,
    ).toBe(false);
    expect(
      preparedActionDecisionCommandSchema.safeParse({
        ...command,
        decision: "SEND",
      }).success,
    ).toBe(false);
  });

  it("allows only explicit unsent result states", () => {
    const result = {
      schemaVersion: 1,
      commandId: command.commandId,
      actionId: command.actionId,
      decision: "APPROVE",
      state: "APPROVED_UNSENT",
      version: 1,
      fingerprint: command.expectedFingerprint,
      decidedAt: "2026-09-01T13:00:00.000Z",
      replayed: false,
      externalTransportPerformed: false,
    } as const;
    expect(preparedActionDecisionResultSchema.parse(result)).toEqual(result);
    expect(
      preparedActionDecisionResultSchema.safeParse({
        ...result,
        state: "SENT",
      }).success,
    ).toBe(false);
    expect(
      preparedActionDecisionResultSchema.safeParse({
        ...result,
        externalTransportPerformed: true,
      }).success,
    ).toBe(false);
  });
});

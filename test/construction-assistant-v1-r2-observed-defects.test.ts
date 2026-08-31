import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { InterpreterContext } from "../src/lib/construction-assistant-v1/contracts";
import { interpretConstructionMessage } from "../src/lib/construction-assistant-v1/interpreter";
import { localInboundEnvelopeSchema } from "../src/lib/construction-assistant-v1/messaging";

const context: InterpreterContext = {
  referenceNow: "2026-08-31T13:00:00.000Z",
  locale: "fr-CA",
  timezone: "America/Toronto",
  projects: [{ id: "project-laval", code: "LAVAL-001", name: "Rénovation Laval" }],
  contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
};

describe("founder-observed defect regressions", () => {
  it("accepts the bounded Laval alias only when it identifies one project", () => {
    const result = interpretConstructionMessage("Rendez-vous avec Marc mardi à 14 h pour Laval.", context);
    expect(result.intent).toBe("CALENDAR_ITEM_CREATE");
    expect(result.projectId).toBe("project-laval");

    const ambiguous = interpretConstructionMessage("Rendez-vous avec Marc mardi à 14 h pour Laval.", {
      ...context,
      projects: [...context.projects, { id: "project-laval-2", code: "LAVAL-002", name: "Extension Laval" }],
    });
    expect(ambiguous.intent).toBe("CLARIFICATION_REQUIRED");
    expect(ambiguous.clarification?.reason).toBe("AMBIGUOUS_PROJECT");
  });

  it("constructs the exact strict local envelope without an unknown recipient field", () => {
    expect(() => localInboundEnvelopeSchema.parse({
      schemaVersion: 1,
      provider: "ENDVERA_LOCAL_SIMULATOR",
      providerMessageId: "local-founder-r2",
      channel: "SMS",
      normalizedSender: "sim-sms:synthetic-user",
      body: "Le matériel de Laval est prêt pour mardi.",
      receivedAt: "2026-08-31T13:00:00.000Z",
      signatureValid: true,
    })).not.toThrow();

    const actionSource = readFileSync(join(process.cwd(), "src/server/actions/construction-assistant-v1.ts"), "utf8");
    expect(actionSource).not.toContain("normalizedRecipients");
  });

  it("passes both forms directly to useActionState so FormData reaches the server action", () => {
    const composer = readFileSync(join(process.cwd(), "src/components/construction-assistant-v1/a2-composer.tsx"), "utf8");
    const simulator = readFileSync(join(process.cwd(), "src/components/construction-assistant-v1/local-simulator.tsx"), "utf8");
    expect(composer).toContain("useActionState(submitA2ConstructionMessage, initial)");
    expect(simulator).toContain("useActionState(submitLocalConstructionSimulation, initial)");
    expect(composer).not.toContain("async (previous");
    expect(simulator).not.toContain("async (previous");
  });
});

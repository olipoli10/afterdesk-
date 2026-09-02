import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const INTERNAL_E2E_CLOSED_SCENARIO = {
  schemaVersion: 1,
  workspace: { name: "ENDVERA Construction Internal E2E", timezone: "America/Toronto", locale: "fr-CA" },
  project: { code: "LAVAL-R36", name: "Rénovation Laval R36" },
  contact: { displayName: "Marc", role: "Fournisseur synthétique" },
  appointment: {
    clear: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval R36.",
    ambiguous: "Rendez-vous avec Marc mardi à 2 pour Rénovation Laval R36.",
  },
  invoiceReadiness: {
    workDescription: "Dosseret de cuisine",
    amountMinor: 120_000,
    currency: "CAD",
    requiredEvidence: ["WRITTEN_APPROVAL", "PHOTO"],
  },
  outbound: { channel: "SMS", disposition: "PREPARED_UNSENT" },
  providerObserved: false,
  externalEffectCount: 0,
} as const;

export const INTERNAL_E2E_SCENARIO_HASH = sha256Canonical(INTERNAL_E2E_CLOSED_SCENARIO);


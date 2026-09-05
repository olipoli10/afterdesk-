import { prepareFounderTestAccess } from "../../../src/server/construction-operating-assistant-r38/founder-test";

async function main() {
  const session = await prepareFounderTestAccess();
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    sessionId: session.sessionId,
    stage: session.stage,
    accessExpiresAtUtc: session.accessExpiresAtUtc,
    scenarioId: "LAVAL-001-DOSSERET-1200-CAD",
    dataClass: "SYNTHETIC_LOCAL_ONLY",
    providerDispatchCount: 0,
    externalTransportCount: 0,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

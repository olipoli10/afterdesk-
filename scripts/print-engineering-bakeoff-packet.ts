import { createCandidatePacket, type BakeoffParticipant } from "../src/lib/engineering-factory/bakeoff";
import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";

const rawParticipant = process.argv[2];
if (rawParticipant !== "Codex" && rawParticipant !== "Claude") {
  console.error("Usage: npm run devbench:packet -- Codex|Claude");
  process.exitCode = 1;
} else {
  const packet = createCandidatePacket(DEV_BENCH_V1, rawParticipant as BakeoffParticipant);
  console.log(JSON.stringify(packet, null, 2));
}

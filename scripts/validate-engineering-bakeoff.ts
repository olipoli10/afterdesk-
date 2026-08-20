import { createCandidatePacket, packetsAreEquivalent } from "../src/lib/engineering-factory/bakeoff";
import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";

const codex = createCandidatePacket(DEV_BENCH_V1, "Codex");
const claude = createCandidatePacket(DEV_BENCH_V1, "Claude");

if (!packetsAreEquivalent(codex, claude)) {
  console.error("Bake-off packets diverged outside their participant label.");
  process.exitCode = 1;
} else {
  console.log(`Bake-off packets are equal: ${codex.cases.length} cases; participant label is the only difference.`);
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// This proves only a local Node permission boundary, never Codex/provider isolation.
// Initial observation and replay must run with permission restrictions, not just replay.
const [mode, commandId, corpusPath, oracleManifestPath] = process.argv.slice(2);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidencePaths = [corpusPath, oracleManifestPath];
let evidenceSha256;
try {
  if (mode !== "--revalidation-replay" || process.argv.length !== 6 || !/^[A-Za-z0-9_-]+$/u.test(commandId)) throw new Error();
  const bytes = evidencePaths.map((path) => readFileSync(path));
  evidenceSha256 = bytes.map(hash);
  const [corpus, manifest] = bytes.map((value) => JSON.parse(value.toString("utf8")));
  if (corpus.kind !== "CORPUS_MANIFEST" || manifest.kind !== "ORACLE_MANIFEST") throw new Error();
  const hidden = corpus.cases.filter((entry) => entry.split === "HIDDEN");
  let passed = hidden.length === 32 && new Set(hidden.map((entry) => entry.caseId)).size === 32 && Boolean(process.permission);
  // Verify a real filesystem read fails with permission denial for every hidden file.
  // ENOENT is NOT accepted: unavailable data is not access-control proof.
  for (const entry of hidden) {
    const oracles = manifest.entries.filter((oracle) => oracle.caseId === entry.caseId);
    if (oracles.length !== 1) { passed = false; continue; }
    const path = resolve(oracles[0].oracleEntryPath);
    if (!process.permission || process.permission.has("fs.read", path)) { passed = false; continue; }
    try { readFileSync(path); passed = false; }
    catch (error) { if (error.code !== "ERR_ACCESS_DENIED" || error.permission !== "FileSystemRead") passed = false; }
  }
  process.stdout.write(`${JSON.stringify({kind:"INVARIANT_RESULT", invariantId:"HIDDEN_ORACLE_ACCESS_DENIED", method:"AUTOMATED", commandId, deviceEvidencePath:null, deviceEvidenceSha256:null, result:passed ? "PASS" : "FAIL", evidencePaths, evidenceSha256})}\n`);
  process.exitCode = passed ? 0 : 1;
} catch {
  process.stderr.write("LOCAL_ORACLE_DENIAL_DEPENDENCY_OR_ARGUMENT_INVALID\n");
  process.exitCode = 1;
}

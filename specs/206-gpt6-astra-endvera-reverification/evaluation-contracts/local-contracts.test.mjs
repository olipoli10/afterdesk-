import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { calculateCanonicalMetrics, baselinePath, runMetric } from "./local-metrics.mjs";
import { conformsToSyntheticPolicy, runNoPii } from "./local-corpus-no-pii.mjs";

const prefix = "specs/206-gpt6-astra-endvera-reverification";
const baseline = readFileSync(baselinePath,"utf8");
test("canonical row arithmetic independently derives the retained five rubrics", () => {
  assert.deepEqual(calculateCanonicalMetrics(baseline), {roadmap:22,localBuildReadiness:46.75,c2:"18/18",realProviderCustomerReadiness:"NO-GO",verifiedE2E:0});
});
test("headline inflation does not award row credit", () => {
  assert.equal(calculateCanonicalMetrics(baseline.replace("**22%**", "**99%**")).roadmap, 22);
});
test("tampered build credit fails; unknown maturity fails; missing phase fails", () => {
  assert.throws(() => calculateCanonicalMetrics(baseline.replace("| 6.75 |", "| 8.75 |")));
  assert.throws(() => calculateCanonicalMetrics(baseline.replace("| 8 | 0.75 |", "| 8 | 0.80 |")));
  assert.throws(() => calculateCanonicalMetrics(baseline.replace("| 12 Measured 80–85% coverage | 2 | 0 |", "| REMOVED | 2 | 0 |")));
});
test("new E2E headline cannot replace missing denominator or reuse baseline as final", () => {
  assert.throws(() => calculateCanonicalMetrics(baseline.replace("| Verified-E2E observed coverage | **0%**", "| Verified-E2E observed coverage | **20%**")));
  assert.throws(() => runMetric(["--revalidation-replay","roadmap","test-id",baselinePath]));
});
test("all prepared synthetic cases obey bounded identifier/data policy", () => {
  const paths = readdirSync(`${prefix}/corpus/candidate-inputs`).filter((path) => path.endsWith(".json"));
  assert.equal(paths.length,96);
  for (const path of paths) assert.equal(conformsToSyntheticPolicy(JSON.parse(readFileSync(`${prefix}/corpus/candidate-inputs/${path}`,"utf8"))),true,path);
});
test("synthetic policy rejects marker removal and prohibited contact fields", () => {
  const base = JSON.parse(readFileSync(`${prefix}/corpus/candidate-inputs/syn-contacts-01.json`,"utf8"));
  assert.equal(conformsToSyntheticPolicy({...base,synthetic:false}),false);
  // Constructed test values only, no real person's details.
  assert.equal(conformsToSyntheticPolicy({...base,context:{email:"test@not-reserved.test"}}),false);
  assert.equal(conformsToSyntheticPolicy({...base,context:{phone:"555"}}),false);
  assert.equal(conformsToSyntheticPolicy({...base,context:{address:"Simulation"}}),false);
  assert.equal(conformsToSyntheticPolicy({...base,context:{id:"unprefixed-id"}}),false);
});
test("manifest scanner checks all 96 byte hashes", () => {
  assert.equal(runNoPii(["--revalidation-replay","g0-contract-test",`${prefix}/corpus/manifest.json`]).result,"PASS");
});
test("oracle denial is real permission enforcement and fails without it", () => {
  const entrypoint = `${prefix}/evaluation-contracts/local-oracle-denial.mjs`;
  const corpus = `${prefix}/corpus/manifest.json`;
  const oracle = `${prefix}/corpus/oracle-manifest.json`;
  const args = [entrypoint,"--revalidation-replay","g0-denial-selftest",corpus,oracle];
  const permitted = [entrypoint,corpus,oracle].map((path) => `--allow-fs-read=${resolve(path)}`);
  const restricted = spawnSync(process.execPath,["--permission",...permitted,...args],{encoding:"utf8",windowsHide:true});
  assert.equal(restricted.status,0,restricted.stderr);
  assert.equal(JSON.parse(restricted.stdout).result,"PASS");
  const unrestricted = spawnSync(process.execPath,args,{encoding:"utf8",windowsHide:true});
  assert.equal(unrestricted.status,1);
  assert.equal(JSON.parse(unrestricted.stdout).result,"FAIL");
});

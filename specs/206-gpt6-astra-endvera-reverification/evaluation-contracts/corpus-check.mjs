import { BASE, canonical, conforms, demand, gradeCompletion, linked, readBytes } from "./corpus-grader.mjs";
try {
  demand(process.argv.length === 2, "CORPUS_CHECK_ARGUMENTS");
  const manifest = JSON.parse(readBytes(BASE + "corpus/manifest.json"));
  const oracleManifest = JSON.parse(readBytes(BASE + "corpus/oracle-manifest.json"));
  const devIndex = JSON.parse(readBytes(BASE + "corpus/development-oracles.json"));
  const tools = linked(manifest.toolSchemaPath, manifest.toolSchemaSha256), schema = tools[0].parameters;
  demand(manifest.kind === "CORPUS_MANIFEST" && manifest.cases.length === 96 && manifest.totalCaseCount === 96 && manifest.developmentCaseCount === 64 && manifest.hiddenCaseCount === 32 && manifest.familyCount === 8, "CORPUS_COUNTS");
  const promptBytes = readBytes(manifest.promptPath);
  demand(promptBytes.length > 0, "CORPUS_PROMPT_EMPTY");
  const { sha256 } = await import("./corpus-grader.mjs");
  demand(sha256(promptBytes) === manifest.promptSha256, "CORPUS_PROMPT_HASH");
  const baseline = linked(manifest.baselineProfilePath, manifest.baselineProfileSha256);
  const candidate = linked(manifest.candidateProfilePath, manifest.candidateProfileSha256);
  const profileKeys = ["endpoint","kind","maxOutputTokens","model","profile","promptPath","promptSha256","provider","reasoning","schemaVersion","temperature","timeoutMs","toolSchemaPath","toolSchemaSha256"].sort();
  for (const [profile, name] of [[baseline,"BASELINE"],[candidate,"CANDIDATE"]]) {
    demand(canonical(Object.keys(profile).sort()) === canonical(profileKeys), "CORPUS_PROFILE_KEYS");
    demand(profile.kind === "MODEL_PROFILE" && profile.schemaVersion === "1.0" && profile.profile === name && profile.provider === "OPENROUTER" && profile.endpoint === "https://openrouter.ai/api/v1/responses", "CORPUS_PROFILE_SHAPE");
    demand(profile.promptPath === manifest.promptPath && profile.promptSha256 === manifest.promptSha256 && profile.toolSchemaPath === manifest.toolSchemaPath && profile.toolSchemaSha256 === manifest.toolSchemaSha256, "CORPUS_PROFILE_LINKS");
    demand(profile.maxOutputTokens === 2048 && profile.timeoutMs === 60000 && profile.temperature === null && profile.reasoning === null, "CORPUS_PROFILE_BOUNDS");
  }
  demand(baseline.model === "UNRESOLVED_RUNTIME_BASELINE_NOT_CALLABLE" && candidate.model === "UNPROBED_RUNTIME_CANDIDATE_NOT_CALLABLE", "CORPUS_PROFILES_MUST_REMAIN_NONCALLABLE");
  demand(oracleManifest.kind === "ORACLE_MANIFEST" && oracleManifest.entries.length === 32 && devIndex.entries.length === 64 && devIndex.pilotCaseIds.length === 16 && new Set(devIndex.pilotCaseIds).size === 16, "CORPUS_ORACLE_COUNTS");
  const families = new Map(), cases = new Set(), inputTexts = new Set();
  const entries = [...oracleManifest.entries, ...devIndex.entries];
  demand(new Set(entries.map(entry => entry.caseId)).size === 96, "CORPUS_ORACLE_DUPLICATE");
  let checks = 0;
  const longDictationCases = [];
  for (const testCase of manifest.cases) {
    demand(!cases.has(testCase.caseId), "CORPUS_CASE_DUPLICATE"); cases.add(testCase.caseId);
    const input = linked(testCase.inputPath, testCase.inputSha256);
    demand(input.caseId === testCase.caseId && input.synthetic === true && input.locale === "fr-CA" && input.workspaceId === "synthetic-workspace" && input.timezone === "America/Toronto", "CORPUS_INPUT_SHAPE");
    demand(typeof input.user === "string" && input.user.length >= 10 && !inputTexts.has(input.user), "CORPUS_INPUT_DIVERSITY"); inputTexts.add(input.user);
    demand(testCase.inputPath.startsWith(BASE + "corpus/candidate-inputs/") && !("expected" in input) && !("oracle" in input), "CORPUS_INPUT_ORACLE_LEAK");
    const group = families.get(testCase.family) ?? { DEVELOPMENT:0, HIDDEN:0 };
    demand(testCase.split in group, "CORPUS_SPLIT"); group[testCase.split]++; families.set(testCase.family, group);
    const entry = entries.find(entry => entry.caseId === testCase.caseId);
    demand(entry && (testCase.split === "HIDDEN" ? oracleManifest.entries : devIndex.entries).includes(entry), "CORPUS_ORACLE_SPLIT");
    demand(entry.oracleEntryPath.startsWith(BASE + "corpus/grader-only/" + testCase.split.toLowerCase() + "/"), "CORPUS_ORACLE_SEPARATION");
    const oracle = linked(entry.oracleEntryPath, entry.oracleEntrySha256);
    demand(oracle.caseId === testCase.caseId && oracle.riskLevel === entry.riskLevel && oracle.comparison === "CANONICAL_JSON_EXACT" && conforms(oracle.expected, schema), "CORPUS_ORACLE_CONTRACT");
    const normalized = completion => ({kind:"MODEL_OUTPUT",outcome:"COMPLETED",completion,error:null});
    demand(gradeCompletion(normalized(JSON.stringify(oracle.expected)), oracle, schema), "CORPUS_GRADER_POSITIVE_SELF_CHECK"); checks++;
    for (const rejected of [
      {...oracle.expected, executionAuthorized:true},
      {...oracle.expected, unexpected:true},
      {...oracle.expected, decision:"EXECUTE"},
      {...oracle.expected, decision:oracle.expected.decision === "ANSWER" ? "PREVIEW" : "ANSWER"},
      {...oracle.expected, actions:[...oracle.expected.actions, {operation:"SEND_SMS",targetIds:[],fields:[],dependsOn:[]}]}
    ]) {
      demand(!gradeCompletion(normalized(JSON.stringify(rejected)), oracle, schema), "CORPUS_GRADER_NEGATIVE_SELF_CHECK"); checks++;
    }
    demand(!gradeCompletion(normalized("{broken"), oracle, schema), "CORPUS_GRADER_PARSE_SELF_CHECK"); checks++;
    demand(!gradeCompletion({...normalized(null),outcome:"PROVIDER_ERROR",error:{}}, oracle, schema), "CORPUS_GRADER_PROVIDER_ERROR_SELF_CHECK"); checks++;
    if (testCase.family === "DICTATION") {
      const words = input.user.split(/\s+/u).length;
      if (["syn-dictation-01", "syn-dictation-02", "syn-dictation-09", "syn-dictation-10"].includes(testCase.caseId)) {
        demand(words >= 1200 && words <= 1800, "CORPUS_LONG_DICTATION_WORD_COUNT");
        longDictationCases.push({caseId:testCase.caseId,split:testCase.split,words});
      } else demand(words >= 200, "CORPUS_SHORT_DICTATION_WORD_COUNT");
    }
  }
  demand(families.size === 8 && [...families.values()].every(counts => counts.DEVELOPMENT === 8 && counts.HIDDEN === 4), "CORPUS_FAMILY_STRATIFICATION");
  demand(devIndex.pilotCaseIds.every(id => devIndex.entries.find(entry => entry.caseId === id)?.riskLevel === "HIGH"), "CORPUS_PILOT_RISK");
  demand(longDictationCases.length === 4 && longDictationCases.filter(item => item.split === "HIDDEN").length === 2, "CORPUS_LONG_DICTATION_STRATIFICATION");
  process.stdout.write(JSON.stringify({kind:"G0_CORPUS_CONTRACT_VALIDATION",cases:96,development:64,hidden:32,families:8,longDictationCases,syntheticGraderSelfChecks:checks,providerCalls:0,candidateAccess:"UNPROBED",runtimeBaseline:"UNRESOLVED",oracleAccessDenialObserved:false,productBaselineEvidence:false,status:"PASS"}) + "\n");
} catch (error) {
  process.stderr.write(error instanceof Error && /^CORPUS_[A-Z_]+$/.test(error.message) ? error.message + "\n" : "CORPUS_CHECK_REJECTED\n");
  process.exitCode = 1;
}

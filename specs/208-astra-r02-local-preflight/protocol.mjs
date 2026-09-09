import { createHash } from 'node:crypto';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const encode = value => Buffer.from(JSON.stringify(value) + '\n');
export const fail = (ok, code) => { if (!ok) throw new Error(code); };
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const hex40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
// Git may materialize LF source as CRLF on Windows. Accept only that exact
// lossless pairing, never mixed/lone CR, binary changes or altered raw evidence.
export function gitSourceBytesEqual(blob, working) {
  if(blob.equals(working))return true;
  if(blob.includes(0)||blob.includes(13)||!Buffer.from(blob.toString('utf8'),'utf8').equals(blob))return false;
  return Buffer.from(blob.toString('utf8').replaceAll('\n','\r\n'),'utf8').equals(working);
}
export function keys(value, expected) {
  fail(value && typeof value === 'object' && !Array.isArray(value) &&
    same(Object.keys(value).sort(), [...expected].sort()), 'SHAPE_REFUSED');
}
export function safePath(path) {
  fail(typeof path === 'string' && /^[^\x00-\x1f\\:*?"<>|]+$/.test(path) &&
    !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..' && !/[. ]$/.test(p) &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), 'PATH_REFUSED');
  return path;
}
export function validateContract(contract) {
  keys(contract, ['schemaVersion','campaignId','historicalSourceHead','preparationBaseHead','brainStartHead','authority','checks','unresolvedProductGates','selectionRule','productVerdict','providerVerdict','adoptionDecision']);
  fail(contract.schemaVersion === 1 && /^[a-z0-9-]{8,80}$/.test(contract.campaignId) &&
    hex40(contract.historicalSourceHead) && hex40(contract.preparationBaseHead) && hex40(contract.brainStartHead) &&
    contract.authority === 'LOCAL_ONLY_NO_PROVIDER' && contract.productVerdict === 'LOCAL_REVALIDATION_REWORK' &&
    contract.providerVerdict === null && contract.adoptionDecision === null &&
    contract.selectionRule === 'LATEST_ENROLLED_ATTEMPT_PER_CHECK_AT_FROZEN_HEAD', 'CONTRACT_AUTHORITY_REFUSED');
  fail(Array.isArray(contract.unresolvedProductGates) && contract.unresolvedProductGates.length > 0 &&
    contract.unresolvedProductGates.every(g => typeof g === 'string' && /^[A-Z0-9_]+$/.test(g)), 'PRODUCT_LIMITS_REQUIRED');
  fail(Array.isArray(contract.checks) && contract.checks.length > 0 && contract.checks.length <= 64 &&
    new Set(contract.checks.map(c => c.id)).size === contract.checks.length, 'CHECK_SET_REFUSED');
  for (const check of contract.checks) {
    keys(check, ['id','cwd','args','timeoutMs','parser']);
    fail(/^[A-Z0-9_]{1,60}$/.test(check.id) && ['.','apps/mobile'].includes(check.cwd) &&
      Array.isArray(check.args) && check.args.length > 0 && check.args.every(a => typeof a === 'string' && !a.includes('\0')) &&
      Number.isInteger(check.timeoutMs) && check.timeoutMs > 0 && check.timeoutMs <= 300000, 'CHECK_DESCRIPTOR_REFUSED');
    if (['tap','vitest'].includes(check.parser.kind)) {
      keys(check.parser,['kind','minimumPassed']);
      fail(Number.isInteger(check.parser.minimumPassed) && check.parser.minimumPassed > 0,'PARSER_MINIMUM_REQUIRED');
    } else if(check.parser.kind === 'json') {
      keys(check.parser,['kind','expected']); fail(check.parser.expected && typeof check.parser.expected === 'object','PARSER_EXPECTATION_REQUIRED');
    } else if(check.parser.kind === 'marker') {
      keys(check.parser,['kind','exactLine']); fail(typeof check.parser.exactLine === 'string' && check.parser.exactLine.length > 0,'PARSER_MARKER_REQUIRED');
    } else throw new Error('PARSER_UNKNOWN');
  }
}
// Pattern coverage only, not a proof that arbitrary data contains no secret.
// Boundaries prevent embedded SHA256 substrings from masquerading as tokens.
export function secretFlags(bytes) {
  if (Buffer.isBuffer(bytes) && (bytes.includes(0) || !Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes))) return ['NON_UTF8_OUTPUT'];
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const patterns = [
    ['PROVIDER_TOKEN', /(?<![A-Za-z0-9_-])sk-(?:or-v1-|proj-|ant-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/u],
    ['GITHUB_TOKEN', /(?<![A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{20,}(?![A-Za-z0-9])/u],
    ['AWS_TOKEN', /(?<![A-Za-z0-9])AKIA[A-Z0-9]{16}(?![A-Za-z0-9])/u],
    ['TWILIO_TOKEN', /(?<![A-Za-z0-9_])(?:AC|SK)[a-f0-9]{32}(?![A-Za-z0-9_])/iu],
    ['PRIVATE_KEY_BODY', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{16,}/u],
    ['BEARER_TOKEN', /Bearer\s+[A-Za-z0-9_./+=-]{20,}/iu],
    ['DATABASE_PASSWORD', /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/iu],
    ['NAMED_SECRET', /(?:api[_-]?key|access[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|password|secret)\s*["']?\s*[:=]\s*["']?(?!REDACTED\b|null\b|false\b)[A-Za-z0-9_./+=:@-]{20,}/iu],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
export function parseCheck(parser, stdout, stderr, exitCode) {
  if (exitCode !== 0) return { status: 'FAIL', reason: 'NATIVE_EXIT_NONZERO' };
  const text = stdout.toString('utf8');
  if (parser.kind === 'vitest') {
    let report;
    for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
      try { report = JSON.parse(text.slice(i)); break; } catch { /* logs may precede JSON */ }
    }
    if (!report || report.success !== true || report.numFailedTests !== 0 || report.numFailedTestSuites !== 0 ||
        !Number.isInteger(report.numPassedTests) || report.numPassedTests < parser.minimumPassed ||
        !Array.isArray(report.testResults)) return { status: 'FAIL', reason: 'VITEST_REPORT_INVALID' };
    const assertions = report.testResults.flatMap(r => r.assertionResults ?? []);
    if (!report.testResults.every(r => ['passed','pending','skipped'].includes(r.status)) ||
        !assertions.every(a => ['passed','pending','skipped','todo'].includes(a.status))) return { status: 'FAIL', reason: 'VITEST_CONTRADICTORY_ASSERTIONS' };
    const actual = assertions.filter(a => a.status === 'passed').length;
    if (actual !== report.numPassedTests) return { status: 'FAIL', reason: 'VITEST_ASSERTION_COUNT_MISMATCH' };
    return { status: 'PASS', passed: actual, skipped: report.numPendingTests };
  }
  if (parser.kind === 'tap') {
    const fields=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name =>
      [name,[...text.matchAll(new RegExp(`^# ${name} (\\d+)$`,'gm'))]]));
    if(Object.values(fields).some(a=>a.length!==1))return {status:'FAIL',reason:'TAP_REPORT_INVALID'};
    const n=Object.fromEntries(Object.entries(fields).map(([name,v])=>[name,+v[0][1]]));
    const ok=[...text.matchAll(/^ok \d+ - /gm)].length;
    return n.pass>=parser.minimumPassed && n.fail===0 && n.cancelled===0 && !/^not ok /m.test(text) &&
      n.tests===n.pass+n.skipped+n.todo && ok===n.tests
      ? {status:'PASS',passed:n.pass}:{status:'FAIL',reason:'TAP_REPORT_INVALID'};
  }
  if (parser.kind === 'json') {
    try {
      const data = JSON.parse(text);
      return same(data, parser.expected) ? { status: 'PASS', measurement: data }
        : { status: 'FAIL', reason: 'JSON_RESULT_MISMATCH' };
    } catch { return { status: 'FAIL', reason: 'JSON_RESULT_INVALID' }; }
  }
  if (parser.kind === 'marker') {
    return text.split(/\r?\n/).includes(parser.exactLine)
      ? { status: 'PASS' } : { status: 'FAIL', reason: 'REQUIRED_MARKER_MISSING' };
  }
  throw new Error('PARSER_UNKNOWN');
}

// Pure projection. Caller provides the FULL inventory of an immutable Git anchor.
export function validateLedger(contract, freeze, journal, inventory, read) {
  validateContract(contract);
  keys(freeze, ['schemaVersion','campaignId','testedHead','testedTree','contractSha256','runtimeSha256','frozenAt']);
  fail(freeze.schemaVersion === 1 && freeze.campaignId === contract.campaignId &&
    hex40(freeze.testedHead) && hex40(freeze.testedTree) &&
    freeze.contractSha256 === sha(encode(contract)) && /^[a-f0-9]{64}$/.test(freeze.runtimeSha256) && Number.isFinite(Date.parse(freeze.frozenAt)), 'FREEZE_REFUSED');
  fail(Array.isArray(journal) && journal.length > 0, 'EMPTY_JOURNAL');
  fail(new Set(inventory).size === inventory.length, 'DUPLICATE_INVENTORY_PATH');
  inventory.forEach(safePath);
  const seen = new Set(), expected = new Set(['freeze.json','journal.json','runtime.json']);
  fail(sha(read('runtime.json'))===freeze.runtimeSha256,'RUNTIME_BINDING_REFUSED');
  const attempts = [], selected = new Map();
  let previous = null;
  for (const [index, entry] of journal.entries()) {
    keys(entry, ['id','sequence','checkId','campaignId','testedHead','testedTree','commandSha256','startedAt','previous']);
    fail(/^a\d{4}$/.test(entry.id) && !seen.has(entry.id) && entry.sequence === index + 1 &&
      entry.id === `a${String(index + 1).padStart(4,'0')}`, 'ATTEMPT_ID_REFUSED');
    seen.add(entry.id);
    fail(entry.previous === previous, 'JOURNAL_CHAIN_REFUSED');
    previous = sha(encode(entry));
    const check = contract.checks.find(c => c.id === entry.checkId);
    fail(check && entry.campaignId === freeze.campaignId && entry.testedHead === freeze.testedHead &&
      entry.testedTree === freeze.testedTree && entry.commandSha256 === sha(encode(check)), 'ATTEMPT_BINDING_REFUSED');
    fail(Number.isFinite(Date.parse(entry.startedAt)) && Date.parse(entry.startedAt) >= Date.parse(freeze.frozenAt), 'ATTEMPT_TIME_REFUSED');
    const prefix = `attempts/${entry.id}/`, intentPath = `${prefix}intent.json`, resultPath = `${prefix}result.json`;
    expected.add(intentPath);
    fail(same(JSON.parse(read(intentPath)), entry), 'INTENT_MISMATCH');
    let result = { status: 'INCOMPLETE', reason: 'NO_RESULT_RECORDED' };
    if (inventory.includes(resultPath)) {
      expected.add(resultPath);
      const native = JSON.parse(read(resultPath));
      keys(native, ['kind','finishedAt','exitCode','stdoutSha256','stderrSha256','incident','runtimeVerified']);
      fail(Number.isFinite(Date.parse(native.finishedAt)) && Date.parse(native.finishedAt) >= Date.parse(entry.startedAt), 'FINISH_TIME_REFUSED');
      if (native.kind === 'INCIDENT') {
        fail(native.exitCode === null && native.stdoutSha256 === null && native.stderrSha256 === null &&
          ['SECRET_OUTPUT_WITHHELD','LAUNCH_OR_CAPTURE_FAILED','RUNTIME_CHANGED','SOURCE_CHANGED'].includes(native.incident) &&
          typeof native.runtimeVerified==='boolean', 'INCIDENT_REFUSED');
        result = { status: 'INCOMPLETE', reason: native.incident };
      } else {
        fail(native.kind === 'COMPLETED' && native.incident === null && Number.isInteger(native.exitCode) && native.runtimeVerified===true, 'NATIVE_RECORD_REFUSED');
        const outPath = `${prefix}stdout.txt`, errPath = `${prefix}stderr.txt`;
        expected.add(outPath); expected.add(errPath);
        const stdout = read(outPath), stderr = read(errPath);
        fail(sha(stdout) === native.stdoutSha256 && sha(stderr) === native.stderrSha256, 'STREAM_HASH_REFUSED');
        fail(secretFlags(stdout).length === 0 && secretFlags(stderr).length === 0, 'SECRET_OUTPUT_REFUSED');
        result = { ...parseCheck(check.parser, stdout, stderr, native.exitCode), exitCode: native.exitCode };
      }
    }
    const observation = { id: entry.id, checkId: entry.checkId, testedHead: entry.testedHead, ...result };
    attempts.push(observation); selected.set(entry.checkId, observation);
  }
  fail(same([...expected].sort(), [...inventory].sort()), 'EVIDENCE_SET_MISMATCH');
  const current = contract.checks.map(c => selected.get(c.id) ?? { checkId: c.id, status: 'INCOMPLETE', reason: 'NOT_RUN' });
  return {
    attempts, current,
    historicalAttemptFailures: attempts.filter(a => a.status === 'FAIL').length,
    historicalAttemptIncomplete: attempts.filter(a => a.status === 'INCOMPLETE').length,
    currentFailures: current.filter(a => a.status === 'FAIL').length,
    currentIncomplete: current.filter(a => a.status === 'INCOMPLETE').length,
    contractCheckVerdict: current.every(a => a.status === 'PASS') ? 'LOCAL_CHECKS_PASS' : 'LOCAL_CHECKS_REWORK',
  };
}

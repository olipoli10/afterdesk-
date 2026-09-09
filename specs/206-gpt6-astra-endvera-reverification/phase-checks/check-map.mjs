const unit = (file, pattern) => ({ kind: 'vitest', cwd: '.', files: [file], pattern });
const integration = (file, pattern) => ({ ...unit(file, pattern), integration: true });
const focused = pattern => ({ ...unit('specs/206-gpt6-astra-endvera-reverification/phase-checks/focused.test.ts', pattern), config: 'specs/206-gpt6-astra-endvera-reverification/phase-checks/focused.config.mts' });
export const checks = {
 G1: {
  ROOT_TESTS: { kind: 'vitest', cwd: '.', files: [], minimumPassed: 2400 },
  MOBILE_TESTS: { kind: 'vitest', cwd: 'apps/mobile', files: [], minimumPassed: 195 },
  ROOT_BUILD: { kind: 'root-build' }, MOBILE_BUILD: { kind: 'mobile-build' },
  MIGRATION_CLEAN: { kind: 'database', operation: 'clean' },
  MIGRATION_UPGRADE: { kind: 'database', operation: 'upgrade' },
  SYNTHETIC_SEED: { kind: 'database', operation: 'seed' },
  CRITICAL_ROUTE_SMOKE: { kind: 'routes' },
  POSTGRES_RESTART_READBACK: { kind: 'database', operation: 'restart' },
  BACKLOG_VALIDATION: { kind: 'backlog' }, QUEUE_VALIDATION: { kind: 'queue' },
 },
 G7: {
  WEBHOOK_FORGERY: unit('test/construction-assistant-v1-security.test.ts', 'refuses forged and unverified senders'),
  DUPLICATE_PROVIDER_MESSAGE: integration('test/integration/construction-assistant-v1.itest.ts', 'converges concurrent duplicate delivery'),
  DOUBLE_APPROVAL: integration('test/integration/construction-operating-assistant-r38e-broadcast.itest.ts', 'refuses every second approval'),
  STALE_APPROVAL: integration('test/integration/construction-operating-assistant-r38e-broadcast.itest.ts', 'refuses stale version or fingerprint'),
  PREVIEW_MUTATION: unit('test/construction-assistant-v1-security.test.ts', 'binds approval to recipient'),
  RECIPIENT_CAP: unit('test/construction-operating-assistant-r38b.test.ts', 'eleven-person recipient sets'),
  CONTACT_HOMONYM: unit('test/construction-assistant-v1-contract.test.ts', 'two Marcs match'),
  DST_BOUNDARY: focused('DST_BOUNDARY'),
  OUTCOME_UNKNOWN: { kind: 'vitest', cwd: 'apps/mobile', files: ['test/outbox.test.ts', 'test/prepared-actions.test.ts'], minimumPassed: 2 },
  PERMISSION_REVOKED: integration('test/integration/construction-operating-assistant-r23-calendar-connectors.itest.ts', 'revokes one provider exactly'),
  NATIVE_CRASH_REPRODUCTION: { kind: 'native-signal' },
  FIELD_WORKER_FINANCIAL_ISOLATION: integration('test/integration/construction-operating-assistant-r16-permission-center.itest.ts', 'non-financial authority'),
  CROSS_WORKSPACE_ISOLATION: integration('test/integration/construction-assistant-v1.itest.ts', 'hides a workspace from an unrelated client'),
  SECRET_SCAN: { kind: 'secrets' }, MALFORMED_JSON: focused('MALFORMED_JSON'),
  PROMPT_INJECTION: focused('PROMPT_INJECTION'),
  POSTGRES_RESTART_READBACK: { kind: 'database', operation: 'restart' },
  CONTRACT_STATIC_VALIDATION: { kind: 'contracts' },
 }
};

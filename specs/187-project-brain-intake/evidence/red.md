# R36V RED Evidence

Recorded: 2026-09-03

Authority: local code and tests only. No provider, credential, customer data, external transport, external write, deployment or store action was used.

## Server contract RED

Command:

```text
npm test -- --run test/construction-operating-assistant-r36v-project-brain-contracts.test.ts
```

Observed expected failure:

```text
FAIL test/construction-operating-assistant-r36v-project-brain-contracts.test.ts
Cannot find package '@/lib/construction-operating-assistant-r36v/project-brain-intake'
Test Files 1 failed (1)
```

The runner and transform loaded normally. The suite failed at the missing R36V contract module, before implementation.

## Mobile contract RED

Command:

```text
npm --prefix apps/mobile test -- --run test/project-brain-intake.test.ts
```

Observed expected failures:

```text
missing future Project Brain mobile file: src/lib/project-brain-intake.ts
missing future Project Brain mobile file: src/app/(app)/project-brain-intake.tsx
missing projectBrainIntake/projectBrainCommand/uploadProjectBrainSource API and session wiring
missing hidden project-brain-intake route and project navigation
Test Files 1 failed (1)
Tests 4 failed (4)
```

All four failures target absent accepted behavior. No syntax, infrastructure, test-runner or unrelated mobile failure was observed.

## Non-vacuous conclusion

The accepted tests cannot pass against R36U. They require a strict local-only contract, durable retry state, one coherent mobile intake surface and hidden project navigation. Implementation may now begin without changing the expected behavior to manufacture GREEN.

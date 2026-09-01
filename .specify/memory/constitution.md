<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0

Bump rationale: initial ratification. The previous file was the unmodified Spec Kit
`constitution-template` scaffold containing only `[ALL_CAPS]` placeholder tokens, so no
governance was in force and there is no predecessor version to increment. 1.0.0 is the
first binding version.

Principles defined (all new; template slots I–V expanded to I–VII at the author's request):
  [PRINCIPLE_1_NAME] → I. Owned Outcomes and Continuous Operations
  [PRINCIPLE_2_NAME] → II. Truthful Closed-World Capability and Immutable Run Contracts
  [PRINCIPLE_3_NAME] → III. Authorization, Privacy, and Financial Integrity
  [PRINCIPLE_4_NAME] → IV. Durable Hybrid Execution Without Human Dumping
  [PRINCIPLE_5_NAME] → V. Verification, Evidence, and Delivery Are Separate Gates
  (added slot)       → VI. Evidence-Led Coverage and Sustainable Economics
  (added slot)       → VII. Incremental Evolution and Proportionate Testing

Sections added:
  [SECTION_2_NAME] / [SECTION_2_CONTENT] → Engineering and Operational Constraints
  [SECTION_3_NAME] / [SECTION_3_CONTENT] → Development Workflow and Quality Gates
  [GOVERNANCE_RULES]                     → Governance (concrete amendment, versioning,
                                           compliance, exception and complexity rules)

Sections removed: none.

Deferred items / TODOs: none. Every placeholder token is resolved; no bracket tokens remain.

Dependent artifacts: the Spec Kit spec, plan, tasks and checklist templates read this
constitution at runtime and were intentionally NOT modified by this command.
-->

# AfterDesk Constitution

AfterDesk is evolving from a controlled fixed-price task marketplace and early Work Compiler
into a managed-work engine that can own recurring SME computer operations end to end. A
customer describes an outcome; AfterDesk chooses and governs the execution route across
deterministic code, AI, official APIs, MCP or integration brokers, browser and computer use,
and structured human work. It must verify the result, handle exceptions, deliver it safely,
and remain accountable over time. Breadth is a target, never a licence to overclaim present
capability. These principles bind every specification, plan, review and release in this
repository.

## Core Principles

### I. Owned Outcomes and Continuous Operations

- AfterDesk MUST be designed around owned business outcomes and long-lived Operations, not
  around disconnected automations or isolated one-shot tasks.
- Intake, accepted scope, execution, exception recovery, verification, delivery and
  recurrence MUST form one accountable lifecycle. A handoff between stages MUST NOT drop
  ownership of the result; every stage MUST name who resolves its failures.
- An Operation MUST define its recurrence, its exception states, and its resolution owner
  before it is offered to a customer.
- Every customer-visible promise — marketing copy, intake wording, pricing surface, status
  label — MUST correspond to an operational path AfterDesk can actually run today under
  these principles. Where the path is human-executed, the promise MUST NOT imply automation.

**Rationale**: A marketplace sells discrete tasks and can let each one end in isolation. A
managed-work engine sells continuity, so an outcome that is technically produced but
unowned between runs is a defect, not a delivery.

### II. Truthful Closed-World Capability and Immutable Run Contracts

- Executable capabilities MUST be typed, versioned, registered in an explicit allowlist,
  bounded by policy, and fail closed. A capability absent from the registry MUST NOT
  execute, whatever a plan, a model, or an operator requests.
- Work that is unsupported, ambiguous, unauthorized, or unverifiable MUST NOT be presented
  to a customer or an operator as executable. Refusal, clarification, or an explicitly
  labelled human path are the only honest outcomes.
- Accepted scope, input file bytes, rules, price and economics, authorization, capability
  versions and verification criteria MUST be immutable for the lifetime of a run. A change
  MUST produce an explicit new version and MUST NOT mutate an accepted contract in place.
- A broad planner MUST NOT be reported as a broad executor. Planner vocabulary, compiler
  acceptance and verified execution are three distinct measurements and MUST be reported
  separately.
- Every coverage or capability claim MUST state its denominator, its evidence source and
  date, the execution standard applied, and a confidence level. What has not been measured
  MUST be labelled UNKNOWN rather than estimated favourably.

**Rationale**: The expensive failure mode of a work engine is not refusing work it could
have done — it is accepting work it cannot verifiably do. A closed world with honest
denominators makes that failure structurally hard to reach.

### III. Authorization, Privacy, and Financial Integrity

- Every protected read and every mutation MUST recheck identity, role, tenant, resource
  ownership, authorization, data classification and applicable policy at the point of use.
  Trust MUST NOT be inherited from an earlier check, a client-supplied value, or a prior
  step in the same run.
- External READ and external WRITE MUST be separate, separately registered capabilities. A
  WRITE capability MUST require explicit scoped approval, least-privilege credentials, a
  revocation path, retained audit evidence and a verifiable postcondition. Consequential
  actions SHOULD run through a reversible, preview or approval path; where no reversal
  exists, that MUST be stated at the point of approval.
- Secrets, credentials, raw sensitive data and cross-tenant artifacts MUST NOT enter source
  control, prompts, logs, error messages, analytics, or any worker-visible surface.
- Production security dependencies MUST fail closed. If a required scanner, policy check or
  authorization service cannot be reached, the protected action MUST be refused, never
  silently permitted.
- Money — provider spend, client price, worker payout, refunds and reservations — MUST use
  durable, auditable, idempotent controls. No execution may begin without the required
  economic authorization in place, and an unconfigured limit MUST be treated as a refusal,
  never as an unlimited one.

**Rationale**: These are the failures that end the business rather than degrade it. Each
rule is written so that the safe outcome is the default when a component is missing,
unreachable, or misconfigured.

### IV. Durable Hybrid Execution Without Human Dumping

- Runs and steps MUST be durable, idempotent, retry-safe, lease- and fencing-aware,
  observable and resumable after process loss. A step reclaimed after a crash is replayed in
  full, so a step that is not safe to replay MUST NOT be registered as executable.
- Human work MUST be a first-class typed capability with minimal scoped context, structured
  inputs and outputs, qualification and authorization requirements, an audit trail, explicit
  time and economic boundaries, and a machine resume point wherever the run continues
  afterwards.
- Forwarding an entire job wholesale to a worker MUST NOT be counted as machine coverage or
  Work Compiler coverage in any metric, report or external claim. Human execution counts as
  managed coverage only when it is safe, structured, measurable and integrated into the
  lifecycle.
- No worker may receive client credentials or identity-bearing information except through an
  explicitly authorized, isolated and audited access path.

**Rationale**: Human fallback is what makes breadth honest, and it is also the easiest way
to fake breadth. Typing human work as a capability keeps it usable without letting it
silently inflate what the machine is claimed to do.

### V. Verification, Evidence, and Delivery Are Separate Gates

- Completion MUST NOT be inferred from a successful API call, model response, tool
  invocation or schema-valid artifact. A successful call proves the call happened, nothing
  more.
- Each step and each Operation MUST define machine-checkable postconditions where feasible,
  recorded provenance and evidence, explicit exception states, and an independent review
  path proportional to the risk of being wrong.
- Semantic correctness and external state changes MUST be verified against the claim being
  made. A claim about a customer's system MUST be checked in or against that system, not
  only in AfterDesk's own record of what it intended.
- Working artifacts, evidence, candidate outputs and customer deliverables MUST have
  distinct, explicit roles. Delivery MUST occur only after required verification and
  authorization have passed. Evidence MUST be retained under policy without exposing
  internal artifacts, other tenants' data, or sensitive source material.

**Rationale**: Producing, checking and delivering fail in different ways, so collapsing them
into one gate means the weakest of the three sets the standard for all output.

### VI. Evidence-Led Coverage and Sustainable Economics

- Capability work MUST be prioritized by validated customer demand, incremental truthful
  coverage, risk, delivery confidence and contribution margin per engineering week — not by
  novelty, connector count or demo appeal.
- The architecture MUST NOT hard-code an API-only, browser-only, AI-only or human-only
  route. Each Operation MUST select the safest, most reliable, verifiable and economical
  access route available to it, with a bounded fallback and a defined give-up state.
- Synthetic benchmarks and fixtures are development evidence about the system, never
  evidence of market prevalence or customer demand. Strategic or irreversible bets MUST rest
  on real customer evidence. Production readiness MUST rest on observed lifecycle evidence;
  repository structure, passing synthetic tests and internal documents MUST NOT be presented
  as readiness.
- Provider spend, human time, rework, review time, failure and recovery, refunds, effective
  worker earnings and contribution margin MUST be tracked per Operation. Automation MAY
  replace cost only where outcome quality and safety do not regress; a measured regression
  MUST block the substitution.

**Rationale**: The engine is viable only while the spread between what a customer pays and
what an Operation costs to run, review and repair stays positive. Measuring the whole cost —
including review and rework — is what keeps automation decisions honest.

### VII. Incremental Evolution and Proportionate Testing

- Existing compiler, runtime and control-plane strengths MUST be preserved and extended. A
  rewrite or a new abstraction requires documented evidence that incremental extension
  cannot satisfy the accepted need.
- The smallest reversible change that increases verified capability coverage MUST be
  preferred over a larger speculative one.
- Contracts, state machines, schemas, migrations, security boundaries, money paths,
  concurrency, failure recovery and provider boundaries MUST carry proportionate automated
  tests. Integration tests MUST exercise real persistence and real boundary behaviour.
  Synthetic or replayed providers MUST be labelled as synthetic wherever their results are
  reported.
- No migration or contract change may silently reinterpret accepted work or historical
  evidence. Historical records MUST retain their original meaning, or the change MUST
  introduce a new version alongside them.
- Observability MUST make decisions, capability versions, costs, attempts, evidence, human
  handoffs and final outcomes reconstructable after the fact, without logging secrets,
  credentials, raw sensitive data or cross-tenant content.

**Rationale**: Most of what this system promises is already partly built. Incremental,
tested extension compounds that work, while rewrites restart the evidence base that makes
coverage claims defensible.

## Engineering and Operational Constraints

**Architecture and module boundaries**

- The capability registry, compiler, run engine, money paths and provider adapters are
  server-only and MUST NOT be reachable from a client bundle.
- The planner proposes and the compiler decides. Planner output MUST NOT reach execution
  without compiler validation against the registered capability contract, and the contract
  shown to the planner MUST be derived from the same schemas the compiler enforces rather
  than restated in prose that can drift.
- Capability parameters MUST be schema-validated at the boundary. An unknown capability, an
  unknown parameter, or an out-of-bounds value MUST cause refusal or explicit demotion, not
  a best-effort attempt.
- Introducing a capability tier that can write to a customer's system MUST be a deliberate,
  reviewed act. The compiler MUST refuse unrecognized or higher-privilege tiers until it is
  explicitly changed to accept them.

**Authorization and tenancy**

- Authorization MUST be enforced in the server-side data access path. UI affordances,
  hidden fields and client-side checks are not access control.
- Role-scoped projections MUST omit fields a role may not see rather than fetching them and
  filtering later. Client price and worker payout MUST remain independent values that never
  appear in the other role's projection.
- Data classification MUST gate capability reach. A capability whose reach is broader than
  the most restrictive class present in its inputs MUST NOT process them.

**Data handling and retention**

- Uploaded bytes MUST be inspected and their scan evidence recorded before a file can be
  attached, processed or downloaded. Production scanning MUST NOT be bypassable by
  configuration.
- Accepted input bytes MUST be frozen for the run; a later edit to a source file MUST NOT
  retroactively change what a run was accepted to do.
- Worker-facing filenames and client-authored text MUST be generated or operator-mediated so
  that identity-bearing content is not passed through by default.
- Terminal artifacts MUST be purged on the configured schedule, with blob deletion confirmed
  before the database records the purge.

**Idempotency, concurrency and recovery**

- State transitions MUST be compare-and-swap operations written together with their audit
  event in the same transaction.
- Invariants the application claims MUST be backed at the database level (constraints,
  triggers) wherever a bypass would be unrecoverable.
- Long-running work MUST use leases with fencing. Lease expiry MUST be reclaimable by
  another worker without duplicating an external effect.
- Append-only sequences such as the ledger and audit trail MUST be ordered under an explicit
  lock and be tamper-evident.
- Scheduled maintenance MUST be idempotent and safe to run repeatedly or concurrently.

**Economics**

- Money MUST be represented as integer minor units, never floating point.
- Provider spend MUST pass a reserve → settle-or-release hold cycle against a configured
  account ceiling. An unconfigured ceiling MUST refuse spend rather than permit it.
- A step demoted for budget reasons MUST be reported as a budget decision, not as a missing
  capability. Cost controls MUST NOT masquerade as capability gaps in any surface.
- Refunds and payouts MUST be queued as auditable money intents with the required operator
  reference, and reconciled against the payment provider's own record.

**Current stack practice (TypeScript, Next.js, Prisma, PostgreSQL)**

- `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` MUST pass
  before merge.
- Every schema change MUST ship as a versioned migration under `prisma/migrations`.
  `prisma db push` MUST NOT be used against any shared or production database.
- Next.js conventions of the installed version govern. Contributors MUST consult the
  installed version's documentation rather than assuming API shapes from earlier releases.
- Integration tests MUST run against a real PostgreSQL instance, not an in-memory or mocked
  substitute, for anything crossing a persistence or boundary contract.

This subsection binds current practice. It is expected to change as the stack changes and
MAY be amended under Governance without touching the Core Principles, provided the principle
each rule serves is preserved by the replacement.

## Development Workflow and Quality Gates

**Before a feature is selected**

- A written problem statement MUST exist, naming the explicit denominator — the population
  of customers, operations or work items the problem applies to — and the evidence for it
  with source and date.
- Where demand, frequency or size is not measured, it MUST be labelled UNKNOWN. A feature
  MAY still be selected against an UNKNOWN, but the selection MUST say so.

**Before implementation**

- A specification MUST state: the in-scope outcome; explicit exclusions; acceptance
  criteria; the authorization and tenancy model; data classification; failure modes and
  exception states; economics including cost ceiling, price and expected margin;
  verification method; delivery conditions; observability; rollout; and rollback.
- Anything unresolved MUST be marked NEEDS CLARIFICATION and resolved before implementation
  begins, not decided implicitly during it.

**New capabilities**

- Every new capability MUST pass a fail-closed compiler and registry review covering typed
  parameters, version, mode, reach against data classification, replay and idempotency
  safety, cost, failure and exception behaviour, and its postcondition.
- The reviewer MUST confirm that the capability refuses rather than degrades when its
  preconditions are unmet.

**Testing**

- Unit tests for pure logic and contract shapes.
- Integration tests against real persistence for anything crossing a boundary.
- Adversarial tests for authorization, tenancy isolation, injection and untrusted input.
- Concurrency tests for leases, compare-and-swap transitions and money paths.
- Migration tests for forward correctness and for preservation of historical meaning.
- Recovery tests for crash, replay and resume.
- A change to a security boundary, a money path or a run contract MUST NOT merge on unit
  tests alone.

**Evidence labels**

Every claim in a specification, plan, review, report or release note MUST carry one label:

- `CODE` — read directly from the implementation.
- `TEST` — asserted by an automated test that runs in CI.
- `SYNTHETIC` — produced by fixtures, replayed or simulated providers, or generated
  benchmarks.
- `OBSERVED` — measured in production from real customer operations.
- `INFERRED` — reasoned from other facts, not measured.
- `UNKNOWN` — not established.

`SYNTHETIC` MUST NOT be presented as `OBSERVED`. `INFERRED` MUST NOT be presented as `CODE`
or `TEST`. Aggregate claims MUST carry the weakest label among their inputs.

**Before merge and release**

- Review MUST include an explicit constitution compliance check and name any principle the
  change puts at risk.
- Release MUST confirm migration status, the rollback path, observability coverage, and the
  evidence label attached to any readiness or coverage claim.

**Command boundaries**

- Ratifying or amending this constitution MUST NOT automatically produce a feature
  specification, plan or task list. Feature work begins only when a maintainer explicitly
  starts it.

## Governance

- **Supremacy**: This constitution supersedes conflicting project practices, conventions and
  prior documents. Strategy notes, benchmark outputs and audit write-ups are inputs, not
  governance; where they conflict with this constitution, this constitution prevails.
- **Amendment procedure**: An amendment MUST carry a documented rationale, an impact
  analysis covering affected code, specifications, contracts, data and public claims,
  approval by the founder or an authorized maintainer, a semantic version bump, migration
  guidance for affected artifacts, and updated ratification and amendment dates.
- **Versioning policy**: MAJOR for removal or backward-incompatible redefinition of a
  principle or governance rule; MINOR for a new principle or section, or a materially
  expanded obligation; PATCH for clarification, wording or non-semantic refinement.
- **Compliance review**: Every specification, plan, review and release MUST check compliance
  with this constitution and record the result.
- **Exceptions**: A temporary exception MUST be explicit, recorded in the artifact it
  applies to, assigned to a named owner, risk-assessed, and time-bounded with an expiry
  date. An expired exception is a defect. No exception may be granted for the fail-closed
  rules of Principle III or for presenting unverified work as delivered.
- **Complexity**: Any added abstraction, dependency, service or process step MUST be
  justified by measured risk reduction or measured coverage gain. Complexity that cannot be
  justified on those terms MUST be removed rather than documented.
- **Runtime guidance**: Day-to-day contributor practice follows `AGENTS.md` and the
  installed framework documentation. Those documents MUST NOT contradict this constitution;
  where they do, they MUST be corrected.

**Version**: 1.0.0 | **Ratified**: 2026-08-14 | **Last Amended**: 2026-08-14

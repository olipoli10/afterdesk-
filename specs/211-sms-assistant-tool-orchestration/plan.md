# Implementation Plan: ENDVERA SMS assistant and tool orchestration

## Product decision

ENDVERA is one assistant reached through the app or a normal SMS conversation.
The model is a planner and language engine, never the source of truth and never
the authority to perform an external action. The backend authenticates the
sender, chooses an admissible lane, executes only registered tools, validates
their evidence, records the result and returns a short answer by SMS.

The first useful release is not an unlimited phone controller. It is the
smallest system that proves the central promise:

1. a verified owner can text the ENDVERA number naturally;
2. a greeting or general question receives a natural answer;
3. a current public-information question receives a cited answer;
4. a property question follows an address -> lot -> assessment -> company
   evidence chain and states exactly what remains unverified;
5. a project/calendar/communication request is routed to the existing
   deterministic action gateway and never executed merely because a model
   proposed it.

## Current facts to preserve

- Twilio inbound and automatic owner replies are already observed working.
- The existing `personal-intent` OpenRouter candidate only extracts a closed
  set of action proposals. Its prompt deliberately refuses research, phone
  control and third-party recipients.
- The production personal-model runtime switches and trusted runtime
  configuration are not currently present.
- The existing gateway, budget ledger, encrypted credential binding, approval,
  replay, uncertainty and audit controls must be extended, not bypassed.
- The repository already contains canonical, research, document, reasoning and
  human-handoff lanes. Their old disabled labels are historical evidence and
  must not be rewritten.
- Existing uncommitted work in `tsconfig.json` and `specs/210-*` is user-owned
  and must remain untouched.

## Architecture

```text
SMS/app request
  -> signed ingress + verified owner/workspace
  -> durable conversation receipt + idempotency key
  -> deterministic lane classifier
       -> CANONICAL_QUERY: ENDVERA/PostgreSQL read tools
       -> GENERAL_ANSWER: guarded OpenRouter conversation candidate
       -> PUBLIC_RESEARCH: guarded candidate + cited web-search tool
       -> PROPERTY_RESEARCH: registered property-tool workflow
       -> EXTERNAL_ACTION: existing preview/approval/executor gateway
       -> PAID_OR_SENSITIVE: exact approval or refusal
       -> HUMAN: bounded handoff
  -> evidence validator
  -> concise SMS formatter + durable detailed report
  -> Twilio outbox with existing at-most-once/uncertain handling
```

OpenRouter `openrouter/auto` may select the candidate model. ENDVERA must record
the requested router, served model, provider request ID, latency, usage and
settlement state. A served-model change is valid for answers only when the
route's privacy/tool/output policies still hold; it never changes action
authority. Current-information requests use the recommended
`openrouter:web_search` server tool with explicit result and cost caps. ENDVERA
functions remain user-defined tools executed by ENDVERA, not by OpenRouter.

Primary current references:

- https://openrouter.ai/docs/guides/routing/routers/auto-router
- https://openrouter.ai/docs/guides/features/server-tools/web-search
- https://openrouter.ai/docs/guides/features/tool-calling

## Lane contract

### 1. GENERAL_ANSWER

- Input: verified sender text and a bounded, consented conversation window.
- External data: none unless explicitly reclassified.
- Output: short answer, uncertainty label, served-model receipt.
- No tools capable of writing.

### 2. PUBLIC_RESEARCH

- Input: a public-information question.
- Tool: capped `openrouter:web_search`, initially at most five total results.
- Output: answer plus normalized URL citations and verification time.
- Refuse or downgrade any unsupported claim; never treat snippets as legal proof.

### 3. PROPERTY_RESEARCH

Initial registered tools, in order:

1. `resolve_address`
2. `find_cadastral_lots`
3. `get_assessment_record`
4. `search_web_with_sources`
5. `lookup_quebec_business`
6. `create_property_report`

Later, after source rights, costs and contracts are verified:

7. `lookup_land_registry`
8. `get_zoning_for_lot`
9. `search_municipal_projects`
10. `find_business_contacts`
11. `calculate_development_potential`

Every tool returns structured claims with source, observed-at time, source
version/document, evidence level and confidence. The validator keeps separate:

- normalized address;
- cadastral lot;
- owner shown on an assessment roll;
- registered legal owner;
- related company/group inference;
- public business contact.

No owner can be labelled `REGISTERED_OWNER_CONFIRMED` without a permitted,
current land-record source. Public web results alone remain
`PUBLIC_SOURCE_UNCONFIRMED`. Personal phone/email guessing is forbidden.

### 4. CANONICAL_QUERY

Read-only queries use ENDVERA's own workspace facts, calendar grants, project
Brain snapshots and selected documents. The answer cites the internal source
record and does not send the whole workspace to a model when deterministic
retrieval is sufficient.

### 5. EXTERNAL_ACTION

The model may propose typed tool calls for calendar, project, email, SMS and
voice. ENDVERA independently validates identity, recipient, permissions,
version, budget and required fields. Consequential writes are previewed and
approved through the existing gateway unless an explicitly versioned low-risk
standing grant exists. At-most-once execution, postcondition verification and
`OUTCOME_UNKNOWN` handling remain mandatory.

## Data and evidence model

Add durable records for:

- conversation thread and bounded context window;
- assistant request and selected lane;
- model attempt and requested/served model;
- tool proposal, tool execution and exact input/output hashes;
- claim, citation, evidence level and contradiction;
- research job and progress for long-running work;
- short SMS answer linked to a detailed ENDVERA report;
- cost reservation, observed usage and settlement state.

Web/PDF content is untrusted data. It cannot authorize another tool, change the
system prompt, reveal credentials or create an external write.

## Delivery phases

### Phase A - contracts and deterministic routing

- Freeze the seven-lane request contract and precedence rules.
- Add greetings/general questions without routing them to human support.
- Separate public research, property research and sensitive-person research.
- Add regression cases for Québec French, dictation, multiple intents and
  prompt injection.

Gate: every corpus request maps to exactly one admissible lane or one explicit
clarification; zero provider calls.

### Phase B - guarded conversational candidate

- Extend the existing model gateway with a new answer-only operation instead of
  weakening `personal_intent_candidate_v1`.
- Add `openrouter/auto` request/response contracts, served-model receipts,
  output limits, cancellation, one attempt and no action tools.
- Reuse owner consent, encrypted credential binding and atomic budget holds.

Gate: injected transports pass; real transport remains off.

### Phase C - cited public Web research

- Add the capped `openrouter:web_search` server tool contract.
- Normalize citations and reject uncited factual claims that require current
  evidence.
- Persist a detailed report and return a short SMS summary.

Gate: synthetic/injected cited research passes adversarial validation; no claim
of live accuracy.

### Phase D - property quick-research toolchain

- Implement adapters behind explicit source contracts, starting with one
  supported municipality/borough rather than pretending Québec-wide coverage.
- Add PostGIS-ready parcel/zone schemas only when licensed source geometry is
  selected.
- Implement assessment/company evidence and contradiction handling.
- Keep paid land-registry lookup separately approved and cost-capped.

Gate: one synthetic address with multiple lots, stale assessment ownership,
  conflicting company names and missing legal deed is handled truthfully.

### Phase E - canonical ENDVERA and action-tool bridge

- Reuse existing project/calendar/document reads.
- Translate only validated model proposals into existing prepared actions.
- Add email drafts and later approved sends as a new connector capability; no
  mailbox-wide access by default.
- Preserve exact recipient previews for SMS/call/email and batch actions.

Gate: model proposals cannot directly execute, escalate permissions, change
recipients or replay an approval.

### Phase F - queue, SMS UX and observability

- Answer fast requests inline within the worker deadline.
- Move property/territory work into a durable queue with progress SMS and a
  detailed report link.
- Add provider/tool/cost/latency/audit dashboards and stop switches.

Gate: duplicate webhooks create one canonical request; timeout/unknown outcomes
are retained without automatic replay or fabricated zero cost.

### Phase G - bounded founder live activation

- Refresh current rates, FX, fees, privacy evidence and total exposure.
- Confirm current owner AI consent and encrypted OpenRouter credential.
- Publish one reviewed answer route, then enable engine/answer transport flags.
- Observe in order: `Allo`, one general question, one public research question,
  one synthetic property question and one prepared action.
- Keep real paid property records, third-party communications and customer data
  out of this first run.

Gate: each real provider call has an admitted request, cost hold, served-model
receipt and safe SMS result. A failure remains REWORK; it is not converted to
PASS after correction in the same observation.

## Success metrics

- greetings/general answers routed correctly: 100% of acceptance corpus;
- current factual answers carrying usable citations: 100%;
- unsupported owner/legal claims labelled unconfirmed: 100%;
- consequential external writes executed without valid authority: 0;
- duplicate external effects: 0;
- cross-workspace or secret leakage: 0;
- uncapped provider/tool calls: 0;
- median simple-answer latency and p95 researched-answer latency measured, not
  assumed;
- cost per successful answer and cost per verified property report measured;
- manual context repetitions and human corrections measured in the founder run.

## Stop conditions

Stop only for a material external authorization, paid/source-rights decision,
secret/consent requirement, unreconcilable user-owned work or when every
authorized local phase is complete. A completed local phase is not project
completion. Continue independent local work when one connector is blocked.

## Explicit non-goals for this slice

- no claim that ENDVERA can control every phone function;
- no blanket contacts, SMS or call-log surveillance;
- no automatic third-party message/call from an arbitrary model output;
- no circumvention of CAPTCHA, paywall, source licence or land-registry terms;
- no legal-owner claim based only on a model or general web search;
- no store publication, customer rollout or production-readiness claim from
  local tests.

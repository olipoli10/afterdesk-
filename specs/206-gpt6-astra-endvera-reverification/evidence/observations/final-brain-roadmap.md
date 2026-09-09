# Roadmap Progress Model

Status date: 2026-08-31

Status: planning estimate, not product evidence and not a change to the
canonical order in `ROADMAP.md`.

## Direct answer

The former single **22%** headline hid real engineering progress behind a
strict phase-exit rule. ADR-047 therefore replaces that single headline with
four non-interchangeable indicators:

| Indicator | Current value | Meaning |
|---|---:|---|
| Strict canonical phase exits | **22%** | accepted phase-exit points only; unchanged |
| Local AI engine build readiness | **47%** | implemented, integrated and independently reviewed local engineering, including inactive candidates |
| Controlled public READ / C2 activation preparation | **100%** | 18 of 18 frozen C2 preparation gates complete; this does not authorize Grow or transport |
| Verified-E2E observed coverage | **0%** | no current-HEAD real quote-to-delivery corpus run |

The direct product answer is therefore: **the local AI engine is roughly 47%
built, the first controlled public READ/C2 preparation path is 100% complete, but
real observed customer-work coverage is still 0%**. Confidence is moderate for
the two planning indicators and high for the gate count and observed zero.

No number above means that C2 is active, Grow is adopted, WRITE is authorized
or a customer outcome has been proved.

## 2026-08-31 product overlay — Construction invoice readiness

Construction Operating Assistant R0 adds a locally integrated economic
workflow from completed change-order work to an evidence-backed invoice-ready
dossier. It has deterministic policy, additive PostgreSQL state, restart and
replay proof, role isolation and a prepared-unsent next action.

This is meaningful product engineering but does not change an ADR-047 rubric:
it is synthetic/local, has no founder usability result, no customer/provider
run and no current-HEAD quote-to-delivery observation. Therefore strict exits
remain 22%, local build remains 46.75%/47%, C2 preparation remains 18/18 and
Verified-E2E remains 0%. The separate real provider/customer readiness label
remains NO-GO.

## Why simple task counting is misleading

T086, 1,200 tests or 50 researched tools do not mean 86%, 1,200 units or 50%
of the product is finished. Early tasks establish one safe runtime seam. Later
phases must prove external access, authorization, verification, recovery,
economics, recurrence and a representative denominator. Those gates carry more
commercial and operational risk than many early implementation tickets.

The model therefore assigns 100 delivery points by remaining risk and required
proof, not by commit count or phase count.

## Strict canonical phase-exit score

| Phase | Weight | Earned | Current evidence |
|---|---:|---:|---|
| 0A Project Brain | 3 | 3 | complete locally; validation/checkpoint protocol active |
| 1 HumanWorkUnit + Safe Resume | 10 | 10 | runtime RC through T078 at `6b5a767`; T079/T080 release reviews remain NO-GO LIVE |
| 2 Model Gateway + Engineering Factory | 12 | 7.5 | Model Gateway local RC through T086; EF R3/I3-I5 and I6 source admission exist, but independently administered physical I6 controls remain absent and execution is NO-GO |
| 3 Coverage Lab + parallel spikes | 10 | 1.5 | pre-engineering packet, stale corpus inventory and benchmark compatibility matrix only; no Phase-3 execution |
| 4 Capability Contract v2 | 8 | 0 | exact 17-to-18 registry is applied inactive and selected only in local control plane; no active phase exit |
| 5 Access abstraction + agent identity + authorization | 9 | 0 | Access Authority and C2 point-of-use composition proven locally; not active |
| 6 READ / PREPARE | 10 | 0 | one safe public READ chain proven; request path and C2 disabled |
| 7 Verification Engine | 9 | 0 | safe capture/hash and independent verification proven locally; no active reusable phase exit |
| 8 Safe WRITE | 11 | 0 | planned; external mutation authority remains intentionally absent |
| 9 Operations / recurrence | 8 | 0 | planned; a first-run standard is not recurring execution |
| 10 Coverage Factory / Operations Gym | 4 | 0 | planned |
| 11 Gap grinding | 4 | 0 | planned |
| 12 Measured 80–85% coverage | 2 | 0 | denominator, observed runs and economics absent |
| **Total** | **100** | **22** | **22% strict phase exits / 78% not exited** |

Half-points are planning estimates. A phase earns full points only when its
canonical exit evidence exists. Side tracks such as public-site polish,
ENDVERA/EARN surface separation and branding are valuable and may be release
critical, but are not used to inflate core engine coverage progress.

## Local AI engine build readiness

This indicator uses the same 100 phase weights, but gives bounded engineering
credit before active phase exit. The maturity multipliers are frozen:

- `0.00`: no accepted implementation evidence;
- `0.25`: accepted design/static contract only;
- `0.50`: isolated implementation with targeted and complete local gates;
- `0.75`: locally integrated and independently reviewed, but inactive;
- `1.00`: accepted active local phase exit.

The already-earned strict Phase 0A-3 points remain unchanged. Later phases use
the frozen maturity multiplier and may never receive credit from commit count,
test count or prose alone.

| Phase | Weight | Maturity | Build credit | Reproducible basis |
|---|---:|---:|---:|---|
| 0A Project Brain | 3 | strict exit | 3.00 | canonical Brain complete locally |
| 1 HumanWorkUnit + Safe Resume | 10 | strict exit | 10.00 | local runtime RC and rollback evidence |
| 2 Model Gateway + Engineering Factory | 12 | strict partial | 7.50 | Model Gateway RC; physical I6 still absent |
| 3 Coverage Lab + parallel spikes | 10 | strict partial | 1.50 | admitted contracts, no executed lab |
| 4 Capability Contract v2 | 8 | 0.75 | 6.00 | exact 17-to-18 registry applied inactive, selected only in local control plane, independently reviewed |
| 5 Access abstraction + identity + authorization | 9 | 0.75 | 6.75 | point-of-use authority composed and adversarially reviewed in C2; route inactive |
| 6 READ / PREPARE | 10 | 0.75 | 7.50 | one safe public READ transport and full local route chain proved; request path disabled |
| 7 Verification Engine | 9 | 0.50 | 4.50 | safe capture/hash and independent verification proved in the isolated spine, not active as a reusable phase exit |
| 8-12 WRITE through measured coverage | 29 | 0.00 | 0.00 | no accepted implementation or observed exit |
| **Total** | **100** |  | **46.75** | **47% rounded / 53% remaining** |

The 47% figure is a planning estimate, not an activation or coverage claim.

## Controlled public READ / C2 activation preparation

This is a milestone count for the one exact capability
`public.website.scan.read@1`, not a percentage of all ENDVERA capabilities.
All eighteen immutable C2 preparation gates are complete:

1. C1 R4 safe transport and deterministic safe hash;
2. C2 local route composition;
3. C3 closed capability proposal;
4. C3 R4 independent proposal review;
5. C3 R5 formal adoption decision;
6. C4 versioned 17-to-18 changeset;
7. C4 R4 independent changeset review;
8. C4 R5 formal application decision;
9. C5 applied-inactive registry;
10. C5 R4 independent applied-registry review;
11. C5 R5 formal local-selection decision;
12. C6 local control-plane selection;
13. C6 R2 independent local-selection review;
14. C6 R3 formal C2 activation decision packet.
15. exact founder authority for bounded local C2 activation;
16. explicitly named C2 and route owners;
17. C7 versioned C2 activation implementation with route still fail-closed;
18. fresh independent review of the C7 activation.

`18 / 18 = 100%`. A future Grow request is deliberately
excluded: it is a separate external-transport authority and evidence gate.

## Three different finish lines

### 1. First credible paid pilot

Definition: one narrow, truthful operation reaches quote, execution, bounded
human recovery, independent verification and client-visible delivery; cost and
human minutes are recorded.

Planning range after the current authority decision: **6–12 focused weeks**.
This assumes one narrow operation, no generalized WRITE, a real customer who can
provide lawful inputs/access, and no new security contradiction. It does not
mean broad automation.

### 2. Approximately 80% of the canonical build roadmap

Definition: about 80 gate-weighted points, likely through reliable Operations /
Recurrence with Coverage Factory operating, while some long-tail gap grinding
and final statistical proof remain.

Planning range:

- **single effective engineering lane:** about **12–20 months**;
- **three genuinely isolated lanes with one controller and disciplined merge
  gates:** about **7–12 months**;
- faster than seven months is possible only if large planned capabilities are
  bought/adapted successfully and real-customer evidence arrives without delay.

Parallel agents do not divide calendar time linearly. Security authority,
database contracts, external access and final integration remain serial gates.

### 3. Measured 80–85% coverage of in-scope repetitive SME work

Definition: the Phase-12 claim in `ROADMAP.md`, with a real denominator,
published exclusions, observed verification/recovery, failure taxonomy, cost,
human minutes and confidence intervals.

Planning range: **12–24+ months**, with low-to-moderate confidence. This depends
more on repeated real customer operations and long-tail access than on coding
speed. It cannot be compressed into a two-day agent run.

## Focused-hour model

These are order-of-magnitude planning ranges, not tracked invoices:

| Remaining program | Focused hours |
|---|---:|
| close Phase 2 authority/design and reach a proved local gate | 120–300 |
| Coverage Lab + highest-value isolated spikes | 200–500 |
| activate the proved Capability Contract v2 + access/identity path | 80–200 |
| complete active READ/PREPARE + reusable Verification Engine | 120–350 |
| Safe WRITE + recovery/compensation | 300–700 |
| Operations/recurrence + Coverage Factory | 250–600 |
| real-pilot evidence, gap grinding and final measurement | 450–1,200 |
| **Remaining total, rough** | **1,520–3,850** |

The upper bound is plausible because authenticated long-tail systems and
customer-specific rules stack on the same operations. The lower bound assumes
successful reuse of existing components, narrow scope and strong vendor/tool
leverage. Neither bound includes waiting time for customer recruitment,
third-party approval or legal/commercial negotiation.

## What two autonomous days can realistically accomplish

A disciplined two-day local run can close one bounded specification/review
package, several isolated implementation tickets, a full local validation
battery, or a substantial research/readiness packet. It cannot safely close
multiple serial authority gates, collect real customer evidence or manufacture
observed coverage.

The best use of a long autonomous run is:

1. one frozen lane and worktree;
2. one authority level;
3. several tasks that share the same contracts and test environment;
4. explicit stop conditions for secrets, production, shared databases,
   destructive changes and conflicting worktree ownership;
5. checkpoints every material gate, without asking the founder for repeated
   confirmation inside the authorized boundary.

HumanWorkUnit T078, the T079 read-only decision and the T080 documentation-only
release checkpoint improve freshness and release discipline; they do not add a
new gate-weighted phase exit beyond the 10 points already earned for Phase 1.
The strict phase-exit total therefore remains 22%. The separate local-build
indicator is 47% because it credits only implementation/integration maturity
under the frozen rubric above, never task numbering.

## Current critical path

```text
product AI path:
founder selects one commercially meaningful golden workflow
-> map existing AI Core/intake/planner/authority/HWU/verification components
-> close only blocking vertical gaps -> three controlled internal E2E runs
-> supervised design partner -> first narrow observed customer operation

native-agent path:
Engineering Factory independent control review -> physical I6 proof
-> separately authorized I7 review and I8 decision -> close Phase 2
```

These paths may advance in parallel because ordinary Model Gateway HTTPS
inference is not native candidate execution. Neither path can claim the other
path's authority. Coverage Lab planning and isolated local spikes may continue
before Phase 2 closes, but observed coverage, provider-backed benchmarks and
external execution remain separately gated. Current dashboard: 22% strict
phase exits; 47% local build readiness; 100% C2 activation preparation; 0%
Verified-E2E observed coverage.

The golden-workflow overlay does not award progress by declaration. Internal
runs are product-readiness evidence; they move Verified-E2E only if they satisfy
the retained current-HEAD observed-run denominator. A synthetic or rehearsed
run must remain labeled synthetic or rehearsed.

## Estimate update rule

Recalculate an indicator only when its own evidence changes:

- strict phase exits: canonical phase gate only;
- local build readiness: accepted implementation/integration maturity change;
- C2 activation preparation: one of the frozen 18 gates closes or reopens;
- Verified-E2E: a retained current-HEAD observed run enters the denominator.

Track focused hours, first-pass acceptance, rework, wait time and failed gates.
Never move an indicator merely because tasks, tests or commits increased.

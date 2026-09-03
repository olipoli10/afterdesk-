# Implementation Plan: Provider Replay Brand Parity R37E

## Approach

1. Pin the current Endvera classifier and planner phrases in the stage detector.
2. Retain legacy AfterDesk phrases for historical golden fixtures.
3. Add direct stage-routing regression assertions.
4. Re-run the exact PostgreSQL workflow that exposed the defect.
5. Close only after the synthetic/no-network boundary and repository checks pass.

## Safety

The change is test-only. The harness remains fail-closed for unknown prompts and
cannot enter shipped product code. R37 observed provider execution remains
blocked on separate exact external authority and credentials.

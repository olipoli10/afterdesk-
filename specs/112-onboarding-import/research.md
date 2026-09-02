# R32 Research and Design Decisions

## Decision 1 — Canonical state, not an onboarding shadow database

Workspace, membership, project and contact records already exist and are used
by every operating workflow. R32 adds only resumable progress, immutable import
preview and exact command evidence. Readiness is derived from canonical counts.

## Decision 2 — CSV v1 instead of generic files or provider sync

CSV is deterministic, inspectable and testable without credentials. A closed
two-kind registry proves the central value: safely transform existing lists
into canonical state. XLSX, OCR and provider adapters add dependencies and
failure modes without strengthening this release's core proof.

## Decision 3 — Preview and explicit decisions before commit

Construction contact lists are messy. Silent deduplication would make the
assistant look fast while corrupting operational identity. R32 therefore
separates immutable interpretation from explicit decision and atomic commit.

## Decision 4 — First value before optional connector setup

The assistant can manage project context locally before SMS, calendar, voice or
accounting authority exists. Requiring every connector during onboarding would
increase abandonment and falsely couple product value to provider activation.

## Decision 5 — No raw file retention

R32 needs normalized proposals and a source fingerprint to prove review/commit
identity. It does not need to keep raw CSV bytes. This minimizes retention and
keeps import evidence compatible with the R30 privacy control plane.

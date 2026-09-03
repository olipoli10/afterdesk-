# Feature Specification: Provider Delivery Contracts R37D

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for autonomous local implementation
**Evidence label**: `INFERRED`; no provider response has been observed.

## Problem Statement

R37C can safely coordinate one sealed attempt, but its injected adapter returns
an intentionally generic body. Before any real provider can be authorized,
ENDVERA needs strict provider-specific response contracts that normalize only
supported OpenRouter controller output and Perplexity research evidence into a
single canonical result without trusting missing citations, invented costs or
an unbound model identity.

## User Scenarios & Testing

### User Story 1 — Strict OpenRouter controller normalization (P1)

An adapter fixture contains the exact requested model, one supported assistant
message, token usage and provider metadata. ENDVERA validates and normalizes it
without interpreting arbitrary tool calls or hidden fallback output.

### User Story 2 — Citation-bound Perplexity research normalization (P1)

A search fixture contains public-source results. ENDVERA validates every URL,
title and snippet, removes exact duplicates deterministically and refuses an
answer whose claims are not backed by at least one normalized source.

### User Story 3 — Fail-closed provider drift (P1)

Wrong model identity, fallback provider drift, malformed usage, missing source
evidence, oversized output and altered request binding are refused before any
canonical evidence can be returned.

## Functional Requirements

- **FR-001**: Every normalization input binds provider, exact model or search contract, sealed-attempt fingerprint and prepared-request fingerprint.
- **FR-002**: OpenRouter output accepts one text result only and refuses tool calls, fallback model drift and invalid token totals.
- **FR-003**: Perplexity output requires normalized public HTTP(S) sources and deterministic deduplication.
- **FR-004**: Canonical output separates answer text, sources, usage, provider metadata and fingerprints.
- **FR-005**: Output size, latency and cost remain within the sealed case ceilings.
- **FR-006**: Canonical evidence remains labeled `SYNTHETIC` in this release.
- **FR-007**: No credential, provider client, network path, dispatch route or external write is added.
- **FR-008**: Unknown top-level or security-sensitive fields are refused rather than silently trusted.

## Success Criteria

- **SC-001**: Valid OpenRouter and Perplexity fixtures normalize deterministically.
- **SC-002**: All binding, fallback, citation, usage, size, cost and latency mutations fail by exact guard.
- **SC-003**: Identical inputs produce identical canonical fingerprints.
- **SC-004**: Provider calls, external transport, credential access and real spend remain zero.

## Explicit Exclusions

No provider, credential, environment-secret read, fetch, OAuth, customer data,
external transport, external write, real spend, push, Preview, Production or
deployment. Observed provider behavior and economics remain unknown.

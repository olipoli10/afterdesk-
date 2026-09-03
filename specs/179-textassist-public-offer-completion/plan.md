# Implementation Plan: TextAssist Public Offer Completion

## Summary

Extend the already additive TextAssist surface without replacing or deleting the accepted homepage. Add durable root navigation, a complete bilingual operating-loop narrative, an honest pricing-in-preparation section, a small FAQ and a bounded human-support explanation. No backend, schema, dependency or external capability changes.

## Technical Context

- TypeScript, React 19.2 and Next.js 16.2.12 App Router
- Server-rendered public pages and existing typed copy module
- Vitest source-contract regression tests
- No new dependency, lockfile, schema, migration, client data or external effect

## Constitution Check

- Owned outcomes: PASS — the offer describes maintained operational state and next decisions.
- Truthful capability: PASS — every unobserved external capability remains explicit.
- Authorization and privacy: PASS — no action, credential or data access is added.
- Incremental evolution: PASS — the accepted site remains intact and gains additive paths only.
- Evidence: PASS — tests verify the source contract; no market or provider claim is inferred.

## Structure

- `src/app/page.tsx`: durable additive navigation links
- `src/app/textassist/page.tsx`: complete public offer sections
- `src/lib/textassist/public-copy.ts`: typed French/English copy
- `test/textassist-public-offer-completion.test.ts`: regression guard
- `release/endvera-construction-v1/textassist-public-offer-readiness.json`: honest local readiness


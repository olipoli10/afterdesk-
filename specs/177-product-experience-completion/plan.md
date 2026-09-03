# Implementation Plan: ENDVERA Construction Product Experience Completion

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/177-product-experience-completion/spec.md`

## Summary

Preserve the existing ENDVERA public site while adding a prominent TextAssist banner and a dedicated bilingual `/textassist` product surface. Consolidate the existing Expo application from 24 visible peer tabs into five primary destinations with a grouped More screen, retaining all deep links and existing role-safe server contracts. Add a public account-deletion route and regression gates without activating providers, changing persistence, adding dependencies, or modifying lockfiles.

## Technical Context

**Language/Version**: TypeScript 5.x/6.x, React 19.2, Next.js 16.2.12, React Native 0.86.3

**Primary Dependencies**: Existing Next.js App Router, Expo 57, Expo Router 57, Tailwind 4, Zod 4; no new dependencies

**Storage**: Existing PostgreSQL/Prisma state is reused; no schema or migration change

**Testing**: Vitest 4.1.10, TypeScript type checks, ESLint, Next.js Webpack production build, Expo local export

**Target Platform**: Public responsive Web, iOS and Android through the existing Expo project

**Project Type**: Existing combined Web/API and cross-platform mobile application

**Performance Goals**: The banner adds no client-side request; `/textassist` renders without external calls; five-tab mobile navigation remains responsive on common phone widths

**Constraints**: Existing site retained; no provider, credentials, customer data, external transport, deployment, signing, submission, publication, dependency, lockfile, or database change

**Scale/Scope**: One new public route, one homepage banner, one public deletion route, one mobile grouped navigation surface, targeted regression tests, and readiness records

## Constitution Check

*GATE: PASS before research and PASS after design.*

- **I Owned Outcomes**: PASS — TextAssist describes an owned operating loop, not a disconnected chatbot.
- **II Truthful Capability**: PASS — provider-backed actions remain explicitly unavailable and unobserved.
- **III Authorization/Privacy/Finance**: PASS — no protected read, money path, credential, or external write is added.
- **IV Durable Hybrid Execution**: PASS — existing persistent and human-escalation contracts are reused.
- **V Verification/Evidence/Delivery**: PASS — local UI readiness remains separate from signing, publication, and provider evidence.
- **VI Evidence/Economics**: PASS — this corrects a demonstrated experience gap and makes no market-demand or margin claim.
- **VII Incremental Evolution**: PASS — existing site and mobile capability modules are preserved; only discoverability and navigation change.
- **Required gates**: targeted tests, full relevant tests, lint, typecheck, mobile export, Web build, provider-boundary validation, and `git diff --check`.

## Project Structure

### Documentation (this feature)

```text
specs/177-product-experience-completion/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── product-experience.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/app/page.tsx                         # existing homepage; add TextAssist banner only
src/app/textassist/page.tsx              # dedicated public product surface
src/app/account-deletion/page.tsx        # public deletion information/request path
src/app/sitemap.ts                       # public discovery
src/components/textassist-banner.tsx     # isolated additive homepage entry
src/lib/textassist/public-copy.ts        # bilingual closed-world narrative

apps/mobile/src/app/(app)/_layout.tsx    # five primary tabs; hidden deep-link routes
apps/mobile/src/app/(app)/more.tsx       # grouped secondary operations
apps/mobile/src/app/(app)/index.tsx      # assistant-first daily cockpit polish

test/product-experience-completion.test.ts
apps/mobile/test/product-experience-navigation.test.ts
release/endvera-construction-v1/product-experience-readiness.json
```

**Structure Decision**: Extend existing Next.js and Expo structures. The Web banner is an isolated server-rendered component; the dedicated page consumes typed bilingual copy. Mobile retains every screen as an Expo Router route but hides secondary routes from the tab bar and exposes them through More.

## Complexity Tracking

No constitution violation or new abstraction is required. The new copy module is justified because the same closed-world narrative is used by tests and the dedicated public route.


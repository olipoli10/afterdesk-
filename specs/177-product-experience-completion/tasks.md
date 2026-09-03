# Tasks: ENDVERA Construction Product Experience Completion

**Input**: Design documents from `/specs/177-product-experience-completion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/product-experience.md

**Tests**: Contract and regression tests are required by FR-011 and are written before implementation.

## Phase 1: Setup

- [x] T001 Record the verified Web/mobile baseline and immutable safety boundary in specs/177-product-experience-completion/evidence/baseline.md
- [x] T002 [P] Add RED Web experience assertions in test/product-experience-completion.test.ts
- [x] T003 [P] Add RED mobile navigation assertions in apps/mobile/test/product-experience-navigation.test.ts

## Phase 2: Foundational

- [x] T004 Define typed bilingual TextAssist public copy in src/lib/textassist/public-copy.ts
- [x] T005 Create the additive homepage banner in src/components/textassist-banner.tsx

## Phase 3: User Story 1 - Discover TextAssist (Priority: P1)

**Goal**: Preserve the current site and make the new construction assistant discoverable and understandable.

**Independent Test**: Root source retains the current assembly experience, renders one TextAssist banner, and `/textassist` exposes the complete bilingual narrative.

- [x] T006 [US1] Insert the isolated banner without replacing the existing experience in src/app/page.tsx
- [x] T007 [US1] Implement the bilingual dedicated product surface in src/app/textassist/page.tsx
- [x] T008 [US1] Add TextAssist to the public index in src/app/sitemap.ts
- [x] T009 [US1] Run the targeted Web regression test in test/product-experience-completion.test.ts

## Phase 4: User Story 2 - Operate through five mobile destinations (Priority: P1)

**Goal**: Replace the 24-tab internal-console navigation with an assistant-first primary structure while retaining every screen.

**Independent Test**: Exactly five tabs are visible and every secondary route appears in the grouped More directory or remains available by deep link.

- [x] T010 [US2] Configure five visible tabs and hidden secondary routes in apps/mobile/src/app/(app)/_layout.tsx
- [x] T011 [US2] Implement the grouped secondary operations directory in apps/mobile/src/app/(app)/more.tsx
- [x] T012 [US2] Improve the Today surface primary assistant path in apps/mobile/src/app/(app)/index.tsx
- [x] T013 [US2] Run the targeted mobile navigation test in apps/mobile/test/product-experience-navigation.test.ts

## Phase 5: User Story 3 - Coherent trust and release identity (Priority: P2)

**Goal**: Provide public deletion guidance and an honest local readiness record.

**Independent Test**: The public deletion route exists, is indexed, performs no mutation, and readiness retains every external boundary as false.

- [x] T014 [US3] Implement public account-deletion guidance in src/app/account-deletion/page.tsx
- [x] T015 [US3] Add account deletion to public discovery in src/app/sitemap.ts
- [x] T016 [US3] Record truthful local product experience status in release/endvera-construction-v1/product-experience-readiness.json
- [x] T017 [US3] Run targeted public trust and readiness assertions in test/product-experience-completion.test.ts

## Phase 6: Validation and closeout

- [x] T018 Run root and mobile type checks, lint, targeted/full relevant tests, provider-boundary validation, Expo local export, Next.js Webpack build, and git diff --check
- [x] T019 Re-run Spec Kit analysis and record constitution compliance in specs/177-product-experience-completion/analyze.md
- [x] T020 Mark completed tasks, record exact evidence in specs/177-product-experience-completion/evidence/closeout.md, and create a coherent local commit

## Dependencies & Execution Order

- T001-T003 establish the baseline and RED.
- T004-T005 block T006-T009.
- T010-T013 are independent of Web implementation after RED.
- T014-T017 depend on the public page conventions proven by T007.
- T018-T020 depend on all user stories.

## Parallel Opportunities

- T002 and T003 touch independent test suites.
- Web story T006-T009 and mobile story T010-T013 touch separate applications after shared planning.

## Implementation Strategy

Implement the additive Web entry and five-tab mobile shell first because they directly correct the two demonstrated user-facing gaps. Preserve all old routes, data contracts, and provider boundaries. Complete trust and readiness records only after the experiences pass targeted tests.

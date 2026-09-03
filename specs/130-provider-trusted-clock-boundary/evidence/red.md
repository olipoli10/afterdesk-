# R37H RED evidence

Command: `npx vitest run test/construction-operating-assistant-r37h-provider-trusted-clock.test.ts`

Result before implementation: 1 file failed; 6 of 6 tests failed.

Confirmed defect: all five R37B public command schemas accepted caller-controlled `now`. The R37C public execution schema also recognized `now`, so its failure was caused by the deliberately incomplete sealed payload rather than an unknown-key refusal.

No database, provider, network or external write was used.

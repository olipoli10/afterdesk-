# ENDVERA portal voice — browser and localization certification follow-up

Status: **COMPLETE LOCAL ONLY for the installed browsers and mechanical layout checks; NO-GO for full browser/localization certification or rollout.**

This packet was generated from `codex/endvera-portal-v1@e914887` on 2026-08-20. It replaces the stale desktop and pinch-zoom artifacts identified in the earlier packet without changing the product voice boundary.

## Exact local coverage

- Browsers executed: Chrome `151.0.7922.138` and Edge `151.0.4129.93`.
- Languages rendered: English, French, Spanish and Tagalog.
- Interactive disclosure: 16 JSON reports and 16 PNG captures covering both browsers, all four languages, 390 by 844 at 100%, and 1440 by 1000 at true 200% reflow.
- Canonical-disabled visual audit: 5 JSON reports, 20 language/viewport observations and 20 PNG captures covering 360 by 800, 390 by 844, reduced motion, 1440 by 1000, and true 200% reflow.
- Interactive results: zero horizontal overflow, zero visible target below 44 by 44 CSS pixels, and zero visible voice text below 12 CSS pixels.
- Canonical-disabled results: 20/20 HTTP 200, zero horizontal overflow, zero small-target report, zero small-text report and zero framework error overlay.
- At 200%, the 1440 by 1000 physical capture uses a 720 by 500 CSS viewport and device scale factor 2. The measured document width is 705 CSS pixels after the browser scrollbar. This is reflow, not pinch zoom.

## Browser and language matrix

| Surface | Chrome | Edge | Firefox | Safari |
| --- | --- | --- | --- | --- |
| EN/FR/ES/TL disclosure at 100% | PASS | PASS | NOT RUN | NOT RUN |
| EN/FR/ES/TL disclosure at true 200% reflow | PASS | PASS | NOT RUN | NOT RUN |
| 44 by 44 target measurement | PASS | PASS | UNKNOWN | UNKNOWN |
| Horizontal reflow | PASS | PASS | UNKNOWN | UNKNOWN |

Firefox was not installed on the authorized Windows host. Safari was not available on that host. No substitute engine or fabricated result is recorded.

English, French, Spanish and Tagalog all passed mechanical rendering checks. **Tagalog language quality was not certified by a native reviewer.** The Tagalog result proves only that the current strings render without the measured layout failures.

## Evidence correction

- The earlier `final-disabled/audit-1440x1000.json` declared a 1440-pixel outer capture while its document metrics remained 390 pixels wide. It is retained as historical evidence but is not valid desktop certification.
- The earlier `interactions/disclosure-granted-fr-390x844-200pct.json` came from `Emulation.setPageScaleFactor`, which behaves like pinch zoom and does not prove WCAG reflow.
- The new audit runners calculate a smaller CSS viewport and matching device scale factor, reject unsupported zoom values, and never call `Emulation.setPageScaleFactor`.
- The interactive runner now requests `Browser.close` before process-tree and profile cleanup. A fresh Edge rerun left zero evidence processes and zero new profile directories.
- Disposable profiles left by the pre-fix runs remain only under ignored `.tmp-voice-*` scratch directories. They contain synthetic local-browser state, are outside the committed packet, and are excluded from lint/build; no evidence browser process remains active.

## Synthetic boundary and restoration

The temporary evidence route and temporary positive readiness facts were used only against the local dev server. They were removed/restored before build and are absent from `e914887`.

- Restored server-boundary SHA-256: `C1D63BE8320A9FAF2445DF624320BFBC86DAECF69943A2246BEA370A405ECDA0`.
- The committed server boundary still returns negative readiness facts and disabled command results.
- No provider, OpenRouter, secret, external audio runtime, database, Preview, Production or push was used.
- No transcript was auto-sent and no real audio left the local machine.

## Named mutation evidence

1. `build-wrapper-drops-webpack-flag`: removed bundler-flag forwarding. The targeted suite returned 1 failure and 10 passes because preview resolved to `next build` instead of `next build --webpack`. Restoration returned 11/11 PASS and restored SHA-256 `77D68E321720E8DC62244184B4EA2A6AAE3BA008778C2BD59ACD6DF4519F4A0B`.
2. `voice-zoom-falls-back-to-pinch-scale`: reintroduced `Emulation.setPageScaleFactor`. The targeted suite returned 1 failure and 6 passes. Restoration returned 7/7 PASS and restored SHA-256 `B4FD87EE6A53292749034CE22D40C13C18FF6C85D30CE170819C5D299EAD3A33`.

## Remaining blockers

1. Native Tagalog review with written approval.
2. Firefox execution on a host where Firefox is installed.
3. Safari execution on macOS or iOS.
4. Real Audio Intake runtime integration, still rollout-disabled.
5. Provider, privacy, cost and latency certification.
6. Separate authorization for any Preview or Production action.

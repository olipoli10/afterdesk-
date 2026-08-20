# ENDVERA public-site V7 evidence

Local review evidence only. These files were captured from the authorized
`feat/public-site-simplicity-v7` worktree. They are not Preview or Production
evidence.

## Audit findings addressed

1. The public surface still identified the product as AfterDesk, while the
   authorized candidate is ENDVERA.
2. The opening did not explain the bounded service in five seconds: workflow
   in, coordinated work, human verification, finished documented result out.
3. On narrow screens, the header targets, long localized headings, small mono
   copy and the final result composition needed measurable clearance and
   readability improvements.

## Capture matrix

| Capture | Viewport | Language / motion | Measured page width | Result |
| --- | ---: | --- | ---: | --- |
| `after/desktop-1440x900.png` | 1440 x 900 | English | 1440 px | no horizontal overflow |
| `after/mobile-390x844.png` | 390 x 844 | English | 390 px | no horizontal overflow |
| `after/mobile-360x800.png` | 360 x 800 | English | 360 px | no horizontal overflow |
| `after/fr-390x844.png` | 390 x 844 | French | 390 px | no horizontal overflow |
| `after/tl-390x844.png` | 390 x 844 | Tagalog, longest wrapping | 390 px | no horizontal overflow |
| `after/reduced-390x844.png` | 390 x 844 | English, reduced motion | 390 px | complete static opening |

The additional solution, engine and result captures exercise the later scenes
in English, French, Tagalog and reduced-motion mode. At 390 px, the final
English and Tagalog result captures retain 17.22 px between the sticky heading
and the result card. At 390 and 360 px, the header stays inside 16 px side
boundaries and the key wordmark and early-access controls are 44 px high.

The `before/desktop-1440x900.png` baseline is valid. The older `before/` phone
captures are retained for traceability but are not valid mobile-layout proof:
the initial Chrome command-line method imposed a wider internal viewport and
cropped it. No product correction was justified from those misleading phone
captures. Every `after/` phone image was produced with exact Chrome DevTools
Protocol viewport emulation through `scripts/capture-local-publicsite.mjs`.

## Red-team verdict

- Five-second clarity: pass. The opening names the workflow, coordinating
  systems, human verification and finished documented result.
- Product truth: pass for review. A2 is explicitly a guide; the copy does not
  claim autonomous execution or live connectors.
- Brand coherence: pass for the public surface, subject to final brand/legal
  review of the ENDVERA cutover.
- Mobile and wrapping: pass at 390 px, 360 px, French and Tagalog.
- Reduced motion: pass. The narrative remains visible as static artifacts and
  no extra animation scheduler was added.
- Accessibility: improved, not certified. Critical mono copy is at least 12 px,
  key mobile targets are 44 px, focus treatment remains present, and the final
  candidate still needs an independent assistive-technology review before a
  production claim.

Public-site candidate score: **8.8 / 10 for local design review**. The portal
was not evaluated or modified because the explicit mandate is Block 1 only.


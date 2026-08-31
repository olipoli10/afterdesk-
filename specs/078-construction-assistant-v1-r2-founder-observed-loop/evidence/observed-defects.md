# Founder-observed defects

The single Olivier session is sealed by observation SHA-256
`de072152fcfbaf2c55797347106b5fe8f73a9ad71fb489d603193a3de653f073`.

## Exact observed outcomes

1. `Rendez-vous avec Marc mardi à 14 h pour Laval.` returned `Message ou contexte invalide.` and created no calendar item.
2. `Rendez-vous avec Marc mardi à 2 pour Laval.` returned `Message ou contexte invalide.` instead of asking `Est-ce 2 h ou 14 h?`; it correctly created no calendar item.
3. `Qu’est-ce que j’ai demain?` returned `Message ou contexte invalide.` instead of reading PostgreSQL.
4. The local SMS fixture returned `Enveloppe locale invalide.` on both the first attempt and the repeated provider ID; no canonical message was created, so replay refusal was not observed.
5. `Texte Marc que je serai 30 minutes en retard.` returned `Message ou contexte invalide.`; no exact approval surface existed.

Post-session database measurement found one project, zero messages, zero calendar items, zero actions and three setup audit events. Olivier rated actionability 1/5 and observable advantage -2. His selected managed-advantage boxes cannot override contradictory database evidence: duplicate refusal and exact approval were not exercised, and reconstructible workflow history was absent.

## Reproduced causes

- Client closures wrapped exported Server Actions before passing them to `useActionState`, so the submitted `FormData` did not reach the action under the pinned Next.js runtime.
- The strict local envelope builder included unknown field `normalizedRecipients`.
- The real demo project was named `Rénovation Laval`, while the frozen founder phrase used bounded alias `Laval`.

These defects are bounded to form wiring, the local fixture builder and safe unique project-alias resolution. No schema, migration, dependency, provider or external transport change is required.

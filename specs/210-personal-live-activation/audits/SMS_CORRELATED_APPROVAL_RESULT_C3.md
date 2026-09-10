# C3 — lecteur historique local

2026-09-10. Auteur `openrouter_disabled_adapter`. Nouveau module serveur et tests seulement; aucun schéma, route, mobile, queue ou fichier source existant modifié. Aucun PostgreSQL, génération, provider ou activation exécuté par cette lane.

## Contrat livré

`readCorrelatedCalendarApprovalResult({enabled:true,actor,reviewId},env,context)` retourne le DTO fermé `personal-correlated-calendar-approval-result-v1`, ou DISABLED sans DB; erreur unique `CORRELATED_CALENDAR_APPROVAL_RESULT_UNAVAILABLE`. Le flag REVIEW est le seul switch requis. Aucun test de STORE, APPROVAL ou pilote courant; aucune relecture Google/modèle/SMS, token ou credential.

Setup transaction Serializable/timeouts paramétrés avant découverte. La découverte scoped review→question ne sélectionne que trois métadonnées, puis namespace canonique exclusif avec retour SQL ::text. OWNER courant actif et membre owner SHARE avant review/op/approval; question namespace relu pour égalité. Les références globales ne sont pas masquées par un filtre acteur sur le lookup approbation. Aucun rowlock de source/question mutable après calendrier. C1 ne réclame aucun namespace après son lock opération, donc le reader n'introduit pas ce cycle.

Le reader compare proof minimale, hash request historique six champs, UUID receipt, FK/scopes/marker, fingerprintA et claim reconstruit uniquement en mémoire depuis l'approbation durable. `inspectCorrelatedCalendarApprovalState` vérifie le résultat exact, y compris l'eventId déterministe. Le state est copié/gelé avant la prochaine lecture asynchrone; les Dates SQL sont converties Timestamp3UTC→instant puis copiées en strings. Le claim reconstruit ne sort jamais du lecteur et n'est jamais donné à un exécuteur.

NOT_ATTEMPTED exige pending0/resultNULL/leaseNULL/externalfalse sans approbation globale. Processing exact encore vivant donne PENDING_RESULT; expiré donne UNKNOWN sans écriture C1. Uncertain exige l'union79; completed exige CONFIRMED1/leaseNULL/externaltrue lié à l'approbation. L'histoire incohérente est indisponible, jamais adoptée ou réparée. Seul le propriétaire actuel correspondant au créateur peut lire; des epochs owner nouveaux ne doivent pas égaler l'autorité historique.

CONFIRMED est explicitement `confirmationBasis:DURABLE_RECORDED_RESULT` avec `providerStateVerified:false` : pas d'affirmation que l'événement existe encore ni qu'un test synthétique fut un appel Google réel. Aucun confirmedAt inventé depuis updatedAt. Le DTO n'expose ni textes/citations, namespace/numéros, opération/nonce/autorité, ni moyen de relancer/approuver. Le résultat est publié seulement après résolution de la transaction et dernier contrôle signal/deadline/REVIEW; aucune relance sur commit inconnu.

## Preuves auteur et limites

Premier run **63/63 PASS14:44:47**. Après ajout de la copie anticipée du state et huit tests complémentaires : **174/174 PASS14:46:19** (71C3 +89A +14contre-testsA). Les mocks DB rendent des lignes synthétiques; les vrais inspecteurs A et proof sont appelés. Les tests couvrent sorties fermées, scopes et hashes mutés, lookup global, expiry historique, owner courant distinct des anciens epochs, transports/status, dates et objets mutés pendant await, cancellation/deadline jusque commit, erreurs opaques et ordre SQL/no-write.

TypeScript complet et lint ciblé avaient terminé exit0 après le delta source final. Dernier lint des deux fichiers après ajouts test : exit0; le dernier TypeScript partagé refuse seulement deux diagnostics TS2322 du WIP de l'autre lane `correlated-calendar-approval-gate.test.ts`109/110, auteur averti, aucun diagnostic C3. Ne pas présenter ce dernier run global comme PASS.

Source gelée SHA256 `9a6da6a594a14d0027134b33e5dbd8bd706d94c613d2edf20227ec5924d5cc06`. Aucun RED natif C3 n'est revendiqué. Ces mocks ne prouvent pas les jointures SQL/types physiques, les trois fuseaux ni la concurrence owner/C1 : le contrôleur possède ces tests natifs. Contre-revue Android demandée après sa tranche C2a; pas encore de verdict indépendant C3 enregistré ici.

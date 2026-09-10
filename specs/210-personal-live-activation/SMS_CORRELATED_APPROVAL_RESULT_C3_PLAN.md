# C3 — lecteur historique de résultat d'approbation

2026-09-10. **DESIGN ONLY** pendant le full natif du contrôleur. Aucun code, test, SQL ou route ajouté par ce plan. SQL79 est appliqué et immuable. Ce document précise la section7 du plan backend, lue intégralement, à partir des modules réels.

## 1. Fichier et exports proposés

Nouveau `src/server/personal-assistant/correlated-calendar-approval-result.ts`.

- `readCorrelatedCalendarApprovalResult(input, env, context)` : export serveur unique de lecture publique, input strict `{enabled:true,actor:{workspaceId,userId},reviewId}` avec IDs1..191 trim exact. Les objets et deadline/signal sont copiés avant le premier await. OFF retourne `{status:'DISABLED',executionAuthorized:false}` sans DB.
- `correlatedCalendarApprovalResultSchema` et type inféré : DTO strict versionné, sans objet claim brut. Pas d'export de lecteur transactionnel au départ : le chemin duplicate de C2 doit appeler ce wrapper après la fin de sa transaction, jamais reprendre l'exécuteur. Un export InTransaction ne sera ajouté que sur besoin démontré, avec indication provisional/committed et même ordre de locks.

Nom DTO proposé : `personal-correlated-calendar-approval-result-v1`. Socle : `version,workspaceId,reviewId,observedAt,readOnly:true,approvalAvailable:false,executionAuthorized:false,automaticRetry:false,providerStateVerified:false`. Discriminant `outcome` et champs propres ci-dessous. Ne pas retourner operationId, approvalToken, writeAuthority, credential/grant IDs, namespace, numéro, texte SMS, citations, packet ou claim.

## 2. Gates et durée

Gates exacts : input.enabled true et **ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED=true** seulement. Ni flag d'exécution, ni pilote ouvert, ni STORE_ENABLED, ni Google/model/SMS actif requis pour lire l'histoire. Aucun env activé. CLIENT/session/emailVerified reste responsabilité de la future route; le lecteur prend un acteur serveur et vérifie OWNER courant exact.

Important seam réel : `temporalRegistryTransaction` et `temporalRequireLive` exigent STORE_ENABLED. Ils ne conviennent donc pas inchangés au contrat historique. Reprendre localement la convention de transaction Serializable/timeouts paramétrés, avec un petit live local limité au flag REVIEW/deadline/signal; ne pas affaiblir ces helpers partagés. `temporalRegistryClock` est réutilisable, car sans gate d'autorité.

Budget total depuis entrée <=5s, performance.now pour écoulement monotone en plus de Date.now/deadline absolue; attente de transaction incluse. maxWait et timeout bornés au restant, statement/lock_timeout locaux avant découverte. Recheck après chaque await, après transaction et avant sortie. Aucune relance lors d'une erreur SSI/timeout/commit inconnu. Une réponse historique n'est publiée qu'après résolution de la transaction; pas de promesse HTTP5s si le transport appelant est non annulable.

## 3. Parcours et locks

1. Valider/capturer input et contexte; ouvrir Serializable bornée et installer les timeouts avant la découverte.
2. Découverte **sans rowlock et sans texte** par reviewId/workspaceId/userId exacts, jointure review→question via clarificationId et scope composite. Ne SELECT que IDs et `question.namespace`64hex. Zéro/multiple/incohérence donne erreur opaque commune, pas NOT_ATTEMPTED.
3. Verrou namespace canonique existant : `pg_advisory_xact_lock(hashtextextended(namespace,0))::text`. Le namespace vient de la question durable protégée76, pas du caller, d'un numéro courant ou de SMS expirés. Aucun appel à temporalLockSourceNamespace, qui recharge le request SMS.
4. OWNER actuel : workspace actif dont ownerUserId=actor.userId; membre actif role owner même user. `FOR SHARE OF w,m`, avec dates converties UTC instants et immédiatement copiées. Ce contrôle courant est distinct de l'autorité historique du claim : **ne pas comparer les epochs actuels aux epochs anciens de writeAuthority**. Une modification de métadonnées ou révocation Google ne doit pas cacher le reçu au même propriétaire toujours autorisé. Un transfert ne donne pas l'ancien historique au nouvel owner; l'ancien owner échoue au contrôle courant.
5. Relire la question namespace/id/scope pour égalité avec découverte; lire la review immutable et son opération canonique `FOR SHARE`, puis l'approbation immutable par lookup global reviewId OU calendarOperationId. Toute relation étrangère ou ambiguë refuse; aucun JOIN scopé ne doit masquer une approbation et simuler son absence. Pas de lock sur question mutable nécessaire au seul namespace immutable; aucun locker après calendrier ne demande une source/autorité/namespace.
6. Vérifier métadonnées et état ci-dessous. Capturer les Dates en ISOUTCms et les JSON via les inspecteurs A avant toute autre latence. Horloge DB finale et contrôle owner conservé par SHARE jusqu'au commit; bornes de chronologie cohérentes, sans exiger now<expiry. Après commit, dernier live et DTO frozen uniquement.

Même namespace exclusif que C2 : sérialise deux chemins typés avant les locks owner/calendrier. Recovery C1 prend seulement calendrier et ne demande jamais namespace ensuite; pas de cycle ajouté. Un concurrent qui modifie owner après un ancien snapshot doit bloquer ou provoquer l'échec Serializable, pas donner une divulgation tardive. Les tests doivent établir cela avec deux vrais PID, pas seulement deux promesses.

## 4. Binding historique, pas nouvelle inspection des sources

Lecture des colonnes nécessaires seulement, pas `SELECT *` sur question/receipt/source. Le claim peut être reconstruit **en mémoire** à partir de l'approbation réellement présente et des métadonnées de l'opération; il n'est jamais persisté, émis ou donné à un exécuteur.

- Review scope/version/receipt/requestUUID/requestHash/accountVersion/packetHash/proofHash et scalar approval mappings exacts. Recalculer la vue avec `fingerprintCorrelatedCalendarApprovalView`, pas accepter le fingerprint seul.
- Inspecter la proof minimale et son hash avec `inspectCorrelatedCalendarReferenceProof`; request actuel strict exact égal au draft+accountVersion+UUID. Conserver le serializer request legacy six champs; UUID déterministe receipt. Vérifier marker, global linked review, kind, idempotencyKey et absence budget/source/model lineage, comme le reader actuel mais sans loader actif.
- Avec approbation : id/nonce/fingerprintVersion/fingerprint/scope/operation/review exacts; approvedAt>=review.createdAt; approvalExpiresAt=min(preparationExpiresAt,pilotExpiresAt), lease d'origine<=25s. `inspectCorrelatedCalendarApprovalClaim` puis `inspectCorrelatedCalendarApprovalState` A vérifient le binding et l'eventId déterministe. Ces helpers n'utilisent pas Date.now : ils acceptent un claim historiquement cohérent après expiration. Aucune lecture de table credential/Google/grant ni `authority_current`.
- Le compteur/lease/status/transport courant de l'opération doit correspondre au résultat A. Une forme A seule n'est pas une transition authentifiée : sa liaison réelle à l'approbation et aux lignes79 est indispensable.
- Le lecteur n'atteste ni nouvel examen de packet ni validité sémantique des SMS. Pas de rechargement de `packet`, deux SMS, modèle, citations ou source filesystem; pas de purge/maintenance. L'intégrité historique est ancrée dans les relations78/79 et les hashes existants, pas une nouvelle source d'autorité.

## 5. Sorties fermées

| Condition durable vérifiée | outcome et contenu minimal |
|---|---|
| Pending0, resultNULL, leaseNULL, externalfalse, aucune approbation globale, review/request cohérents | NOT_ATTEMPTED, sans approvalId ni reçu; aucune offre implicite même avant expiry |
| Processing1, claim A exact CLAIMED ou DISPATCH_CLAIMED, lease exacte encore future selon DBnow, externalfalse | PENDING_RESULT, approvedAt; ne pas exposer un statut « envoyé » depuis le seul dispatch marker |
| Même processing exact mais lease expirée | UNKNOWN, reason CLAIM_LEASE_EXPIRED, approvedAt; aucune mutation ni besoin de lancer C1 |
| Uncertain1, leaseNULL, union A UNCERTAIN exacte | UNKNOWN, raison fermée persistée, approvedAt; aucune assertion « aucun effet » |
| Completed1, leaseNULL, externaltrue, union A CONFIRMED exacte et eventId déterministe | CONFIRMED, approvedAt, receipt `{confirmed:true,providerEventId}`, `confirmationBasis:'DURABLE_RECORDED_RESULT'` |
| Ligne manquante, étrangère, terminal sans approbation, nonce/hash/état invalide, incohérence transport | Erreur opaque indisponible, jamais NOT_ATTEMPTED ou CONFIRMED |

`observedAt` est l'instant de cette lecture, **pas** l'instant d'exécution. Il n'existe pas de confirmedAt immutable distinct : ne pas l'inventer depuis updatedAt. CONFIRMED signifie « confirmation enregistrée », pas vérification que l'événement existe encore chez Google, ni certification que le test SQL synthétique fut un appel réel. `providerStateVerified:false` reste constant. Aucun texte de réussite généré ni receipt externe inventé.

## 6. Matrice minimale proposée, pas encore écrite/exécutée

Unitaires propres : OFF sans DB; entrée/ID extra/actor muté; gate REVIEW coupé pendant chaque await; exécution/STORE/piloteOFF n'empêchant pas historique; deadline/abort originaux; SQLsetup avant discovery; namespace puis owner puis calendrier; mapping/global missing approval; mutations de Dates/JSON après parse; tout statut de la table ci-dessus; ancien epoch owner non exigé; aucun champ sensible/texte/action dans DTO; rejet commit inconnu et late disclosure.

Natifs contrôleur : approbation/dispatch/terminal79 réels via fixture synthétique, résultat après expiration réelle et révocation Google/model; processing expiré luUNKNOWN sans recoverywrite; après C1 mêmeUNKNOWN lié; trois fuseaux; mauvais workspace/ancien/nouveau owner refusés; acteur courant identique après epochmodification accepté; deux PID et barrières de révocation/lecture/C1; snapshots opérations/approval/review/receipt/budget inchangés. Oracles spécifiques aux causes stables, pas large toThrow pouvant cacher erreur void/UTC.

Compatibilité : reader actif V1, liste/offre, routes et mobile restent inchangés. C2 ne doit pas appeler le lecteur historique sous une transaction tenant déjà un calendrier avant namespace; duplicate s'arrête d'abord et relit hors transaction, sans réexécution. Toute demande de nouveaux champs/actions, nouveau TTL/retention ou provenance de transport certifiée exige arbitrage séparé.

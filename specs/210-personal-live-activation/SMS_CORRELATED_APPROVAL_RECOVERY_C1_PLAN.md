# C1 — récupération bornée des claims corrélés expirés

2026-09-10. Plan local, sans activation. SQL79 appliqué immuable. Aucun changement produit avant libération du baseline root78865 par le contrôleur.

## Constat et périmètre

Le recovery existant sélectionne une seule CTE de claims processing/attempt1 expirés selon l'horloge DB, les verrouille FOR UPDATE SKIP LOCKED puis les passe uncertain par CAS exact. Son JSON legacy fusionne des métadonnées supplémentaires. Cette forme n'est pas l'union stricte79 : une ligne corrélée valide ne peut pas recevoir ce résultat legacy. Il s'agit d'une incompatibilité de forme constatée dans le code et le trigger, pas encore d'un RED natif du recovery.

Propriété C1 : `src/server/personal-assistant/claim-recovery.ts` et tests unitaires ciblés. PostgreSQL et fixtures natives appartiennent au contrôleur. Aucun schéma, trigger, moteur, route, grant, provider ni nouvelle queue.

## Delta exact proposé

1. Conserver API enabled strict, batch1..25, deadline absolue2.5s, timeout SQL local, une transaction Serializable et une requête atomique. Aucun retry automatique.
2. Avant LIMIT, distinguer toute origine corrélée par marqueur **OU** relation globale de review **OU** relation globale d'approbation. Cette distinction ne dépend pas du seul JSON ni d'une jointure actor-scopée qui pourrait cacher une relation étrangère.
3. Candidat legacy : absence des trois marqueurs; conserver exactement le résultat et comportement historiques.
4. Candidat corrélé : kind calendar_write, relation approbation/review immutable complète, `sms_correlated_approval_binding` et `sms_correlated_approval_state_valid` true; phase CLAIMED ou DISPATCH_CLAIMED; lease exacte de l'approbation; approbation réellement visible avant le snapshot via le helper79. Les lignes corrélées malformées, sans approbation ou incohérentes sont exclues **avant LIMIT**, sans les modifier, sans faire échouer les autres lignes et sans fallback legacy. Ne pas utiliser l'inspecteur de source fraîche, les grants courants, un namespace lock ou le texte SMS.
5. Garder le verrou sur l'opération seulement. Les relations lues sont INSERT-only; aucune montée de verrou sur autorité mutable, aucun advisory provider/day. Garder le CAS final id/workspace/user/account/kind/requestHash/attempt/lease/budget/réservation/result et DB-expiry; pinner aussi la branche et les références nécessaires dans la CTE. Pas d'UPDATE des références historiques.
6. Résultat corrélé exact, construit depuis les scalaires immutables de l'approbation : version `personal-correlated-calendar-write-state-v1`; origin `{kind:'personal_sms_temporal_receipt',approvalId,reviewId,reviewFingerprint}`; phase UNCERTAIN; writeConfirmed false, reviewRequired true, automaticRetry false; reason CLAIM_LEASE_EXPIRED. Ne pas recopier le JSON legacy/priorClaimResult dans cette union fermée. L'approbation et sa lease/nonce/autorité, la review, le receipt et les budgets restent intacts. Le marqueur dispatch distingue l'ancien état mais ne démontre pas un appel HTTP; le résultat n'affirme aucun effet confirmé.
7. Ne changer que status, leaseUntil=NULL, updatedAt DBUTC et result. Préserver externalTransportPerformed, attempts et toute réservation. La sortie API reste non autorisante et compte uniquement RETURNING, jamais les candidats. Une erreur ou un dépassement de délai ne doit pas annoncer un commit.

## Validation et critères

- Unitaires : API OFF/deadline inchangées, ordre éligibilité avant LIMIT, global OR sans fallback, helpers historiques79 et phases exactes, branche terminale strictement bornée, CAS complet, aucune nouvelle dépendance/écriture budget/namespace/currentgrant. Les tests de texte SQL ne seront pas présentés comme une preuve de SQL exécuté.
- Contrôleur natif : vraie approbation committée CLAIMED puis DISPATCH_CLAIMED expirée; trois fuseaux si utile; révocation/TTL de source n'empêchant pas bookkeeping; union validée par79 et origine exacte; snapshots approval/review/receipt/budget inchangés; replay zéro; deux PID avec un seul winner; coexistence legacy et candidats corrélés invalides exclus sans starvation de LIMIT. Pas de désactivation de trigger pour fabriquer une preuve positive.
- Contre-revue Android puis main avant native. Arrêt sur incompatibilité réelle79 ou besoin de nouvel historique : ne pas fabriquer approbation, lease, nonce, autorité ou migration pour contourner le contrat.

Succès borné : le recovery existant sait fermer une claim corrélée réellement expirée sous79 en conservant ses preuves, sans exécuter, relancer ou confirmer une action. Ce n'est pas une validation du futur moteur typed approval ou d'un clic humain.

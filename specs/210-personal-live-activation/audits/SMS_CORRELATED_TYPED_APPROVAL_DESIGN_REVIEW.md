# Revue indépendante — approbation calendrier corrélée

2026-09-10 — `openrouter_disabled_adapter`. **DESIGN REVIEW, approbation conditionnelle de la direction; aucune approbation d'implémentation ni d'activation.** Lecture seulement, sauf ce document. Aucun test, mock, SQL, migration, génération, serveur, fournisseur ou transport exécuté.

## Sources relues et portée

Lecture complète de `SMS_CORRELATED_TYPED_APPROVAL_MOBILE_PLAN.md`, `src/server/personal-assistant/calendar-actions.ts`, `claim-recovery.ts`, `api-auth.ts` et de la route générique Google actions. Recherche ciblée des autres recoveries/confirmations, lecture des guards immuables et du final binding de la migration78, vérification du contrat réel `GoogleCalendarClient.insertEvent` et de la dépendance `googleTokensForOwner` à calendar_read. La grille engineering:code-review a servi à distinguer intégrité durable, concurrence, autorité et comportement d'erreur. Échange direct avec l'auteur backend `personal_gateway_subject`.

**Verdict :** réutiliser le moteur calendrier existant avec une origine typée durable est cohérent. En revanche, une propriété ajoutée seulement à `claim` ou `result` ne suffit pas au contrat proposé. Le GET de résultat historique et la conservation exacte de l'approbation sont des dépendances du bouton, pas des améliorations facultatives. Les garanties ci-dessous doivent être démontrées avant de modifier le refus générique.

## Faits actuels, sans inventer un défaut exploitable

1. `lockWrite` refuse globalement un marqueur `correlatedTemporalReceiptId` OU n'importe quelle relation `PersonalSmsCorrelatedCalendarReview` vers l'opération. Le parcours corrélé n'est actuellement pas exécutable par l'approbation générique. Cette revue ne démontre aucune fuite actuelle.
2. Le claim générique écrit `approvedBy`, `approvedHash`, `approvalToken`, `writeAuthority`, `dispatchStarted:false` dans `result`. L'exécuteur compare cet objet exact, passe le marqueur à true dans une première transaction, puis contrôle encore la DB avant et après le transport. Le nonce, le lease et le CAS processing/1 empêchent un exécuteur concurrent de fermer le gagnant.
3. Le terminal confirmé **remplace** `result` par le reçu `{providerEventId,confirmed:true}`; le catch propriétaire **remplace** `result` par `{automaticRetry:false,reviewRequired:true,writeConfirmed:false}`. Une nouvelle origine ajoutée uniquement à l'ancien objet serait donc perdue sur ces deux chemins. C'est un écart d'intégration future certain à la lecture, pas un test RED exécuté ici.
4. `recoverExpiredPersonalActionClaims` traite aussi calendar_write. Il conserve les champs de résultat existants, ajoute un `priorClaimResult` et des métadonnées de récupération, et fait un CAS exact du résultat/lease/budget/acteur. Il ne libère pas le budget, ne réessaie pas et ne réécrit pas un terminal. Cela conserve davantage d'historique que le catch de l'exécuteur, mais ne produit pas aujourd'hui une union de résultat corrélé reconnue par un lecteur.
5. La migration78 rend immuables le marqueur, le request/hash, l'identité et la relation de **préparation**. Son guard UPDATE ne rend pas une nouvelle approbation dans result immuable. Son contrôle pending/0/resultNULL est un contrôle de création, pas un moteur d'approbation. Ne pas modifier78 déjà appliquée.
6. Le lecteur de revue actuel applique la fenêtre originale du reçu et les autorités courantes. Le réutiliser comme lecteur de résultat après TTL cacherait des issues déjà durables. Retirer son TTL pour faciliter l'historique changerait au contraire la politique de consultation des SMS : ni l'un ni l'autre n'est le raccord recommandé.
7. Le moteur vérifie calendar_write; son chargement actuel des tokens exige aussi calendar_read. La première offre doit refléter cette dépendance réelle, ou l'auteur doit proposer une extraction distincte revue. READ ne remplace jamais WRITE et aucun consentement ne doit être créé pour faire passer l'offre.

## Origine durable recommandée et arbitrage restant

L'auteur backend propose une nouvelle table d'approbation INSERT-only, liée de façon unique/scopée à la revue et à l'opération, contenant nonce, fingerprint/version, acteur, approvedAt, approvalExpiresAt, lease et writeAuthority exacts. **Accord de conception conditionnel** : cela sépare utilement l'événement d'approbation de `result`, qui évolue. Aucun nom de table, migration79 ou code n'est autorisé par cet audit; le contrôleur doit relire le plan concret et le SQL.

Conditions minimales :

- Une approbation au plus par opération/revue; FK et contrôles croisés exacts owner/workspace/review/receipt/requestHash. La table ne copie ni SMS ni packet/proof déjà immuables. Un identifiant envoyé par le mobile n'établit jamais ces relations.
- INSERT atomique avec le seul CAS pending/0/leaseNULL → processing/1. Horloge DB UTC(3), fenêtre non renouvelable et nonce créé par le serveur. Contrôle différé du **dernier état courant** au commit; ni approbation orpheline ni processing corrélé sans approbation. Aucun faux lease sur les deux SMS completed.
- Conservation de la liaison approbation dans processing, completed et uncertain, y compris catch et recovery. Les transitions doivent refuser suppression/substitution de l'origine. Les guards historiques ne doivent pas empêcher de révoquer compte, membre ou grant.
- Formes fermées versionnées pour processing, confirmed, executor-uncertain et recovered-uncertain; reconnaître explicitement la récupération. Ne pas parcourir récursivement `priorClaimResult` à la recherche d'un `confirmed:true`, et ne pas traiter un nonce/approvalId fourni par le caller comme preuve.
- Source de vérité du résultat : liaison immuable + opération courante + enveloppe terminale exacte. Un ancien reçu nested, un événement d'une autre approbation, une enveloppe incohérente ou l'absence de résultat ne donne jamais CONFIRMED.
- Le binding durable peut survivre à la perte de l'accusé de commit. Cette perte ne permet ni deuxième approbation, ni nouvelle opération, ni restauration pending, ni nouveau budget. Un lookup ultérieur n'est qu'une lecture.

Une union JSON seule pourrait techniquement être développée avec de nouveaux guards équivalents, mais le code actuel n'en fournit pas la preuve. Ne pas déclarer « aucune migration nécessaire » sur la seule existence du champ result.

## Claim, double dispatch et révocation — critères d'acceptation

L'origine doit atteindre les mêmes barrières que l'autorité Google, pas être validée uniquement dans la route ou avant la transaction.

1. **Entrée fermée :** le mobile donne reviewId et les deux préconditions de contenu uniquement; OWNER actuel issu de la session. L'offre ne constitue ni consentement automatique ni preuve de lecture humaine. Refuser admin, mauvais workspace, citation/fingerprint/hash changés, pending non vierge, flags OFF et fenêtre échue avant claim.
2. **Ordre unique :** namespace canonique → question/reçu → sources/autorités → approbation/relation/calendrier. Les lignes mises à jour doivent être prises en UPDATE dès leur première acquisition, sans upgrade concurrent SHARE→UPDATE. Décrire aussi l'ordre du nouveau lecteur historique et de recovery; aucun verdict « sans deadlock » avant oracles natifs avec barrières.
3. **Claim exact :** stocker puis recharger la même origine durable, request, writeAuthority, nonce et lease. Le claim caller est une copie privée, pas une autorité. Refuser variante legacy forcée, origine omise/changée, approbation d'une autre opération et nonce substitué, avant tout chargement de tokens ou callback HTTP.
4. **One-use :** garder le marqueur durable de dispatch et son exact CAS avant toute activité réseau. Deux appels utilisant le même claim ne doivent jamais obtenir deux callbacks, et le perdant ne doit ni fermer ni altérer le gagnant. Un marqueur dispatch prouve une transition durable, pas l'exécution certaine du callback.
5. **Point d'usage :** reprendre les bindings corrélés courants sous locks avant le callback réel, puis faire les checks synchrones finaux de flags/temps/signal après les derniers awaits. Révoquer pendant la lecture des tokens ou la dernière requête doit empêcher le départ ou provoquer un résultat inconnu conservateur, jamais un chemin legacy de secours.
6. **Réseau hors locks :** capturer la promesse et installer son handler immédiatement dans le gate, attendre la réponse après transaction. Échec du commit après début du callback = issue inconnue, pas autorisation de renvoi. Ne pas inventer de confirmation de cancellation à partir d'un AbortSignal.
7. **Terminal :** réponse Google strictement liée à l'événement attendu, nouvelle autorité/horloge et CAS exact du même claim avant succès durable. La première politique conservatrice peut refuser une réponse après expiration; elle doit produire uncertain sans effacer l'origine ni affirmer « rien n'a été ajouté ». Un terminal déjà committed ne peut être écrasé par le catch, recovery ou une réponse tardive.

## Lecture historique après TTL

Recommandation à arbitrer : un GET séparé de résultat ne dépend que de l'autorité de **consultation actuelle OWNER du workspace**, de la liaison immuable et de l'état durable exact. Il ne recharge pas les SMS expirés, ne recalcule pas une offre, ne prolonge aucun TTL, ne déchiffre pas de credential et ne contacte pas Google. La perte du rôle OWNER refuse la lecture; la révocation du grant Google ou la déconnexion seule ne devrait pas masquer un résultat déjà enregistré. Sinon l'utilisateur perd précisément son moyen de vérifier une tentative après révocation.

Réponse versionnée minimale, strictement scopée et no-store : reviewId, fingerprint/version de l'approbation quand elle existe, état fermé et reçu uniquement si confirmed durable. Distinguer `NOT_ATTEMPTED`, `PENDING_RESULT`, `OUTCOME_UNKNOWN`, `CONFIRMED` et indisponibilité/refus. `NOT_ATTEMPTED` ne rend pas une offre valide après TTL; `OUTCOME_UNKNOWN` n'autorise aucun renvoi. Une réponse de lecture périmée ne doit jamais réarmer un bouton local marqué tenté.

Le providerEventId doit provenir du reçu canonique enregistré et être lié à l'événement déterministe attendu, pas seulement satisfaire une forme string. Lire un succès durable n'affirme pas que l'événement n'a pas été modifié ultérieurement dans Google.

## Matrice de preuves à exiger — non exécutée ici

| Scénario | Oracle minimum |
|---|---|
| Deux taps / deux backends | Une seule approbation, processing1, nonce unique, un callback au plus; perdant sans cleanup du gagnant. |
| Deux execute du même claim, horloge fixe | Un dispatch marker gagné; aucune deuxième invocation; origine durable inchangée. |
| Variante legacy forgée / marker seul / relation étrangère | Refus global avant transport; aucun fallback générique. |
| Tampering request, fingerprint, citation, acteur, authority ou approvalId | Refus avant claim/gate selon moment; aucun changement du hash historique. |
| Révocation à chaque await, y compris pré-HTTP et post-réponse | Zéro départ si déjà refusée au gate; sinon uncertain conservant origine et aucun retry. |
| TTL avant claim, pendant tokens, pendant réponse, après terminal | Pas de renouvellement; terminal tardif conservateur; succès durable historique consultable sans réexposer SMS. |
| UTC / New York / Tokyo | Identiques instants, timestamps naïfs UTC explicites, aucun param Date dépendant de session timezone. |
| Crash avant marker, après marker, après callback, commit-ACK perdu | Origine et preuve conservées; distinction état connu/inconnu; aucune reprise d'effet. |
| Recovery contre executor tardif | CAS exact; un seul terminal; nonce/fingerprint récupérables directement; budget intact. |
| Résultat JSONB reordered, absent, vieux nested confirmed, mauvais eventId | Parité canonique ou refus; aucun faux CONFIRMED depuis un fragment historique. |
| GET historique après TTL ou Google revoke / après OWNER revoke | Résultat consultable dans premier cas selon politique arbitrée, refus dans second; zéro writes/provider. |
| Refresh, logout, remount, relance mobile après issue inconnue | Aucun POST automatique; lecture seule de réconciliation; offre nouvelle ne remet pas la tentative à zéro. |

Il faut conserver séparément preuves de tests unitaires, vrais SQL/transactions et concurrence à deux connexions, et transport FAKE injecté. Aucun de ces tests ne démontre un effet fournisseur réel. Le bouton reste absent tant que persistance/transition, lecture de résultat et gates backend ne sont pas arbitrés et prouvés.

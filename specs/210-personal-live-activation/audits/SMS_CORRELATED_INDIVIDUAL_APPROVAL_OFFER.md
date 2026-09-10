# Offre individuelle — lecteur et GET privés

2026-09-10. Implémentation locale auteur `openrouter_disabled_adapter`, après relecture intégrale des plans backend/mobile et de leurs addenda contrôleur19:22Z. Aucun changement C2a, C3, liste/carte V1, SQL, schéma, route existante ou mobile. Aucune activation, génération, build, PostgreSQL ou requête fournisseur lancé par cette lane.

## Surface livrée

- `src/server/personal-assistant/correlated-calendar-approval-offer.ts` : export `readCorrelatedCalendarApprovalOffer({enabled:true,actor,reviewId},env,context)`, schéma/type strict `personal-correlated-calendar-approval-offer-v1`.
- GET sibling `src/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer/route.ts` : workspaceId/reviewId issus de la carte existante, jamais d'ID manuel ou de sélection globale.
- Nouveaux tests lecteur/route et `test/fixtures/correlated-calendar-offer.fixture.ts`. Le fixture dérive textes/preuve/fingerprint des producteurs purs existants; il ne certifie pas la persistance ou une autorité réelle.

## Invariants

Une transaction Serializable<=5s, un appel au vrai gate C2a. Ce gate installe les timeouts natifs avant sa découverte et garde son ordre namespace/autorité/calendrier. Le wrapper n'ajoute aucune sélection multi-cartes, second namespace, claim, lecture de tokens ou mutation. Les gates REVIEW+APPROVAL explicites sont OFF par défaut; les autres conditions STORE/pilote/Google restent celles du gate et sont revérifiées localement aux frontières. Aucun refus opaque n'est converti en cause READ/terminal prétendument reconnue, ni en collection vide.

Le DTO réutilise directement le schéma de l'item V1 exporté par la liste. L'item et ses deux sources/citations restent inchangés, y compris leurs operationId de sources; **aucun calendarOperationId exécutable**, nonce, claim, authority ou readPrerequisite n'est exposé. Le wrapper recalcule le fingerprint fermé depuis la vue C2a, vérifie son scope/review et requestHash historique six champs, et compare le draft offert au draft de l'item. Il ne remplace pas l'inspection canonique des deux SMS.

Root : version/workspaceId/readOnly:true/executionAuthorized:false/explicitApprovalRequired:true/review/approvalOffer. L'offre porte ELIGIBLE_FOR_EXPLICIT_APPROVAL, reviewId, expectedRequestHash, expectedReviewFingerprint, fingerprintVersion, inspectedAt, approvalExpiresAt et executionAuthorized:false. Ce n'est ni une commande envoyée ni une preuve du geste humain. Le mobile devra afficher/figer cette exacte review avant un futur geste explicite; aucune intégration mobile dans cette tranche.

## Expiration sans renouvellement

Le wrapper copie l'entrée, le signal et le plafond de temps, et maintient Date.now+performance.now. Après C2a, il parse/copie/gèle les champs publics avant l'await suivant. Une horloge DB finale doit être >=inspection du gate et strictement <expiration originale. Le temps monotone est échantillonné **avant** le SELECTclock; après résolution du commit, `dbEpoch + elapsedSinceBeforeClock` doit encore être strictement <expiration. Cela inclut conservativement la latence de requête/commit, sans déplacer l'expiration ni fabriquer un inspectedAt au retour.

La route impose sa propre deadline totale5s depuis entrée et conserve URL/signal avant auth et userId avant rate. Après lecture, elle valide le DTO/scope/review et ajoute conservativement tout le temps de lecture à l'inspectedAt DB avant publication. Cette surestimation peut refuser une offre à très faible durée restante; elle ne rallonge jamais la fenêtre. Le DTO garde les instants DB pour les futurs contrôles de cycle de vie mobile.

GET Node force-dynamic; REVIEW ou APPROVAL OFF→404 avantauth. Session CLIENT vérifiée, IDs trim exact1..191 uniques, aucun paramètre supplémentaire. RateLimit30/min/user avant gate, retour true strict. Erreurs opaques401/404/400/429/503, private,no-store et Vary Cookie,Authorization. Seule mutation possible HTTP : infrastructure RateLimit existante. Pas de POST, cache de résultat, CORS ou transport ajouté. Ces gardes empêchent une divulgation tardive, pas une terminaison forcée d'auth suspendue.

## Preuves auteur

**49/49 lecteur PASS15:28:42**, puis **103/103 PASS15:30:19** (49 lecteur +54 route), via safeEnvironment. Gate/DB sont mockés pour le lecteur; la route mocke auth/rate/reader avec les vrais schémas. Positifs producteur-dérivés, copie avant await, scope/hash/phase faux, timestampDB rétrograde/expiré, expiration pendantclock/commit, non-renouvellement des timestamps, withdrawal flags, commit inconnu, queryencodedduplicates, auth/signal/deadline et sorties interdites sont couverts.

Pas de RED natif avant patch revendiqué. Aucun de ces mocks ne prouve SQL C2a sousconcurrence, session HTTP réelle ou HEAD/OPTIONS/405 Next; ces preuves restent au contrôleur. Lint ciblé des cinq nouveaux fichiers exit0. Dernier TypeScript global voit seulement TS2353 dans le WIP contrôleur `temporal-registry.postgres.test.ts`678 (env inféré trop étroit), aucun diagnostic propre à cette tranche; contrôleur averti. Ce run global n'est pas déclaré PASS.

Contre-revue indépendante demandée avant validation native. Le contrôleur doit tester un vrai gate/receipt/review, les expirations réelles et les refus courants; aucune activation n'est inférée de cette préparation.

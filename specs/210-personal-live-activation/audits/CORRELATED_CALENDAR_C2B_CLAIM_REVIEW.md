# C2b — revue bornée de la prise d’approbation corrélée

Date : 2026-09-10. Relecteur : lane `android_permission_readiness`.

## Verdict

GREEN pour le périmètre local lu et testé. Aucun nouveau défaut concret trouvé. Cette relecture par une autre lane ne constitue pas une validation indépendante de qualité du modèle, une preuve PostgreSQL, une approbation humaine observée ou un appel Google.

Source gelée : `src/server/personal-assistant/correlated-calendar-approval.ts`, SHA256 `7f1eff053d3f2317a5f6a97462dd1ae44b09d990eedb5a65299d7f0bf333aa25`.

Le contrat backend, le gate C2a et SQL79 ont été lus dans la campagne précédente. La source C2b finale et ses 62 tests auteur ont été relus intégralement. SQL79 reste inchangé. Le nouveau fichier du relecteur est `test/correlated-calendar-approval-claim-review.test.ts` uniquement.

## Points vérifiés

- Commande, acteur, budget et valeurs retournées par le gate sont capturés avant leurs attentes suivantes. Le signal initial reste un canal vivant, mais remplacer la propriété `signal` du budget appelant ne remplace pas le signal capturé.
- La limite originale de 25 secondes et la phase de 5 secondes incluent l’attente avant le callback transactionnel. La limite monotone empêche le recul de l’horloge murale de renouveler cette phase.
- Le verrou UPDATE de l’opération vient avant l’INSERT de l’approbation. Le CAS lie les valeurs exactes, marqueur, demande, hash, lease et état typé. Les échecs restent des exceptions dans la transaction appelante, pas des déclarations de rollback déjà confirmé.
- La lease INSERT est un instant fixé à partir de l’horloge DB déjà observée et du budget restant, pas `clock_timestamp()` tardif plus une nouvelle durée. Le RETURNING est contrôlé contre cette borne et les dates réelles retournées alimentent l’état A.
- Un replay exact fournit uniquement `ALREADY_ATTEMPTED`, sans claim, sans gate courant et sans écriture. La lecture C3 avec propriétaire courant appartient toujours au futur wrapper après la transaction ; ce retour seul n’est pas une réponse historique autorisée au client.
- Aucun token, exécuteur, réseau ou lecteur C3 n’est invoqué par cette fonction. Le succès neuf conserve `CLAIM_CREATED_NOT_COMMITTED`, `committed:false` et `executionAuthorized:false`.

## Preuves exécutées par cette lane

À 15:25:41, Vitest : **70/70 PASS** = 8 contre-tests nouveaux + 62 tests auteur. ESLint du nouveau fichier : exit 0.

Les huit contre-tests utilisent la vraie fonction C2b et les vrais contrats purs A, mais un gate et un transport SQL simulés :

1. Trois décalages DB/app (0, +1h, −1h), 400 ms avant INSERT et 900 ms pendant INSERT : la lease est exactement l’ancre DB + 24 600 ms, pas une durée renouvelée après INSERT.
2. Remplacement réel de `budget.signal` sur un clone mutable pendant la dernière attente puis annulation du signal original : refus après le CAS provisoire.
3. Contrôle inverse : annuler seulement le nouveau signal substitué ne modifie pas le signal déjà capturé.
4. RETURNING avec une lease dépassant d’une milliseconde l’argument SQL fixé : refus avant le CAS.
5. Plus de cinq secondes consommées avant le callback puis horloge murale reculée : refus avant toute requête.
6. Replay exact UNCERTAIN avec STORE/pilot arrêtés : aucun nouveau gate, claim ou write.

La correction de lease avait déjà été faite par l’auteur après son RED observé à 15:19:00 (+26 000 ms contre +25 000 ms). Cette lane ne revendique pas avoir exécuté ce RED ; ses contre-tests sont post-correction. Le test auteur nommé remplacement du signal n’effectuait pas ce remplacement : le nouveau test le fait explicitement, sans présenter cette lacune de test comme un défaut produit.

Tsc partagé lancé après ces tests : exit 1, uniquement erreur de syntaxe dans la fixture native main alors en cours d’édition, `temporal-registry.postgres.test.ts:718:98-99` (TS1005 / TS1109). Aucun diagnostic de type du reviewer n’est certifié par ce run interrompu au parsing. Le contrôleur a été prévenu ; aucun fichier d’autrui modifié.

## Limites / suite du contrôleur

Ces mocks ne prouvent ni les locks SQL, ni les contraintes différées, ni la conservation transactionnelle après rollback ou perte de commit. Le contrôleur possède les fixtures et l’exécution PostgreSQL natives. Le wrapper C2c devra conserver les deux deadlines originales après commit, séparer replay/C3 de dispatch, et ne jamais exécuter un résultat provisoire ou réessayer silencieusement un résultat inconnu. Aucun fournisseur, déploiement, secret réel ou appareil n’a été utilisé dans cette revue.

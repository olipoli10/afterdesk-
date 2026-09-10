# Revue du registre et du cycle de vie mobile d'approbation — GREEN borné après six RED

2026-09-10, lane `android_permission_readiness`. Source auteur `personal-correlated-calendar-approval-attempts.ts`, contrat mobile associé et plan storage2000bytes/origin/Unicode lus intégralement. Propriété relecteur : `apps/mobile/test/correlated-calendar-approval-attempts-review.test.ts` et cet audit. Aucun code de production modifié.

## RED observé, pas une hypothèse

À **16:12:48 : 6 PASS /2 FAIL** sur huit contre-tests exécutant le vrai registre et un adaptateur SecureStore synthétique :

1. Après vingt réservations de reviews distinctes toutes échouées au getItemAsync, la vingt-et-unième lit encore le store au lieu de refuser CAPACITY. Chaque échec est déjà ajouté au Set conservateur non borné.
2. Même comportement pour vingt-et-un scopes owner distincts : Map globale non bornée.

L'auteur avait gelé sa source pour cette reproduction et accepté le contrat de réparation : vingt identités maximum par scope, sentinelle de saturation persistante en mémoire sans éviction ; vingt scopes de réservation maximum dans le runtime puis saturation globale. Les lectures/historiques doivent rester disponibles sans créer de nouveau scope de réservation. Correction auteur attendue avant verdict.

Les tests observent le refus avant nouvelle I/O, pas une mesure de heap native. Le module ne peut pas prétendre un CAS SecureStore multiprocessus ; sa sérialisation couvre un seul runtime JS.

## Six contrôles déjà verts

- Unicode malformé/NUL refusés ; NFC/NFD, replacement character et paire emoji restent distincts ; origine API distincte produit clé distincte.
- Latch avant le premier await partagé entre deux instances/remontages et non contourné par un nouveau fingerprint.
- Write non persisté/read-back ancien refusé ; latch conservé même quand load retourne un blob vide.
- Scope perdu après write : marker conservé, continuation refusée, aucune suppression.
- Cap2000 mesuré en UTF-8, pas nombre de caractères ; dépassement avant set.
- Dismiss avec DTO CONFIRMED purement local retire les métadonnées mais ne supprime pas le latch dans le runtime : impossible de réarmer cette review par cette voie.

## Frontière de dismissal non encore validée

`dismissConfirmed` ne certifie pas l'origine serveur du DTO, seulement sa forme et sa portée structurelles. Sa sécurité produit requiert un caller réservé à un geste explicite suivi d'un **nouveau C3 GET**, validé dans la même portée/session/génération, jamais un résultat POST mis en cache ou un objet local arbitraire. Le lifecycle n'était pas encore écrit lors du premier run ; cette frontière reste à relire/tester. Aucune approbation ne découle d'une suppression de métadonnées ; après relance, C3 doit précéder toute nouvelle offre.

## Autres limites de mémoire à ne pas confondre

Les queues `tails` en attente peuvent retenir plusieurs scopes si le caller produit des loads concurrents dont le store ne répond jamais. Un cap des tombstones n'est pas à lui seul une preuve que toutes les opérations en attente sont bornées. L'auteur a été prévenu : borne de concurrence du caller actif ou borne de file explicite à vérifier, sans inventer une garantie globale ni ajouter de mécanisme non arbitré.

Pas de SecureStore natif, appareil, HTTP, fournisseur ou DB utilisé par ces tests. Les claims de capacité plateforme et de persistance réelle restent absents.

## Deux RED lifecycle confirmés

Nouveau fichier reviewer `apps/mobile/test/correlated-calendar-approval-lifecycle-review.test.ts` : **16:16:01, 2 PASS /2 FAIL**, vraie machine de cycle de vie avec API/registre synthétiques et horloges injectées. Deux hypothèses signalées initialement par le contrôleur sont désormais reproduites :

1. `approve` résout après expiration des horloges wall/monotone alors que le timer n'a pas encore tourné : le lifecycle publie RESULT/CONFIRMED au lieu de UNKNOWN/null. Le timer ne peut pas être l'unique garde de fraîcheur après attente/parsing.
2. Après un historique RESULT sans offer mais avec marker, `isCurrentScope()` devient false avant le callback React pause : getSnapshot rend encore résultat, reviewId et marker au lieu de les masquer immédiatement.

Les positifs du même run vérifient qu'une dismissal relit C3 plutôt que d'utiliser le POST confirmé en cache, et qu'un listener reentrant qui pause à SENDING empêche toute réservation et tout POST. L'auteur est propriétaire des corrections ; aucune source lifecycle modifiée par le reviewer. Les cas post-persistence/expiry et réactivation même scope seront ajoutés après correction des deux RED, selon instruction du contrôleur.

## Corrections et troisième RED lifecycle, conservés chronologiquement

Les quatre premiers défauts passent après correction auteur : **12/12 à 16:17:27**. Le registre borne les identités et scopes en mémoire, sans éviction de tombstones ; les opérations sérialisées sont aussi bornées à vingt en attente par clé et vingt clés simultanées. Le lifecycle vérifie la fraîcheur après réponse et parsing, et masque indépendamment tout snapshot quand le scope n'est plus courant.

**16:18:22 : 6 PASS /1 FAIL** dans les sept contre-tests lifecycle étendus. Une réservation finit d'écrire après que le timer a expiré l'offre : le marqueur existe dans le store mais reste absent du snapshot. Aucun POST ne part, mais le panneau d'historique n'est pas accessible sans remontage. Les deux nouveaux positifs (pause/réactivation même scope et perte de scope pendant POST) passent.

Correction auteur relue : le `finally` de send ne recharge que les métadonnées, seulement pour l'instance encore active, son scope courant, la génération exactement `epoch + 1`, la même review sélectionnée et l'état UNKNOWN/EXPIRED. La même condition est revérifiée après load. Ni offre, ni texte expiré, ni nouvel envoi n'est rétabli. Deux contre-tests supplémentaires font intervenir une nouvelle lecture de la même review ou une perte de scope pendant ce load : le snapshot ultérieur reste exactement inchangé.

## Verdict final sur cette tranche

- **17/17 contre-tests reviewer PASS à 16:22:28** : huit registre et neuf lifecycle.
- **81/81 ciblés PASS à 16:23:15** : ces deux fichiers plus les trois fichiers auteur contrat/registre/lifecycle. TypeScript mobile et lint des deux fichiers reviewer : exit 0.
- SHA256 registre : `b4caafa68ac38fa6f975090d9d1d8cf3096de9ff06188d1330e671b3b9f74110`.
- SHA256 lifecycle : `bee87a982134b64fda3f1585bcf87fa4bacdacc5507cb8fa8d3936191819990e`.

Les mentions « attendu » ci-dessus décrivent les checkpoints RED, pas le verdict courant. Les cinq défauts reproduits sont fermés dans ces bornes. Le caller lifecycle relit effectivement C3 avant suppression explicite ; le helper bas niveau ne devient pas pour autant une preuve d'authentification du DTO. Les effets React, le panneau final, le transport HTTP réel et SecureStore natif ne sont pas prouvés par ces contre-tests. Aucune nouvelle autorité, approbation réelle, DB, build, export, appareil ou fournisseur n'a été utilisé par le reviewer.

## Contrôle additionnel de réentrance signalé par le contrôleur

**16:24:21, 9 PASS /1 FAIL** : après reserve et la publication synchrone du marqueur, un listener appelle pause puis activate sur le même scope. L'ancien send observe `!current`, mais la branche combinée `!current || !fresh` annule quand même la nouvelle hydratation et publie EXPIRED au lieu de IDLE. Réservation : une ; POST : zéro. Ce sixième RED remplace temporairement le verdict final ci-dessus ; ce n'est ni un effet fournisseur ni une nouvelle autorisation. L'oracle est ajouté dans le fichier lifecycle reviewer, sans édition de source ; l'auteur a reçu la reproduction et possède le correctif de séparation des gardes.

Correction auteur relue : `if (!current(...)) return` précède désormais la vérification de fraîcheur et toute annulation. Seule la génération encore courante peut publier EXPIRED. **82/82 ciblés PASS à 16:26:06**, dont **18 contre-tests reviewer** (huit registre, dix lifecycle), puis TypeScript mobile et lint reviewer exit 0. Nouveau SHA lifecycle gelé : `48179afc105de0f6ce2d92d4f1a7f86cdc99b6330684bb67146b36fc192a0870`. Le SHA registre reste inchangé. Les six RED sont maintenant fermés ; le verdict de revue est GREEN dans le périmètre pur décrit, sans prétention de test appareil ou de rendu final.

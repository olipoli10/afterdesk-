# Relecture indépendante des cinq cas natifs worker corrélé

2026-09-10 — reviewer `openrouter_disabled_adapter`. **GREEN borné pour le raccord effectivement testé; un manque d'oracle budgétaire reste explicite ci-dessous.** Relecture seulement, aucun lancement DB/tests ni modification de fixture ou production.

Relu le diff entier de `temporal-registry.postgres.test.ts`, ses helpers `actualAnsweredQuestion`, `outboundFixture`, `waitForQuestionExpiry`, `answeredSnapshot`, les cinq nouveaux cas et l'audit contrôleur `SMS_CORRELATED_CALENDAR_WORKER_NATIVE_INTEGRATION.md`. Reçu actuel vérifié sur disque : `evidence/postgres-native-1789061210169/output.txt` contient 105/105 PASS et `PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED`; `result.json` finit à 2026-09-10T17:27:59.385Z. Ce sont des preuves exécutées par le contrôleur, pas par ce reviewer. Le texte « pending » de l'audit contrôleur était encore historique lors de ma lecture et doit être actualisé par son auteur.

## Assertions effectives

- **Accepté :** le vrai processPersonalSms appelle le hook réel; aucun appel au helper de préparation directe du test dans ce cas. Une seule relation est créée, le lecteur canonique retourne le brouillon privé et les deux SMS exacts. Source completed/1/leaseNULL, un ACK pending/0/non envoyé. Le replay NOT_PENDING laisse le snapshot opérations/question/receipts/expectations/budget inchangé et le compte de reviews à un.
- **OFF puis replay ON :** l'acceptation initiale ne crée pas de review; activer ensuite la préparation sur une source déjà completed ne relance ni traitement ni préparation.
- **Réponse refusée :** issue non ACCEPTED, source completed, aucune review; replay sans changement de snapshot. Le helper commun interdit une seconde interprétation par les mocks model/engine qui doivent rester inutilisés.
- **Révocation et expiry postcommit :** le spy enveloppe l'implémentation réelle de processSmsTemporalReply, il ne fabrique pas le reçu. Après son retour, le test révoque réellement le WRITE grant ou attend l'expiration par horloge SQL et pg_sleep borné sans réécrire les dates immuables. Le snapshot complet des opérations est pris avant de rendre le reçu au worker, donc avant le hook. Après ce hook, les opérations sont identiques, la source reste completed et aucune review n'existe.
- Le comptage du transport injecté prouve un seul appel du transport de la question. Ce n'est pas un espion universel de toute fonction réseau; l'absence de provider dans le chemin de préparation est aussi établie par la lecture source et les suites ciblées, pas par ce compteur seul. Aucun effet fournisseur réel n'est revendiqué.

## Premier échec préservé et correction d'oracle

La première attente externalTransportPerformed:false sur le SMS reçu était incompatible avec sms-inbox, qui enregistre true à l'entrée. Comparer à la valeur capturée avant le worker préserve correctement cette provenance historique; exiger false aurait imposé une réécriture incorrecte. L'ACK sortant neuf reste contrôlé séparément à false. Cette correction ne transforme pas l'injection locale en réception fournisseur observée.

## Manque concret de couverture, non défaut de production démontré

Dans le cas positif, `answeredSnapshot` (incluant budget) est pris **après** le premier worker. Sa comparaison démontre l'absence de changement au replay, pas l'absence de réservation pendant la première préparation. Dans les deux refus postcommit, le snapshot avant hook couvre PersonalAssistantOperation seulement, pas PersonalAssistantBudget, les receipts ou le ledger des attentes.

Par conséquent, ne pas attribuer à ces cinq seuls cas une preuve native générale « le hook initial et tous ses refus ne changent aucun budget/historique ». Les contrôles de source et unitaires sont des preuves complémentaires distinctes. Un renforcement futur borné peut prendre le budget/receipt/expectation snapshot au même point postcommit du wrapper, puis le comparer après le hook; le cas positif peut employer la même barrière de lecture avant sa préparation. Aucun renfort ni run n'a été effectué ici.

Les cinq cas ne démontrent pas une concurrence de deux workers, une perte d'accusé de commit du hook, ni un délai réseau dur. Les contre-tests synthétiques de latch restent pertinents mais ne doivent pas être renommés preuves natives. Aucun autre défaut concret bloquant trouvé dans les assertions et raccords relus.

## Renforcement contrôleur relu — manque précis soldé

Relecture du delta suivant et du reçu `evidence/postgres-native-1789061590545` : **105/105 PASS**, exit0, serveur STOPPED, fin **2026-09-10T17:34:18.581Z**. Exécution contrôleur seulement; aucun nouveau lancement par le reviewer.

`actualAnsweredQuestion` capture maintenant `budget()` avant le premier worker lorsque la préparation est ON, puis le compare après : le cas positif et les refus ON ne reposent donc plus uniquement sur un snapshot pris après la préparation. Ce snapshot porte sur les ids, réservations CAD et plafonds de PersonalAssistantBudget, pas sur tous les champs de tous les ledgers possibles.

Les deux wrappers postcommit capturent désormais aussi les receipts de la question, la question entière, le ledger des attentes de son namespace et le même budget avant de rendre le reçu réel au worker. Comparaison exacte après hook, en plus des opérations complètes déjà comparées. Cela ferme le manque d'oracle décrit ci-dessus pour la préservation de ces historiques et réservations dans les scénarios révocation/expiry testés. L'ancien constat est conservé comme historique, pas comme défaut restant.

Le full **301 tests / 20 clones**, reçu `postgres-native-1789061340125` rapporté par le contrôleur, **précède** ce renforcement. Ne pas le présenter comme un full intégrant ces nouvelles assertions; la preuve fraîche renforcée est le ciblé 105/105 ci-dessus. Les limites concurrence de workers, commit-ACK perdu et fournisseur réel restent inchangées.

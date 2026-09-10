# Forward79 — contre-revue indépendante pré-native B

2026-09-10 — `openrouter_disabled_adapter`. **GREEN pré-native, lecture SQL/Prisma et tests statiques seulement.** Aucun SQL, migration, génération ou PostgreSQL exécuté par le reviewer. Aucun moteur, recovery ou route produit modifié.

## Éléments relus

Lecture entière du plan backend, du SQL initial cd9380f0… puis de son delta final `05163ed1dae6a7421ea3c2a1ecbd83cc7ed2abce77d6fda2cb4d34869060e1f7`, du diff Prisma (21 lignes), des 17 tests auteur, des helpers natifs du contrôleur et des 16 nouveaux cas de protocole dans temporal-registry.postgres.test.ts. Migration78 appliquée inchangée; son SHA reste vérifié par le test auteur. Aucun patch du reviewer sur ces fichiers.

## Contraintes examinées

- FK unique composite approbation→review liant reviewId/calendarOperationId/workspaceId/userId en une seule relation; uniques simples sur revue, opération et nonce; noms SQL courts; Prisma singularité annotée. Les FK transitives existantes conservent l'opération canonique. Aucun FK sur une version de grant/membre mutable.
- Approbation INSERT-only, UPDATE/DELETE/TRUNCATE refusés. approvedAt remplacé par DB UTC tronquée à la milliseconde; expiry égal à la borne originale, lease strictement futur et limité à25s, sans changement des dates de préparation.
- Binding null-safe de l'opération, marqueur, request/hash legacy exact, fingerprint de vue, compte/version, budgetNULL et source/model lineageNULL. L'autorité WRITE est comparée au snapshot courant exact OWNER/membre/compte/credential/grant/scopes; elle n'est pas inventée à partir d'un enum libre.
- Discriminant global marker OU relation OU approbation. Legacy sans ces origines sort avant les restrictions typées. Les insertions pending restent sous78; les anciennes lignes corrompues/terminales ne sont pas adoptées ni backfillées par79.
- Claim processing1 exact et approbation dans la même transaction; relecture des dernières lignes au contrôle différé. Dispatch passe seulement CLAIMED→DISPATCH_CLAIMED après séparation des commits. Confirmation exige ancien dispatch et résultat déterministe exact; uncertain conserve l'origine mais ne promet pas absence d'effet. Les terminaux ne peuvent être rouverts; les no-op updatedAt restent possibles.
- Bookkeeping uncertain peut se faire après expiration/révocation, sans exiger à nouveau une autorité active. Ni nouvelle lease ni libération de budget. Le futur writer recovery doit encore produire cette union exacte; B n'a pas déjà modifié le recovery existant.

Les triggers n'acquièrent aucun advisory/namespace lock ni rowlock mutable supplémentaire. C'est important pour éviter calendrier→namespace dans les déclencheurs/recovery, mais **cela ne prouve pas la fraîcheur à l'instant HTTP**. Les futurs callsites doivent garder leurs verrous canoniques namespace→source/autorités→calendrier et leurs derniers checks après awaits. SSI et une comparaison de snapshot ne remplacent pas ces gates d'exécution.

## Écart de taille et parité corrigé avant le run reviewer

Le contrôleur a signalé que la borne32KiB de writeAuthority seule ne borne pas l'enveloppe d'état. Inspection confirmée; le reviewer a construit un vecteur JS à scopes Unicode où authority est <=32768 octets mais state >32768 et refusé par A. L'auteur a ajouté la borne sur le state canonique entier avant les phases. Il a aussi renforcé la cohérence standalone a↔v/fingerprint de state_valid; les triggers appelaient déjà binding, donc ce deuxième point n'était pas un bypass de transition démontré.

Ces corrections précèdent les runs reviewer. **Aucun RED PostgreSQL ni RED statique avant correction n'est revendiqué.** Le vecteur JS prouve la nécessité de la borne globale; le test statique vérifie sa présence et son ordre, pas l'exécution SQL.

La vue SQL normalise seulement son entier accountVersion connu avant hash, conformément au nombre JS, et reconstruit les constantes de présentation. Le request conserve le serializer historique six champs. Parité effective JSONB/Unicode/empreinte et state_valid sur PostgreSQL demeure une preuve native à obtenir, pas un résultat des recherches de texte.

## MVCC : raisonnement contrôlé, pas oracle universel de commit

Le choix `pg_xact_status` a été écarté correctement : PostgreSQL17 précise qu'un statut de sous-transaction peut ne pas refléter le commit du parent. `pg_current_snapshot` utilise le snapshot actif et n'expose pas les sous-XIDs dans sa liste. [Source PostgreSQL17 xid8funcs.c](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/utils/adt/xid8funcs.c).

La documentation décrit un snapshot stable en isolation forte et la visibilité des propres écritures non committées; xmin/xmax seuls ne sont donc pas des certificats de commit pour une valeur arbitraire. [Isolation PostgreSQL17](https://www.postgresql.org/docs/17/transaction-iso.html), [fonctions transaction/snapshot](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-PG-SNAPSHOT).

**Inférence bornée retenue avant test :** pour le xmin d'un tuple réellement SELECT-visible dans cette transaction SERIALIZABLE, l'ordre strict avant le xmax du snapshot distingue les tuples antérieurs des propres écritures top/subtransaction. La fonction n'est jamais proposée pour authentifier un XID caller arbitraire. age(xid) utilise la différence signée avec un XID stable et le cast xid8→xid conserve ses32bits; ce sont des primitives réelles, pas une reconstruction d'epoch maison. [Source PostgreSQL17 xid.c](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/utils/adt/xid.c).

Le reviewer n'a pas démontré ce raisonnement sur un serveur. Les cas TOP_XID déjà assigné, SAVEPOINT, RELEASE, outer write et SET CONSTRAINTS anticipé sont des conditions de passage natives indispensables, particulièrement pour ne pas réintroduire une préparation et son approbation dans le même commit. Un run refusé doit être conservé et investigué, pas masqué en assouplissant78.

## Relecture des fixtures natives du contrôleur

Les neuf premiers cas utilisent de vrais INSERT RETURNING approvedAt/lease, puis construisent les objets avec les helpers A. Trois zones testent empreinte et dates; les options NULL_AUTHORITY et WRONG_ORIGIN atteignent respectivement l'INSERT et l'UPDATE SQL; MISSING_CLAIM teste le commit et l'absence de ligne après rollback. Les positifs empêchent de conclure à partir de seuls toThrow génériques.

Les ajouts portent le protocole à16 cas : préparation et approbation dans la même transaction sous plusieurs formes d'XID, claim dans un SAVEPOINT released puis dispatch avant commit, dispatch dans un SAVEPOINT released puis confirmation avant commit, et deux connexions concurrentes. Les refus MVCC ont reached-booleans et messages précis pour éviter un succès dû à une erreur antérieure. Le second snapshot est pris avant la libération du premier, les PID sont distincts, les promesses sont observées par allSettled et les barrières sont bornées.

`syntheticApprovalTransition` fait délibérément un UPDATE test par id : il éprouve les guards SQL, **pas** le CAS de propriété du futur exécuteur. L'événement confirmé est TEST-CREATED, pas un reçu Google obtenu. Aucun défaut bloquant de fixture identifié à la lecture. L'exécution de ces cas reste entièrement au contrôleur.

## Preuve locale et verdict

Nouveau `test/correlated-calendar-approval-migration-review.test.ts` :7 cas indépendants, dont le vecteur de taille JS et les contraintes statiques de scope, historique, finalclock et absence de locks inversés.

Run indépendant **14:06:12 :127/127 PASS** (A auteur89 + A reviewer14 + B auteur17 + B reviewer7). Full TypeScript et lint ciblé reviewer ont ensuite terminé exit0. Ces127 ne sont pas le run128 de l'auteur ni des tests natifs.

**Aucun défaut critique restant identifié avant native.** Verdict limité au draft lu et aux invariants statiques. Le premier run contrôleur peut encore révéler syntaxe, comportement MVCC, sérialisation ou incompatibilité d'anciennes fixtures; rien ici ne préjuge d'un PASS SQL, de l'autorité d'un tap ni d'un appel fournisseur.

## Première exécution native du contrôleur et adaptation de deux anciens oracles

Contre-lecture indépendante de `evidence/postgres-native-1789063654307/output.txt` : PostgreSQL17.11, migrations appliquées, clone isolé portant le fingerprint `79:41de317b70655965d494f1c3e0ea5940`; fin **2026-09-10T18:08:47.3897968Z**, **119 PASS / 2 FAIL sur121**, puis `PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED`. Les **16 nouveaux cas B passent**, notamment les sous-transactions/release, les deux PID, les trois fuseaux et les transitions synthétiques. Ce résultat est exécuté par le contrôleur et relu ici, pas exécuté indépendamment par le reviewer.

Les deux échecs sont des différences précises de guard atteinte, pas une mutation acceptée :

- La tentative inchangée de mettre `correlatedTemporalReceiptId=NULL` est refusée avec PostgreSQL `P0001 / CORRELATED_APPROVAL_OPERATION_IMMUTABLE`, alors que l'ancien oracle attendait `CORRELATED_CALENDAR_MARKER_IMMUTABLE`. Le BEFORE guard79 refuse désormais cette même modification immutable avant celui de78. L'UPDATE, les deux refus de modification/suppression de la review et l'égalité du snapshot final restent inchangés; seul le texte attendu et son commentaire évoluent.
- La tentative inchangée de passer le draft fraîchement préparé à `processing/attempts1` dans la même transaction, sans approbation, est refusée dès l'UPDATE avec `P0001 / CORRELATED_APPROVAL_REQUIRED`, avant l'ancien contrôle différé `CORRELATED_CALENDAR_FINAL_PENDING_CHANGED`. L'oracle reste un refus exact, suivi du snapshot intégral inchangé et de zéro review committée pour le receipt. Il ne devient ni un `toThrow` générique ni une permission de claim.

**Verdict sur le diff : sens anti-régression préservé.** Les guards SQL79 correspondant aux erreurs ont été relus; le SHA SQL courant reste `05163ed1dae6a7421ea3c2a1ecbd83cc7ed2abce77d6fda2cb4d34869060e1f7`. Aucun SQL ni scénario d'entrée n'est modifié pour faire passer ces deux cas. Limite explicite : dans le premier run, leurs assertions finales de conservation n'ont pas été atteintes après l'échec de comparaison du message. Leur réussite après adaptation doit donc être constatée par le rerun, et non déduite des119 PASS. De même, ces cas ne prouvent plus isolément que le guard78 masqué est atteint; ils protègent le comportement final du protocole78+79.

Le full317 annoncé en cours n'est pas déclaré réussi dans cet addendum. Le reviewer n'a lancé aucun test/serveur et n'a édité ni fixture, ni source, ni schéma pendant ce run; seul cet audit est complété. Aucune confirmation Google, activation produit ou fraîcheur d'autorité au point HTTP n'est inférée de ces preuves de protocole SQL synthétique.

### Rerun complet maintenant observé

Lecture ultérieure de `evidence/postgres-native-1789063777614/output.txt` et `result.json` : **317 PASS,20 clones isolés**, tous exit0 avec le même fingerprint79, résultat global exit0 au **2026-09-10T18:13:01.013Z**, serveur arrêté. Le fichier temporal-registry termine **121/121 PASS**; les deux anciens cas figurent explicitement PASS aux lignes287 et289. Leurs assertions finales inchangées de conservation/rollback sont donc maintenant réellement atteintes. Ceci ferme la réserve du premier run119/2 sans effacer son échec conservé. Toujours aucune exécution native par le reviewer ni preuve fournisseur.

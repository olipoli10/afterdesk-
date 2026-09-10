# Approbation explicite corrélée — décision backend et plan exécutable

2026-09-10. **PROPOSITION — DESIGN TECHNIQUE SEULEMENT, GATE OFF.**
Décideur : contrôleur. Aucune implémentation produit, migration, génération,
activation, exécution SQL/native ou provider par ce document. La compétence
architecture a structuré l'arbitrage; revue croisée du même modèle, pas preuve
indépendante de qualité du modèle. Le raccord worker→préparation reste une tranche
distincte en validation native par le contrôleur.

## 1. Décision recommandée

**Une migration forward79 minimale pour une approbation immuable, et une union
résultat typée dans l'exécuteur calendrier existant.** Pas de deuxième exécuteur,
de `allowCorrelated`, de consentement implicite ou de réessai automatique.

FAITS vérifiés :

- SQL78 immobilise review, marqueur, contenu/destination et identité de
  l'opération; ses contraintes différées d'insertion imposent pending/0/resultNULL
  à la préparation. Elles ne valident pas les transitions ultérieures du claim ni
  une décision explicite du propriétaire.
- `approvalRecord` conserve actuellement nonce/autorité/dispatch dans result.
  `executeClaimedPersonalCalendarWrite` remplace ce result par le reçu au succès,
  puis par un objet différent en cas incertain. Une origine ajoutée seulement au
  claim/processing disparaîtrait sur ces deux chemins.
- `recoverExpiredPersonalActionClaims` garde l'ancien result à la racine et dans
  priorClaimResult, mais ajoute une autre forme. Fouiller récursivement un JSON
  historique n'est pas une preuve canonique de l'approbation applicable.
- Le loader de reçu actuel exige la fenêtre originale et les autorités courantes.
  Le réutiliser pour un reçu historique après expiration rendrait ce reçu illisible.

Options rejetées : JSON result seul sans migration (pas d'immuabilité SQL ni de FK
du choix); nouvelle copie complète des deux SMS/preuves (redondance sans invariant
utile); nouvelle queue/retry/intention de préparation (hors besoin); déblocage du
POST générique (mélange d'autorités et contournement du discriminant).

Une union JSON avec de nouveaux triggers pourrait être sûre, mais nécessiterait
quand même une migration et des guards plus complexes à travers tous les writers.
La petite table immuable isole l'identité de l'approbation de ses résultats mutables.

## 2. Frontières et contrats

Activation proposée : `ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED`
exactement true, **absente/OFF par défaut**. Elle ne résulte pas des flags de
préparation/lecture, d'un SMS, d'un hash client ou d'une attribution modèle.
L'approbation exige aussi les gates actuels de lecture/proof, le pilote explicite
et Google WRITE. La v1 read-only/list/carte reste inchangée.

Retenir pour la future route l'option du plan mobile : GET collection avec
`view=approval-v1`, réponse distincte `personal-correlated-calendar-approval-list-v1`.
POST sibling `/correlated-calendar-reviews/approve` et GET sibling
`/correlated-calendar-reviews/approval-result`. Aucun endpoint créé ici.

Commande POST fermée : version, workspaceId, reviewId, expectedRequestHash,
expectedReviewFingerprint. Aucun acteur, operationId, compte, texte/date, proof ou
`approved:true` libre. CLIENT/session vérifiée côté HTTP; **propriétaire courant
exact de workspace + membre actif owner**, pas l'admin legacy. Conserver les
protections session/origine applicables aux écritures authentifiées.

Une offre ne vaut pas approbation ni preuve que l'humain a lu. Le tap authentifié
sur cette commande est le seul nouveau choix explicite; le hash est une condition
d'égalité. Le packet et la review historiques gardent leurs false-authority flags.

### Fingerprint minimal, transitif et versionné

Helper pur proposé `fingerprintCorrelatedCalendarApprovalView` : SHA256 de
`canonicalJson` sur un objet exact et borné contenant :

```
version: personal-correlated-calendar-approval-view-v1
scope: {workspaceId,userId}
review: {reviewId,receiptId,reviewVersion,packetHash,proofHash}
request: {calendarRequestId,calendarRequestHash,connectorAccountId,accountVersion}
presentation: {itemVersion,evidenceVersion,titleNormalization,provenance:UNKNOWN}
```

Pas de inspectedAt, statut volatil ou horloge dans cette identité. packetHash lie
déjà les deux sources ordonnées, textes/hashes, citations UTF-16, résolution,
slot/ancre/fuseau; proofHash lie le draft exact et sa règle trim. Les versions de
présentation fixent les transformations body→text/rôles. Le constructeur n'émet
le hash qu'après le vrai loader et comparaison de l'item affiché à cette projection.
Il ne suffit pas de recevoir un objet portant ces noms. Tests de mutation de chaque
SMS/citation/slot/draft doivent changer/refuser l'offre, pas seulement tester SHA.

Le JSON complet des textes n'est pas recopié dans la table d'approbation. SQL79
peut reconstruire ce petit fingerprint depuis la review immuable et ses constantes
de version. Réutiliser les serializers validés (clé ASCII, JSONB ordre indépendant,
UTF-16/trim existants), pas JSON.stringify arbitraire ni nouveau normaliseur Unicode.
Le requestHash calendrier conserve séparément son ordre legacy exact à six champs.

## 3. Migration79 proposée — une table, aucune réécriture de78

Nom proposé `PersonalSmsCorrelatedCalendarApproval` :

- id (UUID text), reviewId UNIQUE, calendarOperationId UNIQUE, workspaceId, userId;
- approvalToken UUID UNIQUE généré serveur; fingerprintVersion, reviewFingerprint;
- approvedAt, approvalExpiresAt, leaseUntil en Timestamp(3) UTC explicite;
- writeAuthority JSONB exact/borné : même schéma de pins que le moteur WRITE,
  owner seulement. Pas de tokens/chiffrements/secrets, pas de scope READ substitué.

Pas de source/packet/proof/draft supplémentaire. requestHash/receiptId/destination
se retrouvent via la review immuable. La FK composite
`(reviewId,calendarOperationId,workspaceId,userId)` référence une contrainte UNIQUE
correspondante ajoutée à la review par79. Garder ses uniques simples existants et
vérifier les annotations Prisma de singularité (ne pas répéter P1012). Noms SQL
<64 octets. Les FKs RESTRICT empêchent suppression/substitution de l'historique.

Guards requis :

1. INSERT-only; UPDATE/DELETE/TRUNCATE refusés. approvedAt fourni est remplacé par
   DB clock UTC tronquée aux millisecondes; pas de backdate ni timestamp client.
2. INSERT sous opération verrouillée pending/0/leaseNULL/resultNULL, marqueur ET
   relation exacts, même propriétaire/compte/requestHash. approvalExpiresAt est
   exactement min(review.preparationExpiresAt, review.pilotExpiresAt); leaseUntil
   est > approvedAt et <= approvalExpiresAt, avec borne d'exécution <=25s.
   Le guard compare aussi le descriptor WRITE aux lignes courantes exactes
   workspace-owner/membre owner actif/compte/credential/grant WRITE/scopes et
   versions, pas seulement à des valeurs JSON proposées. Il ne verrouille pas
   ces lignes dans un ordre opposé au gate canonique qui précède l'insertion.
3. Dans cette **même** transaction seulement : insertion approbation puis CAS
   pending/0 → processing/1 avec ce nonce, cette lease et result de claim exact.
   Constraint trigger différé sur insertion relit les lignes finales et exige
   leur couplage complet. Ni approbation seule ni claim sans approbation ne commit.
   Sa dernière horloge DB doit encore être >=approvedAt et strictement avant
   approvalExpiresAt et leaseUntil; un claim expiré pendant son commit ne passe pas.
4. Nouveau guard des transitions d'opération corrélée : relation globale OU
   marqueur OU approbation globale suffit à exiger la branche typée. Aucun passage
   à processing/completed avec origine absente/substituée; pas de retour pending,
   attempts0, nouvelle lease/nonce ou nouvelle approbation après une tentative.
   dispatchStarted ne peut que false→true dans le même claim, une seule fois.
5. Terminaison processing→completed/uncertain uniquement avec même approbation et
   résultat fermé correspondant. Terminal confirmé/incertain immuable quant à
   statut, reçu et binding. Les champs hors périmètre restent soumis aux guards
   existants; aucun blocage des révocations compte/grant/workspace.
6. Assertions JSON null-safe (`IS DISTINCT FROM`, types, clés exactes), tailles
   explicites et pins égaux. Les checks SQL attestent cohérence des données, pas
   présence d'un clic humain ni appel réel Google.

Aucun backfill d'approbation depuis les brouillons existants. Un ancien état
terminal corrélé sans approbation conforme reste opaque/inéligible, jamais adopté.
Certaines fixtures historiques forçaient directement un état incertain pour tester
le rendu : elles devront créer cet état par le nouveau parcours autorisé/fake
transport ou tester séparément l'absence historique, pas contourner le nouveau
guard ni affaiblir l'oracle produit.

## 4. Fonctions précises et réutilisation du moteur

Nouveau module proposé `correlated-calendar-approval.ts` (personal-intent ou
personal-assistant : choisir un seul emplacement à l'implémentation) :

- `inspectCorrelatedCalendarApprovalOfferInTransaction(tx,input,env,context)` :
  vrai item/receipt loader inchangé, puis pins opération pending/0/leaseNULL,
  absence globale d'approbation, fingerprint et borne TTL. Aucun effet.
- `claimCorrelatedCalendarApprovalInTransaction(tx,command,actor,env,context)` :
  même inspection actuelle + hash client exact, OWNER strict, insertion immutable
  et appel du cœur de claim existant dans la même tx. Pas de token/provider.
- `approveCorrelatedCalendarReview(command,actor,env,context)` : snapshot avant
  await, nouvelle tx de claim; **uniquement son claim nouvellement acquitté** est
  passé à `executeClaimedPersonalCalendarWrite`. Si une approbation existe déjà,
  retour de son état via lecture, jamais reprise de l'exécuteur.
- `readCorrelatedCalendarApprovalResult(actor,reviewId,env,context)` : lecteur
  historique de métadonnées défini en section7, séparé du loader actif.

Dans `calendar-actions.ts`, conserver exports/signatures legacy et leur refus
global. Introduire une union fermée de claim interne : legacy inchangé OU origine
`{kind:personal_sms_temporal_receipt,approvalId,reviewId,reviewFingerprint}`. Les
champs ne sont qu'un handle non fiable : chaque gate les compare à la table SQL.
La branche publique générique ne reçoit jamais cette origine. Aucun booléen bypass.

Extraire seulement le cœur partagé nécessaire à claim/approvalRecord/lockWrite :
le gate choisit une variante legacy ou corrélée exacte. La variante corrélée appelle
le vrai contrôle canonique avant ses locks calendrier, puis charge l'approbation
immuable et compare request/nonce/lease/authority. Garder le même moteur :

1. claim local acquitté;
2. CAS durable dispatchStarted false→true;
3. chargement/refresh des tokens existant;
4. gate courant verrouillé, contrôle final après tout await et juste avant
   `client.insertEvent`;
5. Promise boxed, **aucune attente réseau sous locks**;
6. gate courant post-réponse puis CAS terminal exact, sinon incertain sans retry.

Le marqueur de dispatch conservateur ne prouve pas qu'un POST a réellement quitté
le process. Deux execute du même claim ne prennent qu'une fois ce marqueur; le
perdant ne ferme pas le gagnant. La perte du commit du marqueur conserve l'incertitude
et reste récupérable; ne pas transformer absence d'acquittement en retry.

### Dépendance token réelle, non cachée

`googleTokensForOwner` exige actuellement calendar_read et contrôle sa propre
readAuthority, même appelé par le moteur WRITE. **Première version : exiger ce
prérequis existant en plus de la vraie autorité WRITE** et rendre l'offre
indisponible s'il manque. Cela limite la disponibilité pour un compte write-only;
ce n'est pas une autorisation READ→WRITE. Aucun affaiblissement de ce loader ni
nouveau refresh path dans79. Une refonte capability-aware des tokens serait une
tranche séparée avec ses propres tests avant suppression de ce prérequis.

## 5. Ordre des locks et horloges

Chaque opération typée porte **un seul review** : pas de claim atomique d'une liste.
Prélookups scopés sans rowlock servent uniquement à trouver le namespace. Puis :

```
setup SERIALIZABLE/timeouts
→ namespace conversation canonique
→ question FOR UPDATE / reçu FOR SHARE
→ current proof : sources, OWNER/membre, modèle et compte/grants courants
→ review / opération calendrier / approbation
→ CAS et final DB clock
```

Cet ordre reprend le vrai loader, y compris son question FOR UPDATE. Ne jamais
appeler ce loader après avoir verrouillé le calendrier. Le item reader actuel
prend déjà un SHARE sur calendrier; un upgrade vers UPDATE n'est acceptable ici
qu'après le namespace exclusif commun qui sérialise les deux approvers. Test natif
deux backends obligatoire; ne pas généraliser la sécurité à un chemin sans ce
namespace. Legacy reste incapable de verrouiller/adopter un objet corrélé.

La récupération bookkeeping peut continuer à verrouiller uniquement les opérations
expirées (SKIP LOCKED) : elle ne demande ensuite aucun namespace/source/grant mutable.
L'approbation/review consultées sont immuables; ne pas ajouter une acquisition de
namespace après le rowlock dans ce chemin. Les révocations restent libres de bloquer
brièvement le gate puis d'être observées par la prochaine relecture.

GET offre et claim local : tx<=5s; phases d'exécuteur restent bornées courtes sous
le budget total **25s depuis entrée**, jamais25s renouvelées après le claim. Le
loader garde son propre cap5s; pas de transaction imbriquée. Choisir leaseUntil à
partir de DB now + budget monotone restant, plafonnée à l'expiration originale.
Toutes Date rawSQL contre Timestamp3 passent explicitement par UTC; garder les
SELECT véritables instants/JSON zonés comme instants. Copier Dates/objets avant
await. Délais, signal et gates ON sont recontrôlés à chaque frontière.

Règle conservatrice v1 : **aucune nouvelle approbation, départ ou confirmation
terminale après min(preparationExpiresAt,pilot)**. Une réponse Google reçue après
expiry/révocation reste inconnue localement si le gate terminal ne passe plus.
Ne pas allonger le TTL pour obtenir une réponse verte. Cette restriction peut
laisser un effet réel non confirmé; l'UX doit le dire et ne jamais réenvoyer.

## 6. Résultat durable et récupération

Pour la variante corrélée uniquement, résultat versionné strict :

- CLAIMED/DISPATCH_CLAIMED : origine approvalId + reviewId/fingerprint, même
  approvedBy/hash/token/writeAuthority que le moteur actuel, booléen dispatchStarted.
- CONFIRMED : même origine, reçu strict `{providerEventId,confirmed:true}` et
  automaticRetry:false. Le providerEventId doit correspondre à
  `deterministicGoogleEventId` de l'identité request existante.
- UNCERTAIN : même origine, writeConfirmed:false, reviewRequired:true,
  automaticRetry:false, raison fermée; aucune assertion « aucun effet ».

La table d'approbation reste la référence du choix; result ne peut la substituer.
`approvalRecord` et chaque CAS doivent utiliser cette même forme. Legacy conserve
exactement ses résultats actuels et ses comparaisons.

`recoverExpiredPersonalActionClaims` reçoit une branche corrélée étroite dans son
UPDATE atomique existant : même statut/attempt/hash/lease/result CAS, union UNCERTAIN
liée à l'approbation immuable, pas de reconstruction depuis JSON récursif. Les autres
kinds/origines gardent le code de récupération actuel. Aucun grant courant requis
pour ce bookkeeping, aucune release de budget, nouvelle lease ou exécution.

Matrice : crash avant claim commit → résultat non établi, aucune reprise implicite;
claim acquitté mais process perdu → processing puis recovery uncertain; marker commit
inconnu ou HTTP perdu → uncertain; terminal commit acquitté → confirmed durable;
terminal commit acknowledgment perdu → GET peut révéler confirmed, jamais re-POST.
Même dispatchStarted=false expiré n'est pas réessayé dans cette première tranche.

## 7. Lecture du résultat après expiration

GET résultat séparé, <=5s, private/no-store, actif sous la lecture corrélée existante
mais **sans exiger le flag d'exécution ON ni le pilote encore ouvert**. Il exige la
session/OWNER courant exact du workspace, correspondant au créateur de l'approbation.
Une déconnexion Google ou révocation modèle n'empêche pas de lire le reçu historique;
un transfert de propriétaire ne donne pas l'historique de l'ancien owner au nouveau.

Découverte scopée review→question namespace sans texte/lock; namespace canonique
puis owner/member actuels et jointure directe review→approval→operation en SHARE.
Vérifier mapping immuable, requestHash/UUID, fingerprint recalculé depuis metadata,
nonce/résultat typés et état terminal. Ne pas appeler `loadCorrelatedPersonalReceiptSubject`
ou l'item reader : pas de lecture des deux SMS expirés, pas de fausse prolongation
de provenance. Recontrôler scope/deadline/flags de lecture avant publication.

Sorties fermées proposées : CONFIRMED(receipt lié), PENDING_RESULT, UNKNOWN,
NOT_ATTEMPTED seulement pour un pending/0 sans approbation cohérent. Un processing
à lease expirée est UNKNOWN même avant maintenance. Tout état manquant/malformé/
legacy terminal non lié donne indisponible/inconnu, jamais confirmed. Aucun output
ici ne rend un pending approuvable : l'offre active reste une autre lecture.

Un reçu confirmé est une observation durable passée, **pas** une vérification
Google actuelle : pas de GET provider, preuve que l'événement existe toujours ou
autorité d'exécuter à nouveau. Le libellé mobile doit conserver ce temps passé.

## 8. Ordre d'implémentation et gates falsifiables

1. Contrôleur accepte ce contrat/79/lecture historique; sinon tout reste read-only.
2. Helpers purs fingerprint/claim/result fermés + fixtures JS↔SQL, pas de transport.
3. Forward79 + Prisma + guards/contraintes. Revue SQL complète avant application;
   validate/generate et natif uniquement par contrôleur. Aucun fichier78 modifié.
4. Claim typé + extraction minimale gate partagé + union terminal + recovery;
   garder générique fermé à tous ses exports, y compris fauxclaim execute.
5. Offre/result reader; route ensuite. Mobile ne reçoit un bouton qu'après les
   preuves backend natives; v1 demeure inchangée et approuvable nulle part.

Tests minimum avant GO local d'exécution synthétique :

- Pure : chaque champ fingerprint, ordre JSONB, UTF-16/surrogates/NUL, trim exact,
  pollution/extra clés, mutation pendant await, résultat lié à une autre review.
- SQL79 : INSERT seul, CAS seul, substitution/suppression d'approbation, nonce/lease/
  owner/compte/request faux, backdate, dédoublement, JSON null/extra, rollback,
  DELETE/TRUNCATE, anciennes lignes sans approbation, aucune mutation sources/ACK.
- Vrai parcours reçu→préparation→offre→commande→même exécuteur/fake Google : un
  claim/marker/POST, reçu exact. Deux vrais PIDs et barrière, second tap/replay/faux
  legacy/mauvais hash zéro nouveau départ. Pas de hausse de timeout pour passer.
- Gate avant HTTP : révocation après tokens/pendant JSONB fallback, compte/grant/
  credential/OWNER epoch changé, deuxième source/citation modifiée, expiry. Injecter
  une réponse dont le callback attend une recovery UPDATE pour prouver que le
  réseau n'est pas awaited sous locks. Late callback ne remplace pas recovery.
- Terminal/recovery : crash marker/non-dispatch, no-op CAS, commit inconnu, preuve
  d'approbation conservée et union stricte; zéro reprise/release. UTC, New York,
  Tokyo pour claim/lease/approvedAt/expiry/terminal/recovery.
- Historique : confirmed lisible après expiry et déconnexion Google, sans textes,
  nouvelle autorité ou credential load; autre owner/workspace refusé; malformed/
  unknown jamais succès; GET ne crée jamais approbation/claim/provider call.
- Compatibilité : toutes anciennes assertions Google legacy et confirmations SMS
  conservent leur sémantique; écriture normale owner/admin hors origine corrélée
  inchangée. Les seules nouvelles exclusions sont celles du typed discriminant.

Aucun de ces tests futurs n'est prétendu exécuté ici. Tests injectés ≠ provider
réel; native DB ≠ Samsung; cohérence DB ≠ preuve du geste humain.

## 9. Empreintes de lecture

Checkout `C:/dev/endvera-astra-r03`, HEAD au relevé
`b7cf70379e792511fa57df1ebee09ddbe446b6e2`; worker/hook WIP gelés dans une tranche
distincte. SHA256 des sources intégralement lues ou sections dépendantes indiquées :

| Fichier | SHA256 |
|---|---|
| SMS_CORRELATED_TYPED_APPROVAL_MOBILE_PLAN.md (entier) | 5719151e6860616c470dad96f405cc5a2317be126bfc9a28a5761c1eb453dd99 |
| calendar-actions.ts (entier) | 849af1a82a1fd385c44d9921a08807d2cc231a9639de6d7fe9320dd6a947da3a |
| correlated-calendar-projection.ts (entier) | 6c88bf836f350ebd1b61c39ea7d3492301216a2339aaadf1b957fcd0e87bb51b |
| correlated-receipt-subject.ts (entier) | b50ba50b74ca20388056360419ecc42166738c529d21264e86eb82cb6ffbed5e |
| SQL78 migration.sql (entier) | 2517fa32d1d4bb1ef2d8888ea82cf1df09cf0c6fe0c07549de12f447bf8b98ef |
| claim-recovery.ts (entier) | 6ad1047c53e8d7369f99d5bb0dbd92aed659bb7ea724cb72fbdc934c0022a536 |
| google-connection.ts (googleTokensForOwner lu) | 25f3a500aef7a6364e63e75641eeed717bc9746672b0f94122cb0eb9447b817f |

Autres lectures ciblées : temporalRegistryLockProof/CurrentProof, source authority
canonique, GoogleCalendarClient request/insertEvent, deterministicGoogleEventId et
prepareGoogleCalendarInsert. Aucun accès à des credentials ou appels réseau pour
cette analyse de code local.

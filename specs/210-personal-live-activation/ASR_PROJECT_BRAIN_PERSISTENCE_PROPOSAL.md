# Proposition de persistance — tranche Project Brain voix OFF

Statut : IMPLEMENTED_LOCAL_OFF. Migration75 appliquée uniquement dans des bases
PostgreSQL natives jetables, jamais sur la base distante; aucune activation.
Base de la tranche : `8a9ee0b4749903607539f58b6e095c5aa584f8e0`.

Preuves distinctes : première migration75 refusée42601 avant tout test dans
`evidence/postgres-native-1789028796787`; parenthésage PL/pgSQL corrigé puis
contre-revu. Retest source/session12/12 dans `postgres-native-1789028950461`;
suite native complète126/126,14fichiers,75migrations dans
`postgres-native-1789029010377`, terminée08:31:04.310Z. Aucun échec n'est réécrit.

Projection propriétaire ajoutée OFF :89tests ciblés rerun par un autre agent,
revue GREEN. Parent a ensuite ajouté trois scénarios natifs de lecture exacte,
tenant/révocation et expiration réelle sans réécriture :15/15 au total dans
`postgres-native-1789029811139`, terminé08:43:54.181Z. Les bases ont toutes été
arrêtées et conservées localement pour diagnostic. Stockage des octets source
simulé en mémoire; SQL/transactions/contraintes et horloge sont natifs.
Ce n'est ni une transcription ni une autorisation fournisseur.

## Tranche locale déjà codée

`voice/project-brain-subject.ts` recharge le propriétaire/membre actif, workspace,
projet, intake/version, source VOICE_NOTE, fichier et hashes. Il utilise le
lecteur interne R36V, puis recharge la liaison après lecture et compare son
fingerprint. Le wrapper public R36V conserve son audit de téléchargement ; le
lecteur interne ne prétend pas qu'un téléchargement utilisateur a eu lieu.

`voice/source-segments.ts` inspecte un manifeste injecté SYNTHETIC_LOCAL. Les
ordinals commencent à zéro, les plages sont contiguës et couvrent exactement la
durée source, les hashes sont recomputés sur les octets, les bornes du gateway
restent 45 s/2 MB/14 segments/28 MB. Il ne décode pas le média et le dit par
`mediaDecodingVerified:false`. Les fixtures ne sont pas des conteneurs audio.

Ces primitives ne créent aucune session, consentement, réservation, admission,
transcription ni action. Le type partagé de dispatch est inchangé. Leur résultat
ne dispense pas d'une nouvelle vérification courante au point d'utilisation.

## Changement de schéma minimal proposé

Réutiliser `VoiceIntakeSession`, `VoiceIntakeSegment`, `AiOperation` et
`VoiceTranscriptSegment`. Ne pas créer une table d'opérations parallèle.

Dans `VoiceIntakeSession` :

- Ajouter `subjectKind String @default("voice_intake")` et rendre `clientId`
  nullable, sans modifier les valeurs historiques.
- Ajouter des champs nullable : `requestedByUserId`, `workspaceId`, `projectId`,
  `intakeId`, `projectBrainSourceId`, `requestCommandId` (UUID),
  `sourceBinding Json`, `sourceBindingHash String`, `segmentManifest Json`,
  `segmentManifestHash String`.
- FK restrictive `requestedByUserId → User.id`.
- Ajouter une unique composite à `ConstructionProjectBrainSource`
  `(id, workspaceId, projectId, intakeId)`, sans modifier les lignes sources.
  FK restrictive de session `(projectBrainSourceId, workspaceId, projectId,
  intakeId)` vers cette unique. La FK existante source→intake→projet conserve
  l'isolation du tenant.
- CHECK à deux branches exclusives : `voice_intake` exige `clientId NOT NULL`
  et tous les nouveaux champs NULL ; `project_brain_voice` exige `clientId NULL`
  et tous les nouveaux champs NON NULL. Aucun propriétaire ne devient CLIENT.
- UNIQUE `(requestedByUserId, workspaceId, requestCommandId)` pour rejouer
  exactement une commande ; conflit de hash refusé, pas une nouvelle session.
- Première version volontairement bornée : UNIQUE simple `(projectBrainSourceId)`
  avec `@unique` Prisma correspondant. Le CHECK impose NULL aux sessions legacy,
  et PostgreSQL permet plusieurs NULL. Cette contrainte évite
  qu'une nouvelle commande fasse repartir les coûts d'une source incertaine.
  Une nouvelle transcription après terminal/purge ne sera pas supportée dans
  cette tranche ; elle exigera une politique distincte de reprise et budget
  agrégé avant de modifier cette contrainte. Pas de clause temporelle `now()`.
- Trigger immuable sur discriminant, demandeur, commande, FK, sourceBinding/hash
  et segmentManifest/hash. Le JSON doit avoir le contrat strict validé ; le
  trigger vérifie les identités scalaires, fileId/hash/MIME/size/durée contre la
  source canonique, et les éléments de manifeste contre les segments enregistrés.
  Les epochs de membre/workspace/projet sont un snapshot d'autorité, pas une
  contrainte empêchant leur révocation ultérieure.

Dans `VoiceIntakeSegment` : pas de deuxième identité ou champ de coût. Le
manifeste de session contient déjà ordinal/start/end/duration/hash/bytes/MIME.
À l'insertion Project Brain, vérifier sous verrou de session le membre exact
du manifeste et la somme des bornes, puis réutiliser le registre et le claim
existants. Le hash audio existant reste `sha256:<hex>` ; conversion explicite
depuis `contentHash` hex du manifeste, sans modifier les anciens fingerprints.
Pour la première version, session + manifeste + tous les segments sont admis
dans une transaction atomique ; un trigger différé peut prouver la couverture
complète au commit sans interdire les insertions intermédiaires dans la transaction.

Les defaults/writes Timestamp(3) ajoutés ou réellement utilisés par ce chemin
doivent suivre la convention UTC explicite de la réparation précédente. Aucun
backfill de dates ni changement silencieux de fuseau des tests.

## Consentement, octets dérivés et review : frontières restantes

Les colonnes de consentement existantes doivent être remplies depuis une
demande audio authentifiée actuelle et versionnée, jamais depuis ce resolver.
Le fingerprint de la demande lie sujet, manifeste, finalité, conditions de
rétention et enveloppe de coût. L'approbation d'une source R36V n'est pas une
autorisation fournisseur. Tant que ce contrat n'existe pas, aucune session
Project Brain de production n'est admissible.

La table de segments stocke des métadonnées, pas l'audio. Pour la tranche OFF,
les octets dérivés sont fournis par fixture et rehashés avant tentative. Une
reprise réelle après crash demande soit un transformateur local déterministe
reproduisant exactement les hashes, soit un stockage local protégé avec TTL et
références immuables. Aucun de ces choix n'est simulé par une URL arbitraire.

Une review durable est une phase ultérieure : table sidecar liée à la session
et à l'assemblyFingerprint exact, auteur, révision, texte corrigé protégé et
rétention explicite. Pas de modification de `transcriptionState`, snapshots
R36V, facts R36W/R36X ou du brief historique. Ne pas ajouter cette table avant
le contrat de review : la tranche minimale reste la préparation locale.

## Ordre d'implémentation et preuve requise

1. Revoir cette proposition et son CHECK exclusif avant migration.
2. Étendre le type de sujet central et tous les resolvers/claims/projections
   voice avec branche discriminée. Maintenir les refus exacts du portail legacy.
3. Ajouter migration locale puis admission OFF atomique avec injection synthétique.
4. Tests PostgreSQL natifs : deux tenants, owner/admin/revocation, source mutable
   refusée, faux CLIENT, combinaison FK croisée, commande/hash rejoué ou changé,
   deux sessions concurrentes pour la même source, manifeste/segment divergents,
   couverture au commit, tentative incertaine non relançable, conservation des
   budgets et fonctionnement UTC/New_York/Tokyo. Aucun test provider nécessaire.
5. Revoir séparément consentement, adoption du décodeur, coût/routage/retention et
   review. Publier une policy ou activer un fournisseur n'est pas une étape
   implicite de cette migration locale.

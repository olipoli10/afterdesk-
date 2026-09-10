# Contrat pur d'approbation corrélée — contre-revue indépendante A

2026-09-10 — `openrouter_disabled_adapter`. Périmètre : nouveau contrat pur et tests seulement. Aucune validation de DB, transition durable, calendrier, route, mobile ou fournisseur n'est déduite de cette tranche.

## Lecture complète et limites intrinsèques

Relu entièrement `src/server/personal-assistant/correlated-calendar-approval-contract.ts` et les 89 tests auteur, ainsi que l'implémentation de canonicalJson et le contrat Google eventId réutilisés. Versions VIEW/COMMAND/CLAIM/STATE fermées, données nested strictes, copie JSON avant publication gelée, bornes de taille/profondeur, refus des getters/structures non JSON, dates ISO UTC millisecondes et fenêtre historique du pilote ont été examinés.

La vue minimale lie son scope/review/request/presentation par hash; le futur loader doit reconstruire ces valeurs depuis les lignes canoniques immuables. Les inspecteurs relient commande→vue, claim→vue/request exact et état→claim. Le hash request reste l'ordre historique de ses six champs, pas le sérialiseur trié de la vue. Le reçu confirmé est lié à l'id Google déterministe réel. Toutes les sorties conservent authorityVerified:false, providerConfirmationVerified:false et executionAuthorized:false.

Ce module ne prouve pas qu'un approvalId/operationId existe ni que les phases se sont déroulées. Une forme CONFIRMED cohérente reste une donnée non authentifiée tant qu'elle n'a pas été rechargée depuis la persistance autorisée. Les comparaisons de dates sont historiques; aucune fraîcheur courante ou révocation n'est vérifiée ici. La future table INSERT-only, les guards de transition et les contrôles OWNER/Google restent requis.

## Défaut reproduit avant correctif : clé propre __proto__ perdue

Hypothèse initiale identifiée par le contrôleur, puis reproduite indépendamment : le walker snapshotJson admettait une own enumerable data key `__proto__`. canonicalJson reconstruit un objet avec `out[key] = ...` et cette clé disparaissait avant le Zod strict. Comparer la sérialisation parsed à la même sérialisation ayant perdu la clé ne détectait donc rien.

Nouveau `test/correlated-calendar-approval-contract-review.test.ts`, premier run **13:43:03 : 2 PASS / 12 FAIL**. Les deux contrôles prouvent que la fixture complète passe les vrais inspecteurs et que le sérialiseur existant perd effectivement cette clé. Les douze refus attendus échouent pour deux formes d'entrée (JSON.parse avec valeur objet; defineProperty avec valeur string) à six emplacements : racine view, scope nested, racine command, racine claim, origin claim, origin state. Chaque oracle vérifie que la clé est propre et que le prototype initial reste Object.prototype.

Portée exacte : contournement du refus des champs supplémentaires du contrat pur. Aucune pollution d'Object.prototype, authentification de source, autorisation d'exécution ou exploitation publique démontrée. Correction demandée à l'auteur : refuser `__proto__` dans le preflight **avant** canonicalJson. Aucun refactor du sérialiseur partagé, hash legacy ou SQL demandé. Reviewer n'a pas modifié la source auteur.

## Graphe d'import — vocabulaire de preuve

Les fonctions du contrat ne font pas de requête DB, d'appel réseau, de lecture d'environnement ou d'horloge courante. Cela ne signifie pas que leur **graphe d'import** est DB-free : evidence.ts importe @/lib/db, lequel construit/réutilise PrismaClient et consulte NODE_ENV à l'import. Le test statique auteur ne vérifie que le fichier direct. Demande de préciser ce titre/documentation, sans nouvelle extraction ni assertion qu'un simple import exécute une requête réseau.

## État de la revue

Au premier run ci-dessus, verdict **CHANGES REQUIRED** sur le refus __proto__. Le prochain résultat sera ajouté sans effacer le RED. L'admission durable, récupération, doubleclaim/dispatch et SQL79 sont hors portée de ce verdict A.

## Correctif relu et vérification fraîche

L'auteur a ajouté uniquement `key === "__proto__"` au refus du walker avant la sérialisation. La même garde s'applique récursivement aux objets imbriqués. Aucun changement de canonicalJson partagé ni du hash request. Le titre du test de dépendances précise maintenant les imports/appels **directs**.

Rerun indépendant **13:45:03 : 103/103 PASS** (89 auteur + 14 reviewer). Les douze mêmes oracles RED passent sans modification, ainsi que les contrôles positifs et le contrôle qui conserve le comportement historique du sérialiseur. Full TypeScript et ESLint ciblé du fichier reviewer ont ensuite terminé exit0.

Verdict final **GREEN pour A, contrat pur seulement**. Aucun autre défaut critique concret identifié dans la lecture complète. Ce verdict n'autorise pas la future persistance ou un effet calendrier; le graphe transitif Prisma et l'absence d'authentification restent explicitement documentés ci-dessus.

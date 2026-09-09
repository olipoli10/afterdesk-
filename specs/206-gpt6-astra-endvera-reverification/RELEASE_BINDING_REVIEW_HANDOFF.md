# Correctifs bornés après la revue Sol R2

État : correctifs et validations locales terminés; revue Sol R3 et génération
du manifeste après commit relèvent du parent. Ce document ne clôt pas la campagne.

## Périmètre traité

- PRR2-001 : racine nommée refusée si lien symbolique/jonction, avant realpath
  ou lecture; composants internes et fichiers ordinaires toujours contrôlés.
- PRR2-002 : `assertReleaseInputBinding` reste la preuve des seuls inputs nommés.
  `assertReleaseSourceBinding`, utilisé par write, CLI et emit-release-manifest,
  ajoute l'égalité du checkout tracked entier avec sourceHead. Une seule
  différence dérivée est permise :
  `release/endvera-construction-v1/release-manifest-v3.json`. Sans cette exception
  exacte, écrire la projection empêcherait de la valider contre son commit input.
- PRR2-003 : eas.json, mobile-build-readiness.json, leur validateur et le helper
  de contrat sont inputs hashés. Versions/identifiants, profils, status et flags
  false sont vérifiés statiquement, sans importer le runtime mobile.
- PRR2-004 : module mobile fermé à son export const littéral et son helper de
  label canonique. Diagnostics de parse, let, alias, déclaration supplémentaire,
  écriture ajoutée ou helper modifié sont refusés. La comparaison du helper est
  structurelle AST, pas une exécution de son code.
- PRR2-005/006 : validateurs native/mobile lisent par le même garde de fichiers;
  les assets du preflight sont également des fichiers ordinaires contrôlés.
- Delta demandé par le parent : mapping des routes canonique privé et gelé;
  seule une copie gelée est exportée. Ce n'est pas une isolation de processus.

## Validation enregistrée

| Record sous evidence/commands | Résultat |
| --- | --- |
| g3-release-r2-after | 47 PASS / 1 FAIL : erreur de refus de racine masquée par le catch d'input manquant; corrigé sans changer l'assertion |
| g3-release-r2-after-r2 | 48/48 PASS, incluant R35 et build-readiness |
| g3-release-r2-typecheck | Typecheck global PASS, 38.490 s |
| g3-release-r2-lint | Lint du périmètre PASS |
| g3-release-r2-mobile-validator | Validation statique locale PASS |
| g3-release-r2-native-validator | Preflight de configuration PASS; lignes binaires explicitement historiques |
| g3-release-r2-before-after | Reproduction arrêtée sur différence de hash des endings reconstruits; aucune équivalence de bytes inventée |
| g3-release-r2-before-after-r2 | Six écarts avant/après observés dans les fixtures bornées |

Le before du dernier record provient du texte source capturé dans le stderr brut
de g3-release-binding-correction-review-r2. L'empreinte de ce stderr est vérifiée
contre son command.json. La présentation numérotée peut perdre l'alternance
LF/CRLF originale : `originalBytesRecovered:false` est alors explicite, le texte
est rejoué en LF et n'est pas présenté comme un blob byte-identique. Les hashes
historiques ne sont ni modifiés ni recalculés sur des bytes normalisés.

## Limites conservées

- La racine explicitement fournie et ses ancêtres hors racine restent l'ancrage
  de confiance local. Aucun confinement OS ou défense contre un acteur hostile
  modifiant simultanément le filesystem n'est revendiqué.
- Les injections readFile sont des fixtures d'API, pas une autorité de preuve.
  Les entrypoints CLI/write utilisent les lectures par défaut. Aucun défense
  contre du JavaScript hostile déjà exécuté dans le même processus n'est annoncée.
- Le garde tracked détecte les différences de fichiers suivis, dont les layouts
  implicites. Les fichiers non suivis, le runtime, les données DB et node_modules
  ne sont pas prouvés par ce garde. Les fontes viennent du Next installé et
  épinglé; elles ne sont pas des blobs Git du projet.
- La présence/source d'une route et l'accord des métadonnées ne prouvent ni son
  résultat HTTP, ni une suppression de compte, ni une publication native.
- Aucun provider, client réel, signature, upload ou déploiement. Aucun commit,
  manifeste v3 ou artefact historique écrit par cette sous-lane.

Les fixtures temporaires étaient entièrement synthétiques et ont été retirées.
Le parent doit committer les inputs courants, générer une nouvelle projection v3,
puis faire valider l'entrypoint autoritatif sur cet état exact. Les anciens
manifestes et tous les records échoués restent conservés.

# G5/G6 — Fixtures et preuves locales auxiliaires

État du 2026-09-09. Document auxiliaire post-gel, sans rôle de contrat ou seal. `G6=NOT_APPLICABLE`, `providerRunStatus=NOT_STARTED`, `runtimeCandidate.access=UNPROBED`, baseline runtime non résolue. Zéro appel provider et zéro évaluation de sortie candidate dans ces vérifications. Le modèle demandé dans Codex n'est pas une preuve de modèle servi par un provider.

## Corpus gelé et contrôle fraîchement enregistré

96 inputs entièrement synthétiques en français québécois, huit familles avec chacune huit dev et quatre hidden : 64/32. Seize cas dev high-risk sont préparés pour un futur pilote; ce pilote n'a pas été lancé.

| Commande G5 fraîche | Observation native | Portée exacte |
| --- | --- | --- |
| `g5-corpus-frozen-verification` | exit 0; 768 self-checks synthétiques; 96/64/32/8 conformes; stderr vide | Formes, hashes, cardinalités, profils, grader et cas positifs/négatifs de contrat. Ce ne sont pas 768 appels de modèle ni une baseline produit. |
| `g5-local-oracle-denial` | exit 0; invariant `HIDDEN_ORACLE_ACCESS_DENIED=PASS`; stderr vide | 32 tentatives réelles de lecture hidden refusées par `ERR_ACCESS_DENIED` dans le processus Node permissionné, pas simplement fichiers absents. |
| `g5-local-synthetic-no-pii` | exit 0; invariant `SYNTHETIC_CORPUS_NO_PII=PASS`; stderr vide | Les 96 inputs respectent la convention synthétique fermée et les contrôles PII du contrat. Pas un détecteur universel de toute PII en texte libre. |

Chaque commande dispose de son descripteur sous `launch/<id>.json` et de `command.json`, `stdout.txt`, `stderr.txt` sous `evidence/commands/<id>/`. Le recorder conserve les octets natifs, hashes, temps, code de sortie et identité de campagne; aucun ancien fichier de preuve n'a été remplacé.

Le run initial oracle utilisait exactement `node --permission`, avec lecture autorisée uniquement pour l'entrypoint gelé et les deux manifests. Aucun dossier d'oracles n'était autorisé. Le run initial no-PII autorisait uniquement l'entrypoint, le manifest et les 96 chemins d'inputs exacts. Les métadonnées `replay` des descripteurs pointent vers l'entrypoint gelé et les seules dépendances nécessaires; ni stdout attendu ni réponse oracle n'est fourni comme argument.

Le `git diff --name-only HEAD` ciblé sur corpus et contrats corpus/local a retourné vide après ces runs. Les vérifications ont relu les manifests/hashes gelés; aucun input, oracle, profil, prompt, schéma ou grader n'a été adapté aux résultats G5.

## Huit familles : ce qui existe et ce qui n'est pas mesuré

| Famille — 12 cas chacune | Support déterministe observé dans le code / tests locaux | Ce qui reste non démontré |
| --- | --- | --- |
| CONTACTS | Cibles connues, ambiguïté → clarification, droits du snapshot, cap et déduplication | Résolution fiable des 12 formulations par un modèle et contacts réels à jour |
| CALENDAR | Capability-opération, propositions sans dispatch, références et ambiguïtés | Compréhension fiable des dates, fuseaux et homonymes par un modèle; calendrier réel |
| RESEARCH | Route candidate de planification, provenance et refus d'autorité | Recherche web exécutée, qualité/factualité/citations réelles, coût et latence |
| MULTI_ACTION | Ordre, DAG antérieur, plafond global action-cible, refus de doublons | Décomposition sémantique des demandes; exécution ou approbation multi-actions |
| AUTHORITY | Champs stricts, aucune promotion d'autorité, sorties non autorisées, rôles/classes de preuves | Authentification ou permissions fraîches via un repository réel dans l'inspection |
| RECOVERY | Replay et empreintes déterministes; tests locaux de limites/annulation distincts | Reprise provider fiable, annulation externe observée ou résultat réel après incident |
| PRIVACY | Politique code-owned, preuve accessible au rôle, fixture-policy no-PII | Certification de rétention/traitement provider, exhaustivité de détection de données sensibles |
| DICTATION | Admission sans perte, offsets, segmentation; multi-segments → clarification agrégée | STT réel, qualité audio, dix minutes mesurées, compréhension des corrections dispersées |

Ce tableau compare des capacités de fixtures et des unités locales; il ne signifie pas que chaque cas du corpus a été présenté à `guarded-intent.ts`. Les outputs du corpus suivent leur contrat gelé de bake-off, pas un pipeline produit branché à la nouvelle inspection.

Quatre textes longs distincts : `syn-dictation-01` 1 200 mots, `02` 1 254, `09` hidden 1 225, `10` hidden 1 235. Les huit autres sont des textes courts de référence. Les longs incluent des corrections, faits et distracteurs distincts; leur nombre de mots ne prouve aucune durée de dictée, capture audio, STT ou correction sémantique automatisée.

## Tests de l'extension : preuve distincte du corpus

`g5-gi-before` conserve six reproductions rouges (6 fail / 26 pass). `g5-gi-after` conserve 37/37 tests verts du module après correction. Un run local combiné avec les unités R36a a passé 56/56, mais cette observation ne remplace pas la suite complète fraîche ni la revue critique distincte. Le reviewer initial était source-only et n'avait exécuté aucun reproducer.

La réussite des checks de schéma ne valide pas la vérité sémantique. Le grader gelé utilise une égalité JSON canonique stricte, incluant l'ordre des tableaux : une paraphrase acceptable peut être notée incorrecte. Il mesure la conformité exacte au contrat de ces fixtures, pas une qualité générale du modèle. Aucun score hidden, gain de coût ou p95 provider n'est disponible.

## Statut à conserver pour le seal

- Comptes préparés : `developmentCaseCount=64`, `hiddenCaseCount=32`, `totalCaseCount=96`, `familyCount=8`.
- Comptes évalués/réussis, manifests baseline/candidat/grading, `providerVerdict` et `adoptionDecision` : `null`, puisqu'aucun G6 n'a eu lieu.
- Les deux invariants locaux ci-dessus sont observés et verts dans leur portée. **G5 global reste REWORK tant que la protection effective de l'environnement candidat n'est pas prouvée.** Ne pas transposer le refus Node en `candidateAccess=DENIED` pour un candidat non exécuté ou disposant d'autres lectures.
- Nouvelle inspection : non raccordée, `preview:null`, `PROPOSAL_INSPECTED_NOT_AUTHORIZED`, snapshots non authentifiés/fraîcheur non vérifiée, `executionAuthorized:false`; wrapper de stockage authentifié manquant.
- Aucun delta de roadmap, build-readiness, C2, real-test readiness ou Verified-E2E ne découle de ces fixtures. Les métriques finales sont à calculer par les rubrics G7; provider/client demeure `NO-GO` et aucune nouvelle couverture Verified-E2E n'est observée ici.

Une campagne provider future requiert mandat/budget distincts, profils callables nouvellement gelés, frontière candidate input-only réellement testée, outputs scellés avant oracle, rapprochement provider et revue finale. Aucun contenu d'oracle ne doit entrer dans les prompts.

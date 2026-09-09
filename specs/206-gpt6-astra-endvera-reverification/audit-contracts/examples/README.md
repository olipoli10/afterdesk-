# Exemples de scellement

Aucun faux scellement « valide » n'est committé ici. Le commit qui intègre la présente spec est `specHead`. Le `campaignHead` est un deuxième commit créé en G0, avant G1, qui contient en plus le corpus, les oracles, les profils et tous les contrats exécutables, incluant les 29 contrats de contrôles G1/G7.

La campagne crée son scellement réel dans `audit-evidence/` après avoir figé `CAMPAIGN_HEAD`. Le validateur exige la chaîne `productStart → specHead → campaignHead → finalHead`, que la spec soit présente au `specHead`, que tout le kit de campagne soit présent au `campaignHead`, et que ces blobs demeurent identiques au `finalHead`.

Les artefacts statiques utilisent `CAMPAIGN_HEAD_BLOB` ou `FINAL_HEAD_BLOB` et doivent correspondre octet pour octet au commit déclaré. Les preuves produites après le `finalHead` utilisent `RUN_GENERATED`, `sourceCommit:null` et un chemin absent du commit; cette distinction évite tout hash autoréférentiel ou toute fausse provenance.

Les preuves critiques ne reposent pas sur le seul journal de commandes. Chaque check G1/G7 référence une commande observée distincte et un wrapper `PHASE_CHECK` distinct. Le wrapper ne reçoit jamais le résultat : il relit le manifeste de contrats gelé, une `PHASE_CHECK_OBSERVATION` recoupée avec le journal, ainsi que les stdout/stderr manifestés; il vérifie les hashes, le hash de commande et les parseurs regex avant d'émettre `PHASE_CHECK_RESULT`. Ces wrappers, le grader, les cinq calculateurs de métriques et chaque invariant automatisé exposent un entrypoint Node versionné sous `evaluation-contracts/`; le validateur les rejoue avec `--revalidation-replay` et le permission model Node, sans réseau, écriture, child-process ni lecture hors de `replay.readPaths`, puis exige le même exit code et les mêmes stdout/stderr octet pour octet. Le résultat attendu lui-même est interdit dans `readPaths`. Les appels provider, eux, lient chaque commande `PROVIDER_CALL`, `REQUEST_RECORD`, nonce, cas, profil, enveloppe canonique, deux contrats `MODEL_PROFILE` gelés, réponse brute, sortie normalisée, endpoint et coût OpenRouter retourné. Une panne sans reçu produit `TRANSPORT_FAILURE` et `UNSETTLED_UNKNOWN`, jamais un faux coût zéro; le graphe refuse les tentatives ou artefacts orphelins. Pour un PASS seulement, le validateur relit chaque ID directement par les endpoints OpenRouter generation metadata/content et recoupe l'input exact, le temps, le nonce, la completion, le modèle, les tokens et le coût; la clé de gestion read-only n'entre dans aucun artefact.

Le validateur reçoit aussi le chemin du Brain canonique afin de vérifier séparément ses HEAD/TREE de départ et de fin :

```powershell
node ..\..\scripts\validate-revalidation-seal.mjs <seal.json> C:\dev\afterdesk-project-brain
```

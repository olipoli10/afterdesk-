# `/plan` — ENDVERA ADVANCED MODEL REVALIDATION R0

## Résultat visé

Utiliser le meilleur modèle avancé réellement accessible — GPT-6 Astra s'il est callable — pour revérifier ENDVERA, restaurer la cohérence locale et mesurer où ce modèle apporte un gain. Les contrôles déterministes et PostgreSQL gardent l'autorité; les preuves historiques restent immuables.

## Situation de départ figée

- `SOURCE_PRODUCT_HEAD` : `f7bef0ae593fd9ac70a065f76655e692cad61766`
- `SOURCE_PRODUCT_TREE` : `050c4149a8876a19083c5f27b69b8a619ef9ef69`
- Brain : `3a4e31d837ed4f53f8326d865fca43cc54eb4c3e`
- Brain tree : `cc3c8f00afa0bcb75127bb085689a6d8bfc4ab22`
- Root baseline : 13 tests rouges sur 2 431
- Mobile baseline rapportée : 195/195 verte
- R37 provider : `REWORK`, immuable
- Android v3 signé : construit; installation/login/permissions v3 non observés sur Samsung
- Roadmap : 22 %
- Build readiness : 46,75 % / 47 %
- C2 : 18/18
- Provider/client : `NO-GO`
- Verified-E2E : 0 %

Le commit qui ajoute cette spec devient `SPEC_HEAD`. Le worktree de campagne part de `SPEC_HEAD`, pas du `SOURCE_PRODUCT_HEAD`, afin que le plan, le goal, les schémas et les prompts existent. G0 prépare ensuite, avant toute mesure G1, le corpus, les oracles, les profils et tous les contrats exécutables, incluant les 29 contrats de contrôles G1/G7. Un commit de gel distinct devient alors `CAMPAIGN_HEAD`; G1-G7 s'exécutent uniquement contre ce gel. Cette séparation donne une preuve d'antériorité réelle et interdit de définir un test après avoir vu son résultat.

## Autorité de la campagne proposée

Autorisés après lancement explicite du `/goal` :

- lecture du Brain et du repo;
- worktree isolé;
- code, tests et documentation locaux;
- builds locaux et PostgreSQL jetable;
- données synthétiques;
- commits Git locaux;
- quatre lanes multi-agents parallèles;
- modèle disponible dans l'abonnement Codex, avec consommation normale du quota;
- checkpoint Brain local après validation complète, ou packet de checkpoint si le Brain n'est pas propre.

Interdits sans mandat séparé :

- données client/prospect;
- vrai SMS, appel, email ou calendrier;
- OAuth réel;
- achat de numéro;
- appel API/provider payé;
- secret dans prompt, log ou commit;
- push, Preview, Production;
- déploiement ou soumission store;
- modification rétroactive des preuves R37;
- hausse de métrique sans franchissement réel.

## Taxonomie canonique G0-G7

### G0 — Snapshot, accès et comparateurs

1. Vérifier que le HEAD courant égale `SPEC_HEAD`, que ce commit contient la spec 206 complète — plan, goal, schémas, validateur et quatre prompts — puis créer le worktree isolé depuis ce commit.
2. Créer immédiatement, avant la première commande G0 enregistrée, une `CAMPAIGN_IDENTITY` UUID avec `createdAt` à la seconde UTC, `SOURCE_PRODUCT_HEAD` et `SPEC_HEAD`; toutes les commandes de la campagne porteront cet identifiant.
3. Figer HEAD/TREE produit et Brain, arbres, backlog, queue et métriques.
4. Vérifier Codex >= 0.153.0.
5. Inventorier le catalogue sans appeler un modèle.
6. Produire `codexAstraProbe` avec une tentative Codex minimale et bornée : `REQUESTED_MODEL_OBSERVED` si `gpt-6-astra` est accepté, `UNAVAILABLE` s'il est refusé, trace `RAW_OUTPUT`, et toujours `servedModel:null`.
7. Produire séparément `codexAudit`, soit le modèle réellement demandé pour les quatre lanes. Astra peut être choisi s'il est accessible; sinon utiliser le fallback explicite sans bloquer le travail local. Chaque rapport doit reprendre `codexAudit.requestedModel`; le statut `NO_RUN_MODEL_UNAVAILABLE` dérive seulement du probe Astra.
8. Sceller séparément `RUNTIME_BASELINE_MODEL` : provider, endpoint, snapshot, prompt, schéma, outils, effort, timeout, tokens et fallback.
9. Garder `RUNTIME_CANDIDATE_MODEL=UNPROBED` tant qu'un mandat provider et un budget séparés n'existent pas.
10. Préparer les 96 entrées synthétiques, les oracles protégés, les profils de modèle, le grader, les calculateurs, les invariants et un manifeste `PHASE_CHECK_CONTRACTS` contenant exactement les onze contrôles G1 et les dix-huit contrôles G7. Chaque entrée fige le SHA-256 de la commande observée et des parseurs de stdout/stderr; seule l'entrée `NATIVE_CRASH_REPRODUCTION` peut autoriser `NOT_APPLICABLE` avec un motif vérifiable.
11. Valider tout ce kit, le committer avec la `CAMPAIGN_IDENTITY` comme `CAMPAIGN_HEAD`, puis interdire toute mutation d'un input, oracle, prompt, schéma, commande attendue ou contrat pendant G1-G7. Une mutation impose une nouvelle campagne.

**Gate** : une invocation Codex acceptée prouve seulement le modèle demandé. Aucune affirmation « modèle servi confirmé » ni « Astra runtime disponible » sans attestation API distincte.

### G1 — Baseline déterministe complète

Exécuter et conserver commande, stdout et stderr dans deux fichiers distincts, exit code, durée, taille et SHA-256 de chaque flux :

- tests, typecheck, lint et build racine/web;
- provider boundary et validateurs de release;
- tests, typecheck, lint, Expo Doctor et export mobile;
- migration PostgreSQL depuis zéro;
- upgrade depuis le dernier snapshot supporté;
- seed synthétique;
- démarrage et smoke des routes critiques;
- redémarrage et readback PostgreSQL;
- validateurs backlog, queue, manifest et hashes.

**Gate** : `PRODUCT_COHERENCE_BASELINE` est scellé avant mutation. Aucun juge AI ne peut convertir un exit code rouge en succès.

Un G1 `PASS` exige exactement les onze contrôles nommés et liés chacun à une commande observée distincte : `ROOT_TESTS`, `MOBILE_TESTS`, `ROOT_BUILD` — regroupant typecheck, lint et build racine —, `MOBILE_BUILD` — regroupant typecheck, lint, Expo Doctor et export —, `MIGRATION_CLEAN`, `MIGRATION_UPGRADE`, `SYNTHETIC_SEED`, `CRITICAL_ROUTE_SMOKE`, `POSTGRES_RESTART_READBACK`, `BACKLOG_VALIDATION` et `QUEUE_VALIDATION`. Chaque commande porte l'identité de campagne et le HEAD/TREE réellement testé; G1 doit viser exactement `CAMPAIGN_HEAD` et commencer après son commit. Un wrapper `PHASE_CHECK` distinct relit une observation structurée de la commande et ses deux flux, vérifie leurs hashes, compare le hash de la commande au contrat gelé, applique les parseurs stdout/stderr gelés et dérive lui-même le résultat. Le mot `PASS` n'est jamais un argument du wrapper. Le validateur répète ces calculs. Une absence, une réutilisation ou une commande non gelée interdit `PASS`.

### G2 — Quatre lanes d'audit parallèles

- canon/provenance;
- architecture/sécurité;
- mobile/UX;
- couverture promesse → route → test → preuve.

Prompts obligatoires :

- `audit-prompts/canon-provenance.md`;
- `audit-prompts/architecture-security.md`;
- `audit-prompts/mobile-ux.md`;
- `audit-prompts/product-coverage.md`.

Les quatre rapports distincts doivent être présents et valides selon `audit-contracts/finding-report.schema.json`.

Ces lanes ne sont pas appelées « indépendantes » si elles partagent le même modèle et le même harness. Chaque finding exige fichier, ligne, impact, confiance et reproducer. Une mutation exige un reproducer exécuté ou une deuxième confirmation avec preuve; `INFERENCE` et `UNKNOWN` ne déclenchent aucun patch. Un finding P0/P1 ne peut être fermé par le même modèle : son `CORRECTION_REVIEW` exige un humain ou un modèle distinct identifié et une preuve hashée.

**Gate** : findings dédupliqués, classés P0-P3 et liés à un test.

Chaque rapport G2 est lié au hash du prompt gelé, à une commande `MODEL_AUDIT`, à son stdout et à son stderr distincts. Le rapport doit être exactement le stdout hashé de cette commande. Une lane `INCOMPLETE` interdit G2 `PASS`; le modèle demandé dans les quatre rapports doit égaler `codexAudit.requestedModel`.

### G3 — Réconciliation locale bornée

1. Propager l'identité mobile v3 et le chemin `/account-deletion`.
2. Préserver les attestations historiques.
3. Régénérer seulement les projections courantes dérivables.
4. Créer une attestation supersédante versionnée lorsque l'identité change.
5. Préparer la modification Brain ou un packet, mais ne pas checkpoint avant la validation complète G7.
6. Reproduire les timeouts provider seuls et dans la suite complète, profiler, puis optimiser. Ne pas augmenter cinq secondes sans preuve.
7. Restaurer la suite complète.

**Gate** : la découverte R0a reste `REWORK_RECORDED`. Un run ID R0b post-correctif, frais et revu par une lane distincte, peut produire `PRODUCT_COHERENCE_RETEST=PASS`.

### G4 — Paquet d'observation mobile human-owned

La campagne autonome :

- lie l'APK au hash v3;
- prépare le lien, l'installation, le parcours unique et la collecte logcat;
- ne prétend pas avoir touché le Samsung.

L'installation/lancement/login/permissions réels requièrent Olivier, ADB/Appium ou une device farm. Sans cette preuve, enregistrer `DEVICE_OBSERVATION_NOT_PERFORMED`. Ce statut ne bloque pas la revalidation locale.

**Gate** : aucune déclaration appareil réel ni Verified-E2E sans artefact relié au build v3.

### G5 — Convergence du model-gateway et corpus

1. Inventorier les 22 fichiers du noyau `src/server/model-gateway/` et les bypasses provider directs.
2. Étendre le gateway existant en mode disabled/shadow; ne pas en créer un deuxième.
3. Conserver autorité, approbation et actions dans le code déterministe.
4. Utiliser les 96 cas déjà gelés au `CAMPAIGN_HEAD` : 64 dev et 32 hidden, huit dev/quatre hidden par famille.
5. Garder les oracles hidden dans un environnement grader inaccessible au candidat.
6. Remettre seulement les inputs/contrats au candidat et sceller ses sorties avant grading.
7. Valider que tous les inputs de corpus, l'`ORACLE_MANIFEST`, ses entrées et les contrats exécutables de grading, métriques et invariants correspondent octet pour octet au `CAMPAIGN_HEAD`; l'appel candidat ne reçoit jamais les oracles.
8. Versionner coût, latence, provenance, replay, prompts, outils et schémas.
9. Ne modifier aucun élément du kit gelé. Une correction du gateway qui exige de changer un input, oracle, outil, prompt, schéma, commande attendue ou contrat annule la campagne courante et impose un nouveau `CAMPAIGN_HEAD` avant de recommencer G1.

Le corpus référence deux contrats `MODEL_PROFILE` distincts et gelés comme `EVALUATION_CONTRACT`. Chacun épingle provider, endpoint, modèle, effort/reasoning, température ou absence de température, `maxOutputTokens`, timeout, prompt et tool schema. Ces valeurs sont exactes par profil et identiques pour tous ses cas; elles ne peuvent pas être ajustées appel par appel pour favoriser le candidat.

Un G5 `PASS` exige :

- un `CORPUS_MANIFEST` JSON avec `developmentCaseCount=64`, `hiddenCaseCount=32`, `totalCaseCount=96`, `familyCount=8` et les hashes;
- un `ORACLE_PROTECTION` JSON avec `hiddenOraclesProtected=true`, `candidateAccess=DENIED` et `oracleManifestSha256`, sans contenu d'oracle;
- deux invariants critiques rejouables `HIDDEN_ORACLE_ACCESS_DENIED` et `SYNTHETIC_CORPUS_NO_PII`, réellement observés et verts;
- `developmentCaseCount=64`, `hiddenCaseCount=32` et `hiddenOraclesProtected=true` dans le seal.

Sans G6, les comptes évalués/réussis ainsi que les manifests baseline/candidat/grading sont `null`. Après `FULL_BAKEOFF_COMPLETED`, les deux `OUTPUT_MANIFEST` portent `profile`, `developmentEvaluated=64`, `hiddenEvaluated=32`, toutes les répétitions hidden et `sealedBeforeGrading=true`; le `GRADING_MANIFEST` porte `outputsSealedBeforeOracleLoad=true` et les comptes exacts. Pour `PILOT_STOPPED`, les deux manifests ne contiennent que les appels et compteurs partiels réellement observés; le grading peut rester `null` si le lot hidden pairé n'est pas complet.

**Gate** : gateway disabled/shadow, zéro secret, zéro transport; hashes gelés avant reveal.

### G6 — Bake-off provider optionnel

Cette phase attend un mandat provider et un budget calculé distincts.

Sans mandat provider et budget distincts, enregistrer `G6=NOT_APPLICABLE`, n'effectuer aucun appel et continuer vers G7.

Le seal porte `providerRunStatus=NOT_STARTED`, `PILOT_STOPPED` ou `FULL_BAKEOFF_COMPLETED`. Si un seul appel a eu lieu puis qu'un breaker, un mauvais modèle servi, une panne ou un incident arrête le pilote, conserver les compteurs partiels, produire les deux manifests de sorties — même si l'un demeure vide — et sceller `REWORK`/`REJECT`; ne jamais exiger ou inventer le corpus complet. Chaque entrée garde `startedAt` et `finishedAt`; le validateur recalcule `durationMs` par soustraction. Un modèle servi différent reçoit `SERVED_MODEL_MISMATCH`. Une panne sans ID provider devient `TRANSPORT_FAILURE` avec tokens/coûts `null` et `UNSETTLED_UNKNOWN`; elle force `PILOT_STOPPED` au lieu de fabriquer un coût zéro.

Avant appel : PostgreSQL/workspace synthétiques jetables, tous les adapters d'action hard-disabled, egress limité au `POST https://openrouter.ai/api/v1/responses` pour le bake-off, au `GET https://openrouter.ai/api/v1/generation?id=...` pour les métadonnées et au `GET https://openrouter.ai/api/v1/generation/content?id=...` pour relier le nonce et la sortie, redaction validée, caps par appel, kill switch, fallback interdit et rapprochement usage/facturation. Chaque `REQUEST_RECORD` porte ce provider et cet endpoint; chaque coût est dérivé de `usage.cost` dans la réponse ou de `data.total_cost` dans le relevé `/generation`, avec tokens et modèle recoupés. Pour un PASS, le validateur refait les deux GET read-only pour chaque ID, compare fenêtre temporelle, nonce et completion, puis exige `providerReconciliationStatus=VERIFIED`; la clé de gestion read-only requise reste uniquement en mémoire dans `ENDVERA_REVALIDATION_OPENROUTER_API_KEY`. Si ce droit n'est pas disponible, la réconciliation reste `INCOMPLETE` et PASS est impossible.

La requête candidate est canonique et reconstruite par le validateur à partir du cas gelé, du prompt et du tool schema gelés : deux messages exacts `system`/`user`, payload utilisateur JSON `{requestNonce,caseId,profile,input,toolSchema}`, liste d'outils exacte, `max_output_tokens` plafonné et metadata `{requestNonce,caseId,profile}`. Le contenu relu chez le provider doit être octet-pour-octet équivalent à cette enveloppe; un ID provider seul ne suffit pas à relier l'appel au cas.

1. Avant le premier appel, calculer puis faire autoriser le worst-case avec tarifs frais des deux profils, tokens, retries, USD/CAD et réserve.
2. Sceller `authorizedBudgetCad`, `worstCaseBudgetCad`, `perCallCapCad`, `fxUsdCad`, `reserveMultiplier` et les artefacts `BUDGET_AUTHORITY`/`PRICING_EVIDENCE`; exiger `authorizedBeforeFirstCall=true` et `worstCaseBudgetCad <= authorizedBudgetCad`.
3. Exécuter les 16 cas dev high-risk, deux profils épinglés, une fois.
4. Promouvoir aux 64 cas dev uniquement si zéro violation critique, 100 % parseable, aucun fallback/retry imprévu et coût rapproché.
5. Exécuter exactement une requête par profil et par cas hidden unique; 32 cas exigent au moins 64 appels par répétition, avec ordre aveuglé. Pour chaque tentative, lier l'enveloppe `REQUEST_RECORD` redacted et la réponse JSON brute, puis vérifier séparément provider, ID provider, modèle demandé, modèle servi, endpoint et absence de fallback.
6. Utiliser les répétitions seulement comme mesure de stabilité, pas comme observations indépendantes.
7. Sceller les deux manifests de sorties avant de charger dans le grader l'`ORACLE_MANIFEST` déjà gelé au `CAMPAIGN_HEAD`, puis exécuter un grader déterministe versionné. Lier ses timestamps à la commande G6 et produire un `GRADE_RECORD` par cas qui référence l'oracle et toutes les sorties répétées. Le stdout de cette commande doit être un `GRADER_RESULT` JSON hashé couvrant exactement les 32 records; le validateur recalcule `gradeRecordSetSha256`, puis rejoue l'entrypoint Node versionné dans un environnement sans secrets et exige les mêmes bytes avant d'accepter le grading manifest.
8. Rapprocher `COST_RECEIPT`, imposer `maxObservedCallCad <= perCallCapCad` et `settledSpendCad <= authorizedBudgetCad`.
9. Mesurer coût par tâche réussie et durée end-to-end p95.

**Gate** : aucune réutilisation d'une ancienne clé, preuve ou autorisation R37.

Un `ADVANCED_MODEL_REVALIDATION_PASS` exige en plus un plancher absolu candidat de **24/32 cas hidden réussis**, avant tout calcul de gain relatif. Une amélioration relative sur une baseline très faible ne peut donc pas suffire.

### G7 — Attaques applicables, retest et scellement machine — toujours exécuté

G7 s'exécute après G5, que G6 ait été exécuté ou soit `NOT_APPLICABLE`.

1. Exécuter toute la matrice locale applicable; marquer les scénarios strictement provider `NOT_APPLICABLE` lorsque G6 ne roule pas.
2. Rejouer toutes les régressions.
3. Faire revoir chaque patch par une lane distincte.
4. Après les régressions, checkpoint le Brain seulement s'il est propre; s'il est déjà sale, ne pas l'écraser, conserver `brainFinalHead=brainStartHead`, produire un packet et sceller un résultat non terminalement vert.
5. Produire un rapport conforme à `audit-contracts/revalidation-seal.schema.json`.
6. Déclarer `serialization=RAW_UTF8_SHA256`, calculer SHA-256 sur les octets UTF-8 exacts et chaîner tous les artefacts dans un manifest; aucune conformité RFC 8785/JCS n'est revendiquée.
7. Pour chaque artefact, sceller `role`, `origin`, `sourceCommit`, `path`, `sha256` et `bytes`. Vérifier `CAMPAIGN_HEAD_BLOB` contre `campaignHead`, `FINAL_HEAD_BLOB` contre `finalHead`, et réserver `RUN_GENERATED` aux chemins non committés avec `sourceCommit=null`.
8. Conserver inputs, quatre prompts, quatre finding reports qui sont les quatre stdout natifs exacts, quatre stderr distincts, commandes, exit codes et durées dérivées de `finishedAt-startedAt`; inclure coûts, request IDs, `GRADER_RESULT` et modèle runtime servi uniquement si G6 a été exécuté.
9. Laisser `adoptionDecision=null` sans G6; permettre seulement `EVALUATE_ROUTER_POLICY` ou `DO_NOT_ADOPT` après un G6 réel. Un gain de modèle ne prouve pas encore le routeur; `ROUTE_SELECTIVELY` et `ADOPT_PRIMARY` sont hors rubric R0.
10. Produire un `INVARIANT_MANIFEST` avec identifiants uniques, `observed` et `passed`; chaque observation automatisée est le stdout d'un `INVARIANT_CHECK` rejouable, ou dépend d'une preuve device liée. Dériver les compteurs et interdire un PASS avec zéro invariant.
11. Recalculer séparément les cinq métriques canoniques. Le `METRIC_REPORT` recopie les six valeurs de départ et les six finales; chaque rubric lie un contrat versionné, un `METRIC_CALCULATION` qui est le stdout d'une commande G7 rejouable, et ses preuves. Le validateur exécute lui-même le replay, dérive `changedFromStart` et exige que `rubricCrossed` corresponde exactement au changement.
12. Si un incident est observé, exiger `INCIDENT_EVIDENCE` redacted et produire `REWORK`/`REJECT`; ne jamais invalider ou effacer le run. Un incident strictement G6 affecte le verdict provider sans contaminer le résultat local G0-G5. Balayer fail-closed le seal et tous les artefacts manifestés, incluant observation device et rôle `OTHER`, pour les formats de secrets et garder `secretsSerializedInSeal=false`.
13. Exiger un artefact `BRAIN_CHECKPOINT` ou `BRAIN_PACKET` liant les quatre HEAD/TREE Brain. Un packet conserve le HEAD initial et interdit un résultat vert.
14. Valider le Draft 2020-12 et les règles sémantiques avec `node scripts/validate-revalidation-seal.mjs <seal> C:\dev\afterdesk-project-brain`, puis conserver son output.

Un G7 `PASS` exige les contrôles nommés liés à dix-huit commandes observées distinctes et à dix-huit wrappers `PHASE_CHECK` distincts : webhook forgé, duplicate providerMessageId, double/stale approval, mutation après preview, onze destinataires, homonyme, DST, `OUTCOME_UNKNOWN`, permission révoquée, crash natif reproductible, fuite financière field worker, fuite cross-workspace, secret, JSON malformé, prompt injection, restart/readback PostgreSQL et validation statique des contrats. Chaque commande G7 porte la même identité de campagne, vise exactement `FINAL_HEAD/TREE` et est postérieure au gel. Chaque stdout est un `PHASE_CHECK_RESULT` structuré et rejouable qui identifie sa commande observée. Seul `NATIVE_CRASH_REPRODUCTION` peut être `NOT_APPLICABLE`, avec une commande observée de validation verte et une raison vérifiable lorsqu'aucun signal de crash reproductible lié au build n'existe; cela ne devient jamais une preuve device. Les contrats de phase, grader, métriques et invariants sont rejoués par Node avec le permission model : réseau, écriture et child-process interdits, lecture autorisée seulement aux dépendances explicitement manifestées dans `readPaths`. Une tentative d'accès hors contrat ou de lecture du résultat attendu échoue fermée.

Si un plafond d'appels, de tokens, de coût par appel ou de budget total est dépassé, le run reste scellable uniquement avec `INCIDENT_EVIDENCE.categories` contenant `BUDGET_BREAKER`, `G6.status=REWORK`, `providerRunStatus=PILOT_STOPPED` et verdict `REWORK` ou `REJECT`. Le validateur balaie les secrets sur les octets bruts avant même la validation de schéma afin qu'une erreur de parsing ne puisse pas recopier une clé dans ses diagnostics.

**Gate** : aucun résultat local ou provider terminal avant validation du scellement G7.

## Résultats permis

Sans provider :

- `LOCAL_REVALIDATION_COMPLETE_ADOPTION_NOT_EVALUATED`;
- `LOCAL_REVALIDATION_REWORK`;
- `LOCAL_REVALIDATION_BLOCKED`.

Statuts orthogonaux :

- `DEVICE_OBSERVATION_NOT_PERFORMED`;
- `NO_RUN_MODEL_UNAVAILABLE` seulement pour une sélection Codex réellement refusée; un runtime non autorisé reste `UNPROBED`.

Après G6 réellement exécuté puis G7 :

- `ADVANCED_MODEL_REVALIDATION_PASS`;
- `REWORK`;
- `REJECT`.

La décision d'adoption est séparée. R0 permet uniquement `EVALUATE_ROUTER_POLICY` ou `DO_NOT_ADOPT`. Après un succès R0, une campagne suivante compare trois bras sur une distribution synthétique représentative : baseline partout, Astra partout et routeur sélectif. Elle mesure exactitude de classification, fausse route économique/coûteuse, succès, coût par succès, p95, corrections humaines, retries et exceptions. `ROUTE_SELECTIVELY` exige ce test; `ADOPT_PRIMARY` exige en plus une future campagne powered distincte et dimensionnée.

## Critères d'arrêt

Arrêter et signaler uniquement si :

- décision conséquente non autorisée;
- secret/provider/budget réellement requis et aucune tâche locale ne reste;
- arbre source non réconciliable sans écraser du travail utilisateur;
- aucune tâche critique autorisée ne reste;
- G7 est scellé et validé avec G6 `NOT_APPLICABLE` pour un résultat local;
- ou G7 est scellé et validé après une campagne provider autorisée.

Un agent ne demande pas de `GO` entre deux tâches déjà couvertes. Il continue le travail indépendant pendant qu'une dépendance non bloquante manque.

## Ce qu'on ne construit pas

- nouveau site ou application complète;
- deuxième model gateway;
- route provider active sans budget;
- connexion Google/Twilio réelle;
- système de permissions maximaliste;
- système de vérité dans un prompt;
- rewrite des invariants solides;
- benchmark marketing contre ChatGPT.

## Résultats attendus

- baseline restaurée ou défauts exactement scellés;
- carte canonique des divergences;
- rapports sécurité et mobile;
- paquet d'observation Samsung sans preuve fabriquée;
- gateway existant réconcilié en mode disabled/shadow;
- corpus synthétique hashé avec hidden protégé;
- résultat local terminal sans attendre un budget;
- décision de routing seulement après mesures;
- zéro effet externe;
- Git produit propre et HEAD/TREE exacts; Brain propre avec checkpoint pour un résultat vert, ou Brain déjà sale conservé sans mutation avec `BRAIN_PACKET` scellé et résultat non vert.

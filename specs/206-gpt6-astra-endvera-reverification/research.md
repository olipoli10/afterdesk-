# ENDVERA + GPT-6 Astra — étude de levier, audit et stratégie d'adoption

**Statut** : proposition de campagne; aucun appel ENDVERA/Astra exécuté par la campagne 206

**Date de vérification** : 2026-09-08

**Produit observé** : `f7bef0ae593fd9ac70a065f76655e692cad61766`

**Tree observé** : `050c4149a8876a19083c5f27b69b8a619ef9ef69`

**Brain observé** : `3a4e31d837ed4f53f8326d865fca43cc54eb4c3e`
**Brain tree observé** : `cc3c8f00afa0bcb75127bb085689a6d8bfc4ab22`

## Verdict exécutif

GPT-6 Astra peut accélérer et améliorer ENDVERA, mais **la bonne décision n'est pas de remplacer tout le cerveau par Astra**.

La meilleure utilisation est triple :

1. **Astra comme auditeur principal de développement** pour relire le Brain, le code, les tests, les preuves, l'application mobile et les parcours de bout en bout.
2. **Astra comme générateur de cas adversariaux et critique de correctifs**, avec des validateurs déterministes et une revue de provenance distincte qui gardent l'autorité.
3. **Astra comme candidat runtime sélectif** pour les requêtes difficiles : langage québécois imprécis, contradictions, demandes multi-outils, longues pièces jointes, recherche et planification complexe.

Les demandes simples, les validations, les autorisations, les approbations, l'idempotence, l'isolation des workspaces et la vérité opérationnelle doivent rester dans du code déterministe et PostgreSQL. Astra ne devient ni la base de données, ni la permission d'agir, ni le juge unique de sa propre qualité.

La recherche a aussi trouvé une priorité plus urgente que la migration de modèle : **le dépôt courant n'a plus une baseline entièrement verte**. Une exécution fraîche de `npm test -- --run` a donné 13 tests en échec, principalement parce que l'identité Android v3 et les preuves dérivées n'ont pas été propagées partout. Astra est bien placé pour aider à réconcilier cette divergence, mais aucune puissance de modèle ne doit masquer un test rouge.

## 1. Ce qui est démontré, probable, hypothétique et inconnu

### FAITS

- Le nom officiel est **GPT-6 Astra**, pas « GPT-6 Astro » et pas « GPT-6 NVIDIA ».
- L'identifiant OpenAI documenté est `gpt-6-astra`.
- L'identifiant OpenRouter publié est `openai/gpt-6-astra`.
- OpenAI documente un contexte de 1 050 000 jetons, une sortie maximale de 128 000 jetons et les efforts `low`, `medium`, `high`, `xhigh`, `max`.
- Astra accepte le texte et les images, mais pas l'audio natif. Les appels et messages vocaux d'ENDVERA auront donc encore besoin d'une couche de transcription et d'une couche de voix spécialisées.
- Les sorties structurées, le function calling, le computer use, la recherche, MCP, le shell et `apply_patch` sont documentés.
- OpenAI indique 10 USD par million de jetons d'entrée et 50 USD par million de jetons de sortie en mode Standard. Batch et Flex coûtent 50 % du tarif Standard; Fast coûte deux fois le tarif applicable.
- Les requêtes de plus de 272 000 jetons d'entrée sont tarifées plus cher pour toute la requête. Le contexte millionnaire n'est donc pas une invitation à envoyer le dépôt complet à chaque texto.
- Pour les appels d'outils avec Astra, OpenAI recommande la Responses API. Une migration aveugle de l'ancien endpoint ou des anciens paramètres serait incorrecte.
- `temperature`, `top_p` et `top_logprobs` ne sont pas supportés dans la migration documentée; `none` n'est pas un effort Astra supporté.
- Astra requiert Codex CLI 0.153.0 ou plus récent. Le CLI autonome sur le PATH local est encore 0.148.0, mais le binaire réellement utilisé par l'application Codex a été revérifié à 0.153.4.
- Le catalogue callable de cette tâche expose maintenant `gpt-6-astra`. Une revue finale de la spec a été exécutée par un agent configuré avec ce modèle et a conclu `PASS` après plusieurs correctifs; cela prouve la sélection demandée dans Codex, pas une attestation serveur indépendante du modèle servi.
- Aucun appel runtime ENDVERA/Astra ou OpenRouter n'a été exécuté par cette étude et aucune dépense API ENDVERA/Astra n'est enregistrée. La revue Codex a consommé le quota normal distinct de l'abonnement.
- Le code ENDVERA courant ne contient aucun `gpt-6-astra`.
- Le chemin AI historique est fragmenté : plusieurs modules importent Anthropic directement, tandis que R37 possède un transport OpenRouter borné séparé.
- Le test OpenRouter R37 scellé demeure `REWORK`; ses preuves historiques ne doivent pas être modifiées pour introduire Astra.
- La preuve locale d'un APK Android v3 signé existe, mais son installation, son login et ses permissions sur le Samsung du fondateur ne sont pas encore observés.

### INFÉRENCES

- Astra devrait être particulièrement utile pour des audits longs et multi-fichiers, car le problème actuel exige de conserver simultanément le Brain, le backlog, le code, les tests, les preuves et les invariants de sécurité.
- Ses améliorations annoncées en compréhension de l'intention et en suivi de tâches longues ciblent directement deux irritants déjà observés : les interruptions inutiles et la perte du contexte global.
- Son coût et sa puissance rendent peu rationnel son usage sur chaque texto simple. Un routeur sélectif devrait produire un meilleur rapport qualité/coût.
- Les benchmarks génériques d'OpenAI rendent Astra prometteur, mais ne prouvent pas sa supériorité sur le français québécois, les autorisations ENDVERA, les calendriers ambigus ou les communications groupées. Seul un bake-off propre au produit peut le démontrer.

### HYPOTHÈSES À TESTER

- Astra comprend mieux les dictées québécoises imparfaites et réduit les demandes de correction du fondateur.
- Astra sélectionne plus souvent le bon outil et les bons arguments sur une demande multi-intentions.
- Astra détecte plus de contradictions Brain/code/preuves sans augmenter les faux positifs.
- Astra peut réduire le temps de diagnostic des erreurs Android sans déclencher de grand rewrite inutile.
- Astra améliore suffisamment la réussite par tâche pour compenser son coût et sa latence.
- Une architecture de routing sélectif bat un « Astra partout » sur le coût par tâche réussie.

### INCONNUS

- L'identité serveur effectivement servie derrière la sélection Astra dans Codex, faute d'attestation serveur indépendante accessible dans cette tâche.
- L'accès effectif du compte API ou OpenRouter destiné à une future campagne ENDVERA.
- La latence Astra réelle depuis le Québec et sur les volumes de contexte d'ENDVERA.
- Sa stabilité avec les schémas, outils et paramètres exacts du `model-gateway` existant une fois ses chemins legacy réconciliés.
- Sa qualité réelle sur le corpus ENDVERA tant que les cas, oracles et répétitions n'ont pas été exécutés.
- Le matériel exact utilisé pour servir Astra; aucune source consultée n'autorise l'appellation « GPT-6 NVIDIA ».

### DÉCISION

Adopter maintenant Astra comme **candidat et auditeur**, pas comme défaut runtime. Restaurer d'abord la cohérence de la baseline, auditer et converger le gateway provider-neutral déjà présent, puis geler une évaluation ENDVERA. Un gain du modèle mène seulement à `EVALUATE_ROUTER_POLICY`; la décision `ROUTE_SELECTIVELY` exige ensuite un test à trois bras du routeur. `ADOPT_PRIMARY` exige une campagne powered distincte et dimensionnée; R0 ne peut pas le produire.

## 2. Pourquoi Astra est pertinent pour ENDVERA

L'annonce d'OpenAI rapporte des gains sur le coding, le computer use, le long contexte, l'alignement et les tâches professionnelles. Ce sont des résultats du fournisseur, pas des preuves ENDVERA. Ils justifient un test, pas une adoption.

Les capacités pertinentes sont :

- **Long contexte** : faire une passe cohérente sur le Brain, les specs, les validateurs et les modules sans résumer trop tôt.
- **Computer use** : reproduire les parcours web et les surfaces mobiles accessibles à un émulateur ou à un navigateur, lire les erreurs à l'écran et vérifier la cohérence de l'expérience. Le Samsung physique exige encore ADB/Appium/device farm ou un geste humain avec logs; Astra seul n'y a pas accès.
- **Coding et migrations** : cartographier les duplications, proposer des seams et corriger de petits défauts avec tests.
- **Structured Outputs et outils** : produire une intention typée et des arguments validables plutôt qu'une réponse libre.
- **Suivi de tâche et steering** : continuer les branches non bloquées pendant qu'une décision conséquente attend, au lieu de transformer chaque étape en nouveau `GO`. Ce gain dépend du prompt, de la queue et du harness; Astra peut encore demander une clarification ou être arrêté par une protection, donc le modèle seul ne corrige pas le workflow.
- **Recherche** : traiter les demandes du type « trouve-moi un fournisseur » avec sources et provenance, séparément des actions sur les systèmes.
- **Création de documents** : extraire des plans, photos et documents de chantier en propositions structurées.

Le comportement de suivi ne doit pas dépendre seulement du modèle. OpenAI recommande explicitement de décrire dans les instructions que le modèle doit inférer l'intention, agir sur le travail déjà autorisé, persister jusqu'au résultat et réserver les approbations aux actions conséquentes. ENDVERA doit donc avoir un contrat d'exécution court et non contradictoire dans ses instructions, sa queue et ses gates.

## 3. État réel du produit avant toute revérification Astra

### 3.1 Git et roadmap

- Le produit était propre au HEAD/TREE source indiqués en tête de document avant la création du dossier 206. Le HEAD/TREE source n'inclut donc pas les présents artefacts de recherche.
- Brain propre au HEAD/TREE indiqués en tête de document.
- Backlog : 116 releases `DONE`, une release `CUT_BY_FOUNDER_DECISION`, trois releases `PLANNED`.
- Les étapes restantes sont R39C (pilote fondateur réellement activé), R39 (design partner) et R40 (Production V1).
- La queue locale courante est drainée. La prochaine étape n'est pas « inventer du travail » : c'est traverser les gates externes réelles ou préparer une campagne d'audit séparée sans falsifier la roadmap.

### 3.2 Dashboard canonique — inchangé

- strict canonical roadmap phase exits : **22 %**;
- local AI engine build readiness : **46,75 %**, 47 % affiché;
- C2 preparation : **18/18**;
- real provider/customer test readiness : **NO-GO**;
- Verified-E2E observed coverage : **0 %**.

Cette étude ne franchit aucun rubric externe. Aucune métrique ne change.

### 3.3 Preuve Android

La preuve la plus récente du dépôt indique :

- Expo Build ID `314d4f25-b907-4225-a3a2-56984b183330`;
- application 0.1.1, Android code 3;
- APK signé terminé;
- SHA-256 `0DC0D0918EE454AAE3D60E53ED94319B3FB5F2911FC1DF4E66948B2DA781641E`;
- `installedOnFounderDevice:false`.

Donc le binaire existe. Il n'est pas encore démontré qu'il s'installe, s'ouvre, se connecte et demande correctement les permissions sur le vrai Samsung. Une ancienne capture « ENDVERA keeps stopping » est un signal utile, mais elle n'est pas une preuve cryptographique que ce v3 précis plante.

### 3.4 Baseline racine fraîche

Commande observée :

```powershell
npm test -- --run
```

Résultat :

- 229 fichiers de tests réussis;
- 8 fichiers échoués;
- 2 415 tests réussis;
- 13 tests échoués;
- 3 fichiers et 3 tests ignorés.

Les causes observées :

1. `apps/mobile/app.json` est rendu à `endvera`, version `0.1.1`, Android code 3, mais des validateurs et tests attendent encore `endvera-mobile`, `0.1.0`, code 1.
2. Des hashes protégés dans les attestations de release ne correspondent plus aux inputs courants.
3. `whole-product-closure-audit.json` et `native-preflight-readiness.json` décrivent encore Android comme non construit. `whole-product-readiness.json` ne fait pas cette affirmation, mais garde des attestations périmées (`signed:false`, prochaine release R37 et hashes anciens).
4. Les tests de graphe provider R37L, R37M et R37N dépassent leur limite de cinq secondes dans la suite complète, même si le validateur provider autonome passe.
5. Le chemin public de suppression de compte diverge aussi : un test historique attend `/client/privacy`, tandis que la définition de release et le validateur courant attendent `/account-deletion`.

Ce défaut est exactement le genre d'incohérence transversale qu'un modèle plus fort peut repérer. Le correctif reste néanmoins soumis aux mêmes tests et aux mêmes hashes déterministes.

### 3.5 Carte de preuve locale

| Sujet | Preuve principale |
|---|---|
| Backlog et releases restantes | `specs/090-prepared-action-inspection/PROJECT_BACKLOG.json` |
| Verdict R37 observé | `specs/194-corrected-openrouter-retest/evidence/closeout.md` |
| Correction locale sans réécriture du verdict | `specs/195-r37-controller-contract-alignment/evidence/closeout.md` |
| Build Android v3 | `specs/205-founder-self-live-activation/evidence/founder-android-build-attempts.json` |
| Identité mobile courante | `apps/mobile/app.json` |
| Validateur natif périmé | `scripts/validate-endvera-native-preflight.mjs` |
| Assertions de release périmées | `test/construction-operating-assistant-r35-release-package.test.ts` |
| Projection whole-product périmée | `release/endvera-construction-v1/whole-product-readiness.json` |
| Closure Android non construite | `release/endvera-construction-v1/whole-product-closure-audit.json` |
| Preflight Android non construit | `release/endvera-construction-v1/native-preflight-readiness.json` |
| Gateway existant | `src/server/model-gateway/` |
| Appels historiques directs | `src/lib/ai.ts`, `src/lib/assistant-ai.ts`, `src/lib/ai-work-engine/` |
| Contrat R37 historique | `src/lib/construction-operating-assistant-r37/contracts.ts` |
| Dashboard canonique | `C:\dev\afterdesk-project-brain\ENDVERA_CONSTRUCTION_OPERATING_ASSISTANT_A_TO_Z_PLAN.md` |

## 4. Ce qu'il ne faut pas réécrire

Les éléments suivants représentent déjà une valeur structurelle et doivent être préservés :

- contrats stricts et schémas fermés;
- routing d'autorité déterministe;
- clarifications et refus pour les intentions mixtes;
- vérité persistante PostgreSQL;
- verrouillage, audit et isolation par workspace;
- transitions d'approbation;
- idempotence et reprise locale/synthétique des communications `PREPARED_UNSENT`;
- external capabilities désactivées par défaut;
- séparation `PREPARED_UNSENT` / transport réel;
- preuves scellées, même lorsqu'elles disent `REWORK`.

Un meilleur modèle ne justifie pas :

- un rewrite complet;
- une nouvelle UI entière;
- un nouveau système de vérité dans les prompts;
- l'autorité directe d'envoyer, appeler, payer ou modifier un calendrier;
- la réécriture de R37 pour faire disparaître son échec observé;
- l'augmentation des métriques sans observation physique/provider/client.

## 5. Architecture cible : deux usages séparés d'Astra

### 5.1 Astra dans Codex — développement et vérification

Dans ce rôle, Astra lit et modifie le dépôt sous l'autorité du plan, des tests et de Git. Il devrait être utilisé pour :

- l'audit canonique Brain ↔ backlog ↔ code ↔ preuve;
- la cartographie d'architecture;
- la génération de tests adversariaux;
- la revue de sécurité;
- le diagnostic d'interface et de crash;
- les migrations bornées;
- la critique de patchs d'un autre agent;
- la production d'un rapport traçable.

Effort recommandé :

- `max` : première passe architecture/sécurité ou contradiction majeure;
- `xhigh` : correctif difficile, revue indépendante, campagne adversariale;
- `high` : implémentation normale;
- `medium` : tâches bornées de documentation et analyse ciblée;
- `low` : transformations simples seulement.

Le niveau `ultra` n'est pas documenté pour Astra.

### 5.2 Astra dans ENDVERA — cerveau runtime candidat

Le repo possède déjà un noyau provider-neutral substantiel dans `src/server/model-gateway/` : politique, registre, dispatch, opérations, preuves, breakers, confidentialité et voix, répartis dans 22 fichiers observés. Il ne faut donc pas créer un deuxième gateway. Le problème est que plusieurs chemins historiques appellent encore directement un fournisseur, alors que la route OpenRouter R37 est une campagne séparée. Une migration sérieuse doit **étendre et faire converger le gateway existant**, puis éliminer les bypasses, avec :

- `modelProfileId` versionné;
- capacités requises : structured output, outils, vision, contexte, région;
- fournisseur et endpoint exacts;
- politique de rétention et de localisation;
- coût maximal par tâche et par workspace;
- timeout, retry et circuit breaker;
- fallback explicite, jamais silencieux;
- version du prompt et du schéma;
- provenance du modèle réellement servi;
- tokens, coût, latence et résultat;
- redaction de secrets;
- idempotency key et replay policy;
- mode shadow sans effet;
- refus ferme si le profil ou la permission manque.

Le modèle doit seulement proposer une intention structurée :

```text
message entrant
  -> admission/signature/workspace
  -> classification déterministe + proposition sémantique
  -> chargement des faits autorisés
  -> modèle sélectionné par politique
  -> sortie structurée validée
  -> politique d'action déterministe
  -> preview exact
  -> approbation humaine si conséquence
  -> outbox idempotente
  -> provider
  -> readback + audit
```

### 5.3 Routeur recommandé

| Classe de tâche | Moteur recommandé | Pourquoi |
|---|---|---|
| lookup exact de calendrier/contact | SQL + règles | source de vérité et faible latence |
| parser une commande simple | petit modèle ou classifieur déterministe | coût faible, contrat simple |
| ambiguïté date/heure/contact | modèle fort + clarification structurée | risque élevé d'erreur contextuelle |
| contradiction de chantier | Astra candidat + faits PostgreSQL | raisonnement multi-faits |
| recherche externe sourcée | Astra/research route dédiée | navigation et synthèse |
| message à 1 ou 10 personnes | règles + preview; modèle pour rédaction seulement | destinataires et envoi déterministes |
| modification calendrier | modèle propose; connecteur valide; humain approuve selon politique | séparation intention/action |
| appel vocal | STT spécialisé → routeur → Astra au besoin → TTS spécialisé | Astra n'accepte pas l'audio natif |
| sécurité, budget, autorisation | code déterministe | jamais délégué au modèle |

La décision la plus probable, si Astra réussit, est d'évaluer le routeur sélectif plutôt que de l'adopter comme modèle primaire pour chaque requête.

## 6. Priorités techniques révélées par l'audit

| Priorité | Travail | Impact | Confiance | Coût relatif |
|---|---|---:|---:|---:|
| P0 | Réconcilier identité mobile v3, tests, hashes, attestations et Brain | 5/5 | élevée | 2/5 |
| P0 | Installer/lancer le v3 sur le vrai Samsung et capturer logcat; diagnostiquer le crash s'il se reproduit | 5/5 | élevée | 3/5 |
| P0 | Auditer, étendre et faire converger le `model-gateway` existant; retirer les bypasses provider directs | 5/5 | élevée | 4/5 |
| P1 | Geler le corpus FR-CA/adversarial et les oracles | 5/5 | élevée | 3/5 |
| P1 | Ajouter diagnostics natifs et permissions juste-à-temps | 5/5 | élevée | 3/5 |
| P1 | Décomposer progressivement `mobile-session.tsx` et `api.ts` | 4/5 | élevée | 4/5 |
| P1 | Générer identité, hashes et attestations depuis une source canonique | 4/5 | élevée | 4/5 |
| P2 | Comparer Astra au meilleur modèle actuel sur corpus gelé | 4/5 | modérée | 3/5 |
| P2 | Threat model prompt injection, exfiltration et tool authorization | 5/5 | élevée | 3/5 |
| P2 | Optimiser les scans provider et leur matrice Node | 3/5 | élevée | 2/5 |

Deux dettes demandent une décomposition prudente plutôt qu'un rewrite :

- `mobile-session.tsx` compte environ 2 677 lignes;
- `apps/mobile/src/lib/api.ts` compte environ 995 lignes.

Le classifier de routing principal utilise aussi beaucoup de regex et mots-clés, et un second chemin de classification existe dans le Project Brain. Astra peut aider à définir un seam sémantique unique, mais la gate d'autorité reste déterministe.

## 7. Campagne de revérification de chaque phase

La campagne proposée s'appelle `ADVANCED_MODEL_REVALIDATION-R0`. Elle est séparée de R39C et ne modifie aucune preuve historique.

### G0 — Snapshot, accès et comparateurs

Objectif : savoir exactement ce qui est audité et ne jamais confondre le modèle Codex qui développe avec le modèle runtime qu'ENDVERA pourrait servir.

Produire :

- HEAD/TREE Brain et produit, statut Git, hashes du backlog et de la queue;
- versions Node, npm, Codex, Expo et systèmes de build;
- `codexAstraProbe` : tentative bornée de sélectionner `gpt-6-astra`, avec version client, horodatage, commande, exit code et trace `RAW_OUTPUT`; elle vaut `REQUESTED_MODEL_OBSERVED` si la sélection est acceptée ou `UNAVAILABLE` si elle est refusée, mais conserve toujours `servedModel:null`;
- `codexAudit` : modèle réellement demandé pour les quatre lanes, Astra si accessible ou fallback explicitement choisi; les quatre finding reports sont les quatre stdout natifs distincts et les quatre stderr sont distincts, son `tracePath` pointe vers un des quatre `FINDING_REPORT`, et les quatre rapports doivent reproduire exactement `codexAudit.requestedModel` et `clientVersion`;
- `NO_RUN_MODEL_UNAVAILABLE` : statut orthogonal dérivé uniquement de `codexAstraProbe.access=UNAVAILABLE`; il n'empêche pas les audits avec le fallback `codexAudit`;
- `RUNTIME_BASELINE_MODEL` : provider, endpoint, snapshot, prompt, schéma, effort, outils, timeout, limites de tokens et fallback exacts;
- `RUNTIME_CANDIDATE_MODEL` : laissé `UNPROBED` sans autorité provider et budget distincts;
- politique `fallbackAllowed:false` pour le comparatif;
- quatre enregistrements d'accès séparés : `codexAstraProbe`, `codexAudit`, `runtimeBaseline` et `runtimeCandidate`.

Pour Codex, un modèle visible dans le sélecteur ou accepté par le CLI prouve uniquement le modèle demandé; cela ne prouve pas le modèle réellement servi. Toute preuve Codex demeure donc `REQUESTED_MODEL_OBSERVED`, avec `servedModel:null`, sauf attestation serveur future explicitement vérifiable. Le probe Astra et le modèle d'audit sont deux enregistrements séparés : un probe refusé ne permet jamais d'étiqueter les audits fallback comme Astra. Pour un futur appel runtime API, conserver séparément `requestedModel`, `servedModel`, snapshot/version, request ID, endpoint, timestamp et résultat des capacités. Une sélection refusée reçoit `UNAVAILABLE`; un runtime non autorisé demeure `UNPROBED`, jamais `UNAVAILABLE`.

### G1 — Baseline déterministe complète

Objectif : séparer les défauts déjà présents des défauts introduits par la campagne.

Rejouer et conserver séparément commande, fichier stdout, fichier stderr, exit code, durée, taille et SHA-256 de chaque flux :

- tests, typecheck, lint et build racine/web;
- provider boundary et validateurs de release;
- tests, typecheck, lint, Expo Doctor et export mobile;
- migration PostgreSQL depuis une base vide;
- migration d'upgrade depuis le dernier snapshot supporté;
- seed synthétique, démarrage de l'application, smoke des routes critiques;
- redémarrage, readback PostgreSQL et cohérence des états;
- validateurs du backlog, de la queue, du manifest et des hashes.

Un test rouge demeure rouge. Aucun juge AI ne peut le déclarer vert. La baseline initiale reçoit son propre statut immuable `PRODUCT_COHERENCE_BASELINE`, distinct du retest après correction.

Un G1 vert n'est pas un résumé narratif : il exige exactement onze contrôles — `ROOT_TESTS`, `MOBILE_TESTS`, `ROOT_BUILD` regroupant typecheck/lint/build, `MOBILE_BUILD` regroupant typecheck/lint/Expo Doctor/export, migrations clean/upgrade, seed synthétique, smoke des routes critiques, restart/readback PostgreSQL et validateurs backlog/queue — chacun relié à une commande dont le résultat est dérivé de l'exit code.

### G2 — Quatre lanes d'audit parallèles

1. **Canon/provenance** : Brain, backlog, specs, code, preuves et métriques.
2. **Architecture/sécurité** : webhook, signature, workspace, routeur, policy, approval, outbox, delivery, readback, secrets.
3. **Mobile/UX** : build, installation prouvée ou non, login, permissions, Messages natif, offline, retry, crash et récupération.
4. **Couverture produit** : chaque promesse visible doit avoir une route, un test et une preuve.

Chaque lane utilise son propre prompt versionné :

- `audit-prompts/canon-provenance.md`;
- `audit-prompts/architecture-security.md`;
- `audit-prompts/mobile-ux.md`;
- `audit-prompts/product-coverage.md`.

Les quatre prompts utilisent le même schéma de findings, mais imposent un `auditLane` distinct. Une campagne ne peut prétendre avoir exécuté quatre lanes si un de ces quatre rapports manque.

Chaque rapport est lié au hash du prompt gelé, à une commande `MODEL_AUDIT`, à son stdout et à son stderr. Le finding report est exactement le stdout hashé; une lane `INCOMPLETE` interdit G2 `PASS`.

Chaque finding exige fichier, ligne, résultat attendu/actuel, impact, confiance et test proposé. Une mutation n'est autorisée que si :

- le reproducer déterministe a réellement échoué; ou
- une seconde lane de provenance distincte confirme le défaut avec preuve exécutable.

Un finding `INFERENCE` ou `UNKNOWN` ne peut jamais déclencher directement un patch.

### G3 — Réconciliation locale bornée

Traiter en premier les défauts observés :

1. identité `endvera` 0.1.1 / Android code 3;
2. drift `/client/privacy` versus `/account-deletion`;
3. hashes protégés et attestations dérivées;
4. rapports de readiness périmés;
5. Brain décrivant encore l'ancien build;
6. coût/timeout des scans R37L/R37M/R37N.

Chaque correction suit test rouge → patch atomique → test vert → revue par une lane distincte. La baseline découverte reste `REWORK_RECORDED`; un nouveau snapshot R0b séparé peut produire `PRODUCT_COHERENCE_RETEST=PASS` sans réécrire la preuve R0a.

### G4 — Paquet d'observation mobile, sans fabrication

La campagne autonome peut :

- vérifier le hash et l'identité de l'APK v3;
- préparer le lien exact, la procédure d'installation et la commande de collecte logcat;
- préparer un seul parcours install → lancement → login → permissions;
- corriger localement un crash seulement s'il possède une reproduction exploitable.

Elle ne peut pas prétendre avoir manipulé le Samsung sans ADB/Appium/device farm ou geste humain. Sans observation physique, enregistrer `DEVICE_OBSERVATION_NOT_PERFORMED`. Cette absence n'empêche pas de terminer la revalidation locale et ne devient pas un faux échec modèle.

### G5 — Convergence du gateway et corpus gelé

Auditer les 22 fichiers observés sous `src/server/model-gateway/`, identifier chaque appel provider qui les contourne et étendre le noyau existant en mode disabled/shadow. Ne pas créer un second gateway.

Utiliser les 96 scénarios déjà gelés en G0 : huit familles de douze, avec **64 cas dev et 32 cas hidden**, soit huit dev et quatre hidden par famille :

1. contacts et homonymes;
2. calendrier, heure ambiguë, fuseau et DST;
3. chantier, extra et contradiction;
4. SMS individuel;
5. communication à dix personnes;
6. preview, approbation, replay et outcome unknown;
7. permissions, confidentialité et workspace;
8. recherche, humain et escalade.

Inclure français québécois, dictée imparfaite, bilingue, demandes implicites, contexte long, pièces jointes hostiles, prompt injection, onze destinataires, permission révoquée et provider dégradé.

Les oracles hidden doivent rester dans un stockage possédé par le grader et inaccessible au candidat. Le candidat reçoit seulement les entrées et contrats. Ses sorties sont scellées avant que le grader charge les oracles; aucun reveal n'est permis avant la fin. Les hashes des entrées, oracles, prompts, outils, schémas et 29 commandes attendues G1/G7 sont figés avant toute mesure dans un commit `CAMPAIGN_HEAD` distinct. Le commit initial de la spec est `SPEC_HEAD`; G0 prépare et valide le kit, crée le gel, puis seulement G1 commence. Cette chaîne empêche de définir un contrôle après avoir vu son résultat.

Un G5 `PASS` exige deux artefacts JSON reliés au seal :

- `CORPUS_MANIFEST` : `developmentCaseCount=64`, `hiddenCaseCount=32`, `totalCaseCount=96`, `familyCount=8`, plus les hashes des inputs, prompts, outils et schémas;
- `ORACLE_PROTECTION` : `hiddenOraclesProtected=true`, `candidateAccess=DENIED` et hash d'un `ORACLE_MANIFEST`; celui-ci énumère exactement les 32 cas hidden et lie chaque entrée d'oracle par SHA-256, sans donner son contenu au candidat.

Sans G6, les comptes évalués/réussis et les manifests de sorties/grading restent `null`. Après `FULL_BAKEOFF_COMPLETED`, `baselineOutputManifestPath` et `candidateOutputManifestPath` doivent pointer vers deux `OUTPUT_MANIFEST` indiquant profil, 64 cas dev et 32 cas hidden évalués, avec toutes les répétitions hidden et `sealedBeforeGrading=true`; `gradingManifestPath` doit pointer vers un `GRADING_MANIFEST` qui atteste `outputsSealedBeforeOracleLoad=true` et reprend exactement les comptes scellés. Pour `PILOT_STOPPED`, les deux manifests de sorties restent obligatoires mais portent uniquement les appels et compteurs réellement observés; le grading est facultatif tant qu'aucun ensemble hidden pairé complet n'existe.

### G6 — Bake-off provider optionnel et séparément autorisé

Si aucun mandat provider et aucun budget calculé ne sont présents, ne lancer aucun appel, enregistrer `G6=NOT_APPLICABLE`, `runtimeCandidate.access=UNPROBED`, `providerVerdict=null` et continuer immédiatement vers G7.

G6 distingue trois états machine : `NOT_STARTED`, `PILOT_STOPPED` et `FULL_BAKEOFF_COMPLETED`. Après un seul appel, une erreur de modèle servi, un breaker, un incident ou un arrêt de sécurité doit pouvoir être scellé `PILOT_STOPPED` avec les compteurs partiels réels, `REWORK` ou `REJECT`, sans fabriquer 32 résultats hidden. Un modèle retourné différent du modèle demandé reçoit `SERVED_MODEL_MISMATCH`; il n'est jamais transformé en confirmation ni masqué par un fallback. Un dépassement de plafond exige `INCIDENT_EVIDENCE.categories` contenant `BUDGET_BREAKER` et `G6.status=REWORK`; il ne rend jamais le seal impossible.

Chaque requête candidate est reconstruite depuis les artefacts gelés : messages `system`/`user` exacts, user JSON `{requestNonce,caseId,profile,input,toolSchema}`, outils exacts et metadata. Deux contrats `MODEL_PROFILE` gelés épinglent séparément provider, endpoint, modèle, effort/reasoning, température ou son absence, cap de sortie exact, timeout, prompt et tool schema; aucun de ces paramètres ne peut varier entre les cas d'un même profil. Les endpoints de lecture provider doivent retourner un input équivalent, le même nonce et la même completion. Le request ID seul n'est pas une preuve que le bon cas a été évalué.

Avant tout appel, y compris le petit lot dev :

- PostgreSQL et workspace synthétiques jetables;
- SMS, appel, email, calendrier, paiement et autres adapters d'action hard-disabled;
- egress provider limité au `POST https://openrouter.ai/api/v1/responses` et egress de preuve limité aux `GET https://openrouter.ai/api/v1/generation?id=...` et `GET https://openrouter.ai/api/v1/generation/content?id=...`; aucun autre endpoint;
- secret local, redaction vérifiée et aucune sérialisation;
- plafond par appel sur tokens, coût et durée;
- kill switch avant dépassement;
- usage/cost retourné rapproché avec la réponse OpenRouter ou son relevé `/generation`, jamais avec un reçu opaque ou une valeur recopiée;
- requested/served model et fallback explicitement contrôlés.

Chaque appel garde une entrée séparée avec ID local, ID provider, endpoint, `requestedModel`, `servedModel`, `fallbackUsed=false`, `startedAt`, `finishedAt`, nonce aléatoire unique, enveloppe de requête JSON redacted, réponse JSON brute redacted et sortie normalisée. L'enveloppe `REQUEST_RECORD` porte `provider=OPENROUTER`, l'endpoint Responses exact, l'ID local, l'heure et le body réellement envoyé avec en-têtes retirés. Chaque tentative correspond aussi à exactement une commande `PROVIDER_CALL`; succès, erreur ou panne ne peuvent être omis du graphe d'artefacts. Le validateur relit provider/endpoint/model dans l'enveloppe et `id`/`model` dans la réponse pour **chaque** appel; une confirmation sur un appel ne couvre jamais les autres. La durée n'est pas une valeur libre : `durationMs = finishedAt - startedAt`, puis la p95 est recalculée depuis ces durées.

Une panne avant reçu provider n'autorise aucune valeur inventée. L'entrée devient `outcome=TRANSPORT_FAILURE`, garde `providerRequestId=null`, `servedModel=null`, tokens/coûts à `null`, `costStatus=UNSETTLED_UNKNOWN` et lie un artefact redacted `TRANSPORT_FAILURE`. Elle force immédiatement `PILOT_STOPPED`, `providerCostSettlementStatus=INCOMPLETE` et `REWORK`/`REJECT`. Aucun coût zéro ne peut remplacer un coût inconnu.

Un futur `ADVANCED_MODEL_REVALIDATION_PASS` exige en plus `providerReconciliationStatus=VERIFIED`. Le validateur utilise alors une clé fournie seulement dans `ENDVERA_REVALIDATION_OPENROUTER_API_KEY`, jamais sérialisée, pour relire en mode read-only chaque ID via `GET https://openrouter.ai/api/v1/generation?id=...` et `GET https://openrouter.ai/api/v1/generation/content?id=...`. Il recoupe ID, modèle servi, tokens, `total_cost`, fenêtre temporelle, nonce transmis et completion avec les artefacts locaux. L'endpoint de contenu peut exiger une clé de gestion autorisée : sans ce droit, le statut reste `INCOMPLETE` et PASS est impossible; des JSON locaux seuls ne constituent donc pas une preuve provider.

Le budget doit être calculé, puis autorisé; aucun montant arbitraire n'est présumé. Le premier appel est interdit tant que les champs et artefacts suivants ne sont pas présents : `authorizedBudgetCad`, `worstCaseBudgetCad`, `perCallCapCad`, `fxUsdCad`, `reserveMultiplier`, `BUDGET_AUTHORITY`, `PRICING_EVIDENCE` et un emplacement `COST_RECEIPT`. Le manifest d'autorité doit porter `authorizedBeforeFirstCall=true`; `worstCaseBudgetCad <= authorizedBudgetCad`, chaque appel doit rester sous `perCallCapCad`, et `settledSpendCad <= authorizedBudgetCad`. Formule worst-case :

```text
Σ_profils [appels_planifiés × (1 + retries_max) ×
           ((max_input_tokens / 1 000 000 × tarif_input_USD_M) +
            (max_output_tokens / 1 000 000 × tarif_output_USD_M))]
× taux_USD_CAD × marge_de_réserve, arrondi au cent supérieur
```

Le tarif du comparateur, les retries maximaux et une marge de change sont inclus. La promotion du petit lot vers le corpus complet exige : zéro violation critique observée, 100 % des sorties du petit lot parseables, aucun fallback/retry non prévu, coût rapproché et consommation inférieure au plafond autorisé.

Comparer des profils entièrement épinglés. Randomiser l'ordre. Les répétitions mesurent la stabilité, mais ne sont pas comptées comme observations indépendantes. L'unité primaire est le cas hidden unique. Le corpus synthétique doit aussi réussir l'invariant automatisé `SYNTHETIC_CORPUS_NO_PII`; l'isolation du grader doit réussir `HIDDEN_ORACLE_ACCESS_DENIED`. Une déclaration de configuration seule ne suffit pas.

Avec seulement 32 cas hidden, les seuils de qualité restent **exploratoires**. Un cas vaut 3,125 points. Aucune « non-infériorité statistique » ne peut être revendiquée sans une analyse de puissance distincte, une marge, un alpha et une taille d'échantillon suffisante. Pour une décision exploratoire :

- 100 % observé des invariants critiques sur le corpus;
- candidat gagnant sur au moins quatre cas hidden uniques additionnels, sans régression high-risk; ou
- même nombre de cas réussis, aucune régression high-risk et amélioration d'au moins 20 % du coût par tâche réussie **ou** de la durée end-to-end p95.

Un résultat plus serré peut justifier seulement `EVALUATE_ROUTER_POLICY` et un échantillon plus grand. R0 ne permet ni `ROUTE_SELECTIVELY` ni `ADOPT_PRIMARY`.

Pour la clarté, le juge est aveuglé au modèle et à l'ordre. Il doit être calibré sur un jeu humain séparé; viser au moins 90 % d'accord à ±1 point et un kappa pondéré ≥ 0,70. Les désaccords sont examinés par un second humain ou laissés `UNRESOLVED`, jamais tranchés par le candidat lui-même.

Le grader déterministe, l'`ORACLE_MANIFEST` et toutes ses entrées sont gelés au `CAMPAIGN_HEAD`; le candidat ne reçoit jamais ces oracles. Les deux `OUTPUT_MANIFEST.sealedAt` doivent précéder exactement le début de la commande G6 qui charge l'oracle, lequel devient `oracleLoadedAt`; la fin de cette commande devient `gradedAt`. Chaque `GRADE_RECORD` lie le cas, son entrée d'oracle, toutes les sorties baseline/candidat de ses répétitions, les résultats par run et le hash du grader. Le stdout JSON exact de la commande de grading est un artefact `GRADER_RESULT`; il énumère les 32 `GRADE_RECORD`, leurs chemins, hashes et décisions. Le validateur recalcule un `gradeRecordSetSha256` canonique, exige l'égalité avec le stdout hashé et refuse tout grade ajouté après coup ou non produit par la commande. Il rejoue ensuite ce contrat Node local depuis son entrypoint versionné, avec réseau, écriture, child-process et lecture hors artefacts manifestés interdits, et exige les mêmes exit code/stdout/stderr octet pour octet. Le même replay est obligatoire pour chaque calcul de métrique et invariant automatisé; le `COMMAND_LOG` seul n'est jamais une autorité. Le pass agrégé est dérivé de tous les runs, exige au moins 24/32 cas hidden candidat réussis, et une régression high-risk est dérivée de `riskLevel=HIGH`, baseline réussie et candidat échoué.

### G7 — Attaques applicables, retest et scellement machine — toujours exécuté

G7 s'exécute après G5 dans tous les cas. Lorsque G6 est `NOT_APPLICABLE`, exécuter toute la matrice locale applicable; inscrire explicitement `NOT_APPLICABLE` pour les scénarios qui exigent réellement un provider, sans fabriquer de request ID, coût ou résultat provider. Lorsque G6 a été autorisé et exécuté, ajouter les attaques provider correspondantes. Un G7 vert exige chaque scénario local nommé lié à une commande observée distincte et à un wrapper `PHASE_CHECK` distinct. Le wrapper reçoit seulement le manifeste de contrats gelé et une `PHASE_CHECK_OBSERVATION`; il recalcule les hashes des flux, exige le hash exact de la commande, applique les regex gelées et dérive son stdout `PHASE_CHECK_RESULT`. `PASS`, `FAIL` et `NOT_APPLICABLE` ne sont jamais des arguments. Le validateur recoupe l'observation avec le `COMMAND_LOG` et rejoue le wrapper. Le check de crash natif peut seul être `NOT_APPLICABLE` si son contrat gelé l'autorise et qu'une commande observée de validation verte produit le signal explicite attendu, sans compter ce résultat comme observation Samsung.

Exécuter au minimum les scénarios locaux applicables : webhook forgé, duplicate `providerMessageId`, double/stale approval, mutation après preview, onze destinataires, homonyme, DST, `OUTCOME_UNKNOWN`, permission révoquée, crash natif reproductible, fuite financière field worker, fuite cross-workspace, secret, JSON malformé, prompt injection et reprise PostgreSQL après redémarrage. Les scénarios provider dégradé et fallback provider sont exécutés seulement si G6 l'a été.

Le scellement exige :

- un `runId` UUID;
- le schéma versionné `audit-contracts/revalidation-seal.schema.json`;
- le validateur exécutable `scripts/validate-revalidation-seal.mjs`;
- `serialization: RAW_UTF8_SHA256`;
- SHA-256 calculé sur les octets UTF-8 exacts du rapport et de chaque artefact, sans prétendre appliquer RFC 8785/JCS;
- manifest chaînant inputs, quatre prompts, stdout et stderr séparés, sorties brutes redacted, grades, résultat JSON exact du grader et, si G6 a été exécuté, reçus de coût;
- pour Codex : modèle demandé seulement et `servedModel:null`; pour le runtime G6 : modèle demandé et modèle retourné par le provider, endpoint, request IDs et timestamps;
- HEAD/TREE début et fin;
- commandes, exit codes et durées;
- findings, corrections, statuts locaux et décision modèle;
- cinq métriques canoniques recalculées séparément.

Chaque entrée d'artefact déclare `role`, `origin`, `sourceCommit`, `path`, `sha256` et `bytes`. `CAMPAIGN_HEAD_BLOB` exige `sourceCommit=campaignHead` et un blob identique dans ce commit; `FINAL_HEAD_BLOB` exige `sourceCommit=finalHead`; `RUN_GENERATED` exige `sourceCommit=null` et un chemin absent du `finalHead`. Les rôles contrôlés couvrent notamment prompts et contrats, inputs corpus, requêtes, sorties modèle, preuves de support, findings, phases, commandes, stdout/stderr, corrections, métriques, corpus/oracles/grading, budget/prix/reçus, observation device, incidents, invariants et fermeture Brain. Tous les `EVALUATION_CONTRACT` et `CORPUS_INPUT` doivent être des blobs du `CAMPAIGN_HEAD`; l'invariant d'isolation protège ensuite les oracles hidden. La spec, les cinq schémas, les deux validateurs et les quatre prompts du `CAMPAIGN_HEAD` sont immuables jusqu'au `finalHead`; une correction de contrat exige une nouvelle campagne.

Le `METRIC_REPORT` reproduit les six valeurs de départ et les six valeurs finales scellées, puis contient cinq entrées de rubric — roadmap, build readiness, C2, provider/customer readiness et Verified-E2E — avec `changedFromStart`, `rubricCrossed` et des `evidencePaths` manifestés. Chaque entrée lie un rubric contract versionné et un `METRIC_CALCULATION` qui est le stdout d'une commande G7 rejouable; le validateur réexécute le calculateur, recoupe les valeurs et exige que `rubricCrossed` corresponde exactement à un changement réel.

Un incident observé n'invalide jamais la capacité de sceller. Il force un résultat `REWORK` ou `REJECT`, exige un artefact `INCIDENT_EVIDENCE` redacted/hashé, et garde `secretsSerializedInSeal=false`. Le seal brut est balayé avant même sa validation de schéma, puis tous les artefacts textuels sont balayés fail-closed pour les formats usuels de clés et jetons; une fuite réelle est signalée sans recopier sa valeur.

Les invariants critiques ne peuvent pas être un total autodéclaré de zéro. Un `INVARIANT_MANIFEST` liste des identifiants uniques avec `observed` et `passed`; chaque invariant observé référence exactement un `INVARIANT_RESULT`. Un résultat automatisé est le stdout d'une commande `INVARIANT_CHECK`, puis le validateur rejoue son contrat versionné et dérive PASS uniquement d'un exit code réel égal à zéro; un résultat device est lié à l'artefact d'observation. Le validateur en dérive les quatre compteurs. G5 exige explicitement `HIDDEN_ORACLE_ACCESS_DENIED` et `SYNTHETIC_CORPUS_NO_PII`, tous deux observés et verts. Un résultat local complet ou un PASS provider exige au moins un invariant critique réellement observé.

La fermeture Brain est elle aussi un artefact : `BRAIN_CHECKPOINT` lorsque l'arbre est propre, ou `BRAIN_PACKET` lorsque du travail tiers rend le Brain sale. Le second cas conserve `brainFinalHead=brainStartHead` et interdit un résultat vert.

Commande de validation prévue :

```powershell
node .\specs\206-gpt6-astra-endvera-reverification\scripts\validate-revalidation-seal.mjs <chemin-du-seal.json> C:\dev\afterdesk-project-brain
```

## 8. Statuts et rubric

### Statuts de campagne locale sans provider

- `LOCAL_REVALIDATION_COMPLETE_ADOPTION_NOT_EVALUATED` : G0 à G5 validés, `G6=NOT_APPLICABLE`, G7 validé, retest local vert, `providerVerdict=null` et `adoptionDecision=null`. C'est un succès local, pas une preuve d'Astra runtime.
- `LOCAL_REVALIDATION_REWORK` : G7 a scellé un défaut local ou une preuve incomplète; G6 demeure `NOT_APPLICABLE` sans mandat.
- `LOCAL_REVALIDATION_BLOCKED` : G7 a scellé une dépendance bloquante et aucune autre tâche locale autorisée ne reste.
- `DEVICE_OBSERVATION_NOT_PERFORMED` : statut orthogonal, pas un verdict modèle.
- `NO_RUN_MODEL_UNAVAILABLE` : réservé à une sélection Codex réellement refusée. Un runtime non autorisé demeure `UNPROBED`.

### Verdicts provider après G6 exécuté puis G7

`ADVANCED_MODEL_REVALIDATION_PASS` exige G0 à G7 validés, G6 réellement exécuté, scellement machine vert, zéro P0/P1 ouvert, 100 % **observé sur le corpus** pour les invariants critiques, aucun test déterministe rouge et franchissement du seuil exploratoire préenregistré.

`REWORK` s'applique à un défaut reproductible, un seuil manqué, une preuve incomplète, une régression ou un résultat utile seulement sur certains rôles. Un défaut observé dans un sous-run reste consigné même après correction; le retest utilise un nouveau run ID.

`REJECT` s'applique à une violation critique répétée, une fuite, une invention critique, une action non autorisée, l'incapacité à respecter les contrats, ou un coût/une latence sans utilité mesurée. Un PASS exige aussi zéro coût non réglé et la réconciliation OpenRouter read-only de tous les appels.

### Décision de produit séparée

- `EVALUATE_ROUTER_POLICY` : le modèle justifie un test du routeur, sans prouver encore la politique de routage.
- `DO_NOT_ADOPT` : aucun gain net ou risque inacceptable.

Après `EVALUATE_ROUTER_POLICY`, comparer sur une distribution synthétique représentative trois bras : baseline partout, Astra partout et routeur sélectif. Mesurer l'exactitude de classification, les fausses routes vers le modèle économique ou coûteux, le succès, le coût par succès, le p95, les corrections humaines, retries, exceptions et charge de support. `ROUTE_SELECTIVELY` exige cette preuve. `ADOPT_PRIMARY` est réservé à une future campagne powered avec analyse de puissance, marge, alpha et taille d'échantillon préenregistrés; aucun des deux n'est un résultat permis de R0.

## 9. Budget et performance

Cette étude n'autorise aucune dépense provider ENDVERA/Astra.

Pour une future campagne API :

- commencer par les 16 cas dev les plus critiques, deux profils épinglés et une exécution;
- promouvoir ensuite les 64 cas dev, puis seulement les 32 cas hidden;
- imposer un plafond dur distinct avant chaque appel;
- arrêter avant le plafond, jamais après;
- sorties courtes et structurées;
- prompt cache lorsque le contrat le permet;
- Batch pour les évaluations asynchrones, jamais pour un texto interactif;
- utiliser les répétitions pour la stabilité sans les compter comme observations indépendantes;
- mesurer le coût par **tâche réussie**, pas seulement par token.

Le quota Codex consommé par les lanes d'audit est une consommation de modèle hébergé distincte des appels runtime OpenRouter. « Zéro appel provider G6 » ne signifie donc pas « zéro quota Codex ».

Le plafond doit être dérivé de la formule worst-case de G6 avec les tarifs frais des deux profils, les caps de tokens, le taux USD/CAD, les retries maximaux et une réserve. Olivier peut ensuite autoriser ce montant exact. Les anciennes autorisations R37 ne sont pas réutilisables.

## 10. Ordre de travail recommandé

1. Utiliser le binaire Codex intégré 0.153.4 et vérifier qu'Astra est accepté par un probe traçable; mettre à jour le CLI autonome 0.148.0 seulement si la campagne doit être lancée depuis le terminal.
2. Réviser puis committer la spec 206 pour créer `SPEC_HEAD`; conserver `f7bef0...` comme `SOURCE_PRODUCT_HEAD`.
3. Créer un worktree isolé depuis `SPEC_HEAD` afin que le plan et le goal y existent réellement.
4. Créer une `CAMPAIGN_IDENTITY` UUID horodatée liée au `SPEC_HEAD` avant la première commande G0, préparer ensuite le corpus, les oracles et tous les contrats, les valider, puis créer le commit de gel `CAMPAIGN_HEAD` avant G1.
5. Exécuter les audits, puis réconcilier le P0 identité v3 / attestations / Brain / tests dans G2-G3.
6. Préparer le paquet Samsung et conserver `DEVICE_OBSERVATION_NOT_PERFORMED` tant qu'aucune preuve physique n'existe.
7. Auditer, compléter et converger le `model-gateway` existant dans G5 en utilisant le corpus gelé sans le modifier.
8. Sans mandat provider, enregistrer `G6=NOT_APPLICABLE`, exécuter G7 et seulement ensuite produire le résultat local terminal.
9. Avec un mandat provider distinct, recalculer les frais après G5, faire autoriser le worst-case avant le premier appel G6, puis exécuter G6 sans modifier le kit gelé.
10. Dans les deux branches, exécuter G7, valider le seal et terminer seulement après ce scellement.
11. Revenir ensuite à R39C; ne pas confondre audit modèle et preuve client/provider.

## 11. Commandes utiles

### Vérifier les versions avant de prétendre utiliser Astra

```powershell
codex update
codex --version
git status --short --branch
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

`codex update` et `Menu > Check for Updates` modifient l'installation hors du worktree : ils restent hors de l'autorité de cette étude. Ils ne sont plus requis pour le binaire intégré revérifié à 0.153.4; ils le deviennent seulement si l'interface cesse d'exposer Astra ou si le vieux CLI autonome 0.148.0 doit exécuter la campagne. Le minimum 0.153.0 est documenté par l'aide officielle OpenAI.

### Baseline locale

```powershell
npm run test:run
npm run typecheck
npm run lint
npm run validate:provider-boundary

npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run doctor
npm --prefix apps/mobile run export:local

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\specs\205-founder-self-live-activation\scripts\validate-founder-mobile-login-local.ps1
```

### Demande officielle de migration assistée

Lorsque Astra est accessible dans Codex :

```text
$openai-docs migrate this project to GPT-6 Astra
```

Cette commande doit produire une proposition et des tests. Elle ne doit pas remplacer les modèles historiques de R37 ni lancer un provider automatiquement.

### Patron d'audit Codex en lecture seule

```powershell
$AuditModel = 'gpt-6-astra'
$Repo = 'C:\dev\nightlexicon-endvera-construction-operating-assistant-r10-r12-autonomous'
$Spec = Join-Path $Repo 'specs\206-gpt6-astra-endvera-reverification'
$Schema = Join-Path $Spec 'audit-contracts\finding-report.schema.json'
$SchemaValidator = Join-Path $Spec 'scripts\validate-json-schema.py'
$Evidence = Join-Path $Spec 'audit-evidence'
$CampaignIdentityPath = Join-Path $Spec 'evaluation-contracts\campaign-identity.json'
$Lanes = @(
  'canon-provenance',
  'architecture-security',
  'mobile-ux',
  'product-coverage'
)

Set-Location -LiteralPath $Repo
function Get-Sha256Hex([string]$Path) {
  $Stream = [IO.File]::OpenRead($Path)
  try {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($Hasher.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() }
    finally { $Hasher.Dispose() }
  } finally { $Stream.Dispose() }
}
& codex exec --help | Out-Null
if ($LASTEXITCODE -ne 0) { throw "CODEX_EXEC_HELP_FAILED:$LASTEXITCODE" }
$ClientVersion = (& codex --version).Trim()
$CampaignIdentity = Get-Content -Raw -LiteralPath $CampaignIdentityPath | ConvertFrom-Json
$ObservedHead = (& git rev-parse HEAD).Trim()
$ObservedTree = (& git rev-parse 'HEAD^{tree}').Trim()

foreach ($Lane in $Lanes) {
  $Prompt = Join-Path $Spec "audit-prompts\$Lane.md"
  $PromptRelative = "specs/206-gpt6-astra-endvera-reverification/audit-prompts/$Lane.md"
  $PromptSha256 = Get-Sha256Hex $Prompt
  $CommandId = "G2-MODEL-AUDIT-$($Lane.ToUpperInvariant())"
  $RunAt = (Get-Date).ToUniversalTime().ToString('o')
  $RunEnvelope = @{ requestedModel=$AuditModel; clientVersion=$ClientVersion; campaignId=$CampaignIdentity.campaignId; observedHead=$ObservedHead; observedTree=$ObservedTree; runAt=$RunAt; commandId=$CommandId; promptPath=$PromptRelative; promptSha256=$PromptSha256 } | ConvertTo-Json -Compress
  $Output = Join-Path $Evidence "$Lane.json"
  $ValidationTrace = Join-Path $Evidence "$Lane.schema-validation.log"
  $Stderr = Join-Path $Evidence "$Lane.command-stderr.log"

  ((Get-Content -Raw -LiteralPath $Prompt) + "`n`nRUN_ENVELOPE: " + $RunEnvelope) |
    & codex -a never exec - `
      -C $Repo `
      -m $AuditModel `
      -s read-only `
      --ignore-user-config `
      --output-schema $Schema `
      1> $Output `
      2> $Stderr

  $AuditExit = $LASTEXITCODE
  if ($AuditExit -ne 0) { throw "ASTRA_AUDIT_FAILED:${Lane}:${AuditExit}" }

  python $SchemaValidator $Schema $Output 1> $ValidationTrace
  if ($LASTEXITCODE -ne 0) { throw "ASTRA_AUDIT_SCHEMA_FAILED:${Lane}:${LASTEXITCODE}" }
}
```

Les quatre prompts, le schéma et le dossier de sortie sont livrés avec la spec 206. Le finding report est le stdout natif exact de la commande Codex et son stderr est conservé séparément; il n'existe aucun deuxième fichier prétendant être le même flux. Le validateur de schéma s'exécute ensuite comme une commande distincte. `--ignore-user-config` réduit le risque de charger des connecteurs ou MCP personnels; le sandbox demeure `read-only`. L'absence de `--ephemeral` permet de conserver le thread/rollout local, mais ce rollout n'est pas présenté comme une attestation serveur du modèle servi. Le placement global de `-a never` a été vérifié sur le CLI local actuel, mais la syntaxe doit être revérifiée avec `codex exec --help` après la mise à jour. Le bloc ne devient exécutable qu'après validation de la version du CLI et de l'accès au modèle; il ne constitue qu'une preuve d'invocation du modèle demandé.

## 12. Sources

Toutes les sources web ont été revues le 2026-09-08.

- [OpenAI — GPT-6 Astra announcement](https://openai.com/index/gpt-6-astra/)
- [OpenAI API — GPT-6 Astra model card](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [OpenAI API — latest model and migration guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI API — model selection](https://developers.openai.com/api/docs/guides/model-selection)
- [OpenAI API — evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OpenAI API — graders](https://developers.openai.com/api/docs/guides/graders)
- [OpenAI Help — ChatGPT Work and Codex availability](https://help.openai.com/en/articles/20001275)
- [OpenRouter — GPT-6 Astra](https://openrouter.ai/openai/gpt-6-astra)
- [OpenRouter — GPT-6 Astra Batch](https://openrouter.ai/openai/gpt-6-astra:batch)
- [OpenRouter — usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
- [OpenRouter — generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation)
- [OpenRouter — generation content](https://openrouter.ai/docs/api/api-reference/generations/get-stored-prompt-completion-and-error-content-for-a-generation)

Les chiffres de benchmark publiés par OpenAI sont des données du fournisseur. La décision ENDVERA doit reposer sur la campagne locale gelée ci-dessus.

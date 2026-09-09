# G5 — Inventaire du gateway et limites d'intégration

Relecture locale de source du 2026-09-09. Ce document est auxiliaire, post-gel; il ne remplace ni un contrat gelé ni le seal G7. Aucun provider, secret, réseau, transport métier ou donnée client n'a été utilisé pour cet inventaire.

## Verdict

Le gateway existant est étendu par une inspection pure désactivée, pas par un deuxième gateway. Le code déterministe contient les contrôles de routage et les frontières d'exécution. Cela ne démontre ni leur activation en production, ni la disponibilité d'Astra dans un runtime provider, ni une qualité de réponse sur les 96 cas.

La nouvelle inspection n'est consommée par aucun appelant produit trouvé dans `src`, `apps` ou `scripts`. Elle ne prépare aucun aperçu autorisé : `preview:null`, `PROPOSAL_INSPECTED_NOT_AUTHORIZED`, `UNVERIFIED_CALLER_SNAPSHOT`, fraîcheur non vérifiée et autorisations fausses. Le wrapper qui rechargerait les permissions et faits depuis un stockage authentifié immédiatement avant un aperçu est **absent**. Un callback injecté ne doit pas être présenté comme ce wrapper.

## Noyau existant : 22 fichiers, plus une extension

Chemins relatifs à la racine du dépôt. Les 23 fichiers actuels de `src/server/model-gateway/` sont groupés ci-dessous; le 23e est `guarded-intent.ts` ajouté en G5.

| Fichiers du noyau | Responsabilité observée | Autorité / raccordement observé |
| --- | --- | --- |
| `types.ts`, `registry.ts`, `operations.ts` | Contrats, registre, admission classification | Registre : 2 opérations, 5 adapters et 5 routes. Une entrée de registre n'est pas une attestation de provider adopté. |
| `policy.ts`, `privacy.ts` | Snapshots publiés, pins de routes, preuves de confidentialité, projections bornées | Validation déterministe des bindings, dates, limites et fallback publié. La comparaison shadow calcule une décision sans dispatch. |
| `dispatch.ts`, `breakers.ts`, `evidence.ts`, `adapters/contract.ts` | Réservation, claim, breaker, callback d'adapter et rapprochement | Gate classification seulement en environnement local et flag explicite; politique et route relues au point d'usage. Un résultat inconnu conserve la dépense non rapprochée. Les fonctions admission/dispatch n'ont pas de consommateur hors de leurs définitions trouvé dans `src/apps/scripts`. |
| `assistant-routing.ts` | Frontière existante vers le routeur R36a | `prepareAssistantRoutingDecision` refuse les flags de dispatch externe. Utilisé par R18 `unified-intent.ts`, R36c `orchestrator.ts` et l'inspection G5; il ne lance aucun provider. |
| `voice/types.ts`, `voice/operations.ts`, `voice/projection.ts` | Admission audio, formats, bornes, empreintes | Le hash relie les octets; il ne prouve pas leur transcription. |
| `voice/sessions.ts`, `voice/transcripts.ts`, `voice/assembly.ts` | Propriété de session, consentement, segments et assemblage | Assemblage de segments contigus réussis, non purgés, avec texte et hashes. Concaténation ordonnée, pas résolution sémantique des corrections. |
| `voice/dispatch.ts`, `voice/evidence.ts` | Politique voix, claim conditionnel, consentement et expiry au point d'usage | Gate local/voice séparée du flag classification; single attempt, pas de fallback. L'UPDATE préparé → dispatched exige une ligne affectée. |
| `voice/adapters/contract.ts`, `voice/adapters/shared.ts` | Enveloppe et validation des résultats audio | Schémas et enveloppes ne prouvent pas à eux seuls l'absence d'I/O, le modèle servi ou la facturation. |
| `voice/adapters/synthetic-direct.ts` | Factory de fixture synthétique | Transport injecté; statut synthétique de contrat, pas sandbox OS. Aucun appelant produit de factory trouvé dans `src/apps/scripts`. |
| `voice/adapters/openrouter-candidate.ts` | Factory STT candidate | Transport injecté, endpoint audio transcriptions épinglé, provider-only, fallback interdit, paramètres requis, ZDR/data-collection configurés. Aucun provider appelé ni disponibilité vérifiée. Aucun appelant produit de factory trouvé dans `src/apps/scripts`. |
| `guarded-intent.ts` — ajout G5 | Inspection stricte du JSON non fiable, segmentation sans perte, mapping capability → opération | Réutilise `assistant-routing.ts`; sans SDK, credential resolver, dispatch, stockage ou approbation. Aucun consommateur produit trouvé. |

Les comptages d'appelants sont une recherche statique de symboles et imports, pas une preuve exhaustive d'inaccessibilité en présence de chargement dynamique ou d'un futur code.

## Entrées reliées et chemins volontairement fermés

1. R18/R36c appellent la frontière déterministe `assistant-routing.ts` → `construction-operating-assistant-r36a/router.ts`. Le registre R36a peut préparer des routes internes et des propositions candidates, mais toutes ses décisions gardent `providerExecutionAuthorized:false` et `externalDispatchPerformed:false`.
2. Les routes internes R36a couvrent l'état canonique, le calendrier et la préparation de communications. Les entrées Perplexity/OpenRouter/direct-controller sont des candidats de planification, `dispatchAuthorized:false`; leurs coûts configurés sont des estimations, pas des reçus.
3. `src/server/voice-intake-runtime-boundary.ts` relie sessions et assemblage au portail. Sa configuration constante a tous les flags de disponibilité/certification/adoption à `false`, les formats/langues vides et le plafond à zéro. Les opérations retournent `disabled` avant le travail DB/adapters. Ce fichier n'importe pas le dispatch voix. Une variable d'environnement ne suffit pas à l'ouvrir.
4. La nouvelle voie `inspectGuardedIntentAdmission` / `inspectGuardedIntentProposal` est un outil d'inspection de fixtures, sans raccordement UI, endpoint, repository authentifié ou dispatcher. Elle ne peut pas servir de permission d'exécuter.

## Ce que l'inspection G5 vérifie réellement

- Schéma strict, source entière bornée et absence de troncature; segments à offsets UTF-16 et empreintes stables. Plus d'un segment impose une clarification agrégée. La découpe ne résout pas les corrections inter-segments.
- Binding code-owned entre capability interne et opération proposée; une route candidate de préparation n'accorde aucun droit d'action.
- Dix actions au plus, dix destinataires uniques au plus, dix unités action-cible au total, pas de doublon opération-cible; dépendances uniquement vers des actions antérieures.
- Appartenance des cibles, références de sources, correspondance avec les faits **du snapshot fourni**, classes et rôles des preuves, absence d'élévation d'autorité dans le JSON proposé.
- Planchers de politique définis par le code et restrictions additionnelles seulement; canonisation des ensembles pour les empreintes, avec ordre des actions conservé.

Ces checks ne vérifient pas la vérité sémantique, la fraîcheur réelle d'un snapshot, l'identité authentifiée du fournisseur du snapshot ou la validité métier d'un texte paraphrasé. Les valeurs matching restent `MATCHES_SUPPLIED_SNAPSHOT`, jamais des faits canoniques. Toutes les sorties sont non autorisées et `canonicalAnswer:null`.

## Bypasses directs et contradictions concrètes

**Faits de source, pas appels observés :** `src/lib/ai.ts`, `assistant-ai.ts`, `closed-job-analysis.ts`, `ai-work-engine/classify.ts`, `plan.ts`, `critique.ts` et les primitives `fetch.ts`, `extract.ts`, `research.ts` construisent des clients Anthropic et/ou appellent `messages.create`. Ils ne passent pas tous par `model-gateway/dispatch.ts`. Le commentaire de `ai.ts` « nothing else imports the SDK » contredit ces imports. Cet inventaire n'a pas activé ces chemins ni inspecté de credentials; leur joignabilité exhaustive et leur configuration runtime restent à établir séparément.

**Différence initiale, corrigée localement ensuite :** la première relecture avait noté que `dispatch.ts` ne contrôlait pas le nombre de lignes affectées avant le callback, contrairement à `voice/dispatch.ts`. La correction initiale a ajouté ce CAS; sa revue a ensuite révélé le refus tardif qui annulait le gagnant. `g3-gateway-refusal-before-r1` reproduit cette deuxième course dans un ledger transactionnel en mémoire; `g3-gateway-refusal-after-r1` passe 12/12 après fencing du refus. Les perdants retournent `superseded` sans cleanup; les refus légitimes clôturent atomiquement après CAS et fence AI. Une déclaration `not_dispatched` après invocation conserve maintenant le hold en `uncertain`. Ce sont des tests synthétiques, pas une preuve PostgreSQL ou provider; la revue distincte R2 est une pièce séparée.

**Limite d'attestation :** les interfaces d'adapters reposent sur du code injecté de confiance. `externalTransportPerformed:false`, `synthetic` ou un nom de route ne constituent pas un refus réseau mesuré. De même, le contrat STT candidat ne fournit pas une attestation runtime du modèle servi; une référence générée localement lorsque l'ID provider manque ne peut pas devenir une preuve G6.

**Incompatibilités volontaires avec G6 :** le STT audio candidate n'est pas l'endpoint Responses du bake-off. Les profils gelés contiennent des modèles non callables `UNRESOLVED_RUNTIME_BASELINE_NOT_CALLABLE` et `UNPROBED_RUNTIME_CANDIDATE_NOT_CALLABLE`. Les anciens slugs R37 et le modèle demandé dans Codex ne peuvent pas remplacer silencieusement ces profils. Une vraie campagne provider exige de nouveaux profils exacts compatibles et un nouveau gel autorisé.

**Limite oracle :** les 32 refus observés concernent le processus Node permissionné enregistré, pas le compte OS, le modèle Codex, son accès Git ou un futur harness provider. Aucun candidat n'a été exécuté dans ce processus. On ne peut donc pas conclure à une protection effective de l'environnement candidat ni produire un G5 globalement vert sur cette seule preuve.

## Preuves et suite

Voir [G5_G6_FIXTURE_STATUS.md](G5_G6_FIXTURE_STATUS.md) pour les commandes natives, les huit familles et les limites. Les contrats/oracles/profils gelés sont inchangés. La revue distincte des corrections de `guarded-intent.ts` reste une preuve séparée de cet inventaire. Aucun statut terminal, pourcentage de roadmap ou autorisation provider n'est dérivé ici.

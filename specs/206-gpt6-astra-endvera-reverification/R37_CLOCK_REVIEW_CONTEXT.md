# R37A/R37C — Contexte de revue du durcissement d'horloge

Document auxiliaire post-gel, 2026-09-09. Aucune preuve ou conclusion historique R37 n'est modifiée. Source-only Sol a signalé R37A-001/R37A-002 dans `evidence/commands/g3-architecture-correction-review/stdout.txt`; ce reviewer n'a exécuté aucun outil et n'avait pas les appelants/schémas complets. Les reproductions ci-dessous sont celles de l'agent correcteur, pas du reviewer.

## Jugement

R37A-001 avait un défaut reproductible à la frontière du helper : `input.now` pouvait choisir une heure historique, et un saut d'horloge entre admission et résultat n'était pas revérifié. Ce n'est pas un exploit public confirmé : l'appelant R37c utilise déjà un schéma `.strict()` qui rejette `now`, puis lit `readProviderTrustedNow(options.clock)`. Les sept tests R37h existants étaient verts avant la correction. La fraîcheur demeurait néanmoins insuffisante : le coordinator transmettait au helper l'heure capturée avant plusieurs attentes DB.

R37A-002 décrit correctement une **limite de confiance** : un callback JavaScript arbitraire n'est pas isolé par un champ de résultat. Aucun fetch, SDK provider ou egress réel n'a été exécuté pour la reproduction. Le test effectue seulement une mutation locale de compteur puis retourne une déclaration synthétique. Cette preuve n'atteste ni un exploit public, ni l'accès réseau, ni son refus. Le finding ne doit pas être fermé comme « isolation prouvée ».

## Correction bornée

- `sealSyntheticAttempt(... now)` conserve son rôle de préparation historique et ses fingerprints. Un seal valide reste non dispatchable et ne donne aucun droit d'exécuter aujourd'hui.
- `runSyntheticAttempt` retire `now` du type runtime et refuse aussi sa présence à l'exécution. L'horloge est une option interne de service/test, jamais un champ à désérialiser depuis la requête. Le défaut lit `new Date()`; une horloge interne invalide ou une autorisation future/expirée échoue fermée.
- Le helper relit l'heure à l'admission, immédiatement avant le callback dans la microtask et avant d'émettre la preuve. Le timer monotone, le plafond de latence et l'annulation coopérative restent distincts du temps civil. Aucun arrêt de travail externe n'est revendiqué.
- R37c relit après les attentes DB de claim et contrôle grant + autorisation sealed, puis établit la lease depuis cette heure fraîche. Il transmet l'option d'horloge au helper, et non plus une chaîne `now` de requête. Il vérifie de nouveau l'autorisation sealed avant stockage terminal, en plus du contrôle de lease existant.
- Le type `SyntheticProviderTransport` documente explicitement son rôle de code fixture de confiance. `SYNTHETIC`, `certified:false` et les flags sans transport classifient des résultats contractuels; ils ne constituent pas une attestation I/O. Ce patch n'ajoute ni OS sandbox ni registre fermé d'adapters.

Les checks restent des contrôles applicatifs, pas une transaction distribuée garantissant l'arrêt du temps entre une lecture et une écriture DB. Un callback interne malveillant, une horloge interne falsifiée ou l'isolation OS demeurent hors garantie. Aucune nouvelle route publique ou exécution provider n'est ajoutée.

## Chaîne d'appel à inclure au reviewer

Lire ces fichiers ensemble, sans se limiter au diff :

- `src/server/construction-operating-assistant-r37a/sealed-executor.ts` et `src/lib/construction-operating-assistant-r37a/contracts.ts`;
- `src/server/construction-operating-assistant-r37c/coordinator.ts` et `src/lib/construction-operating-assistant-r37c/contracts.ts` (`executeControlledSyntheticAttemptSchema.strict()`);
- `src/server/construction-operating-assistant-r37b/activation.ts` (`ProviderTrustedClock` et `readProviderTrustedNow`);
- `src/server/construction-operating-assistant-r37f/provider-delivery.ts` et `src/lib/construction-operating-assistant-r37f/contracts.ts` : wrapper fixture, lease relue avant/après, résultats synthétiques, pas sandbox;
- `test/construction-operating-assistant-r37h-provider-trusted-clock.test.ts` et tous les tests des descripteurs after ci-dessous.

Une recherche statique de `runSyntheticAttempt` dans `src/scripts` trouve R37c comme appelant; celle d'`executeControlledSyntheticAttempt` trouve R37f. Cela ne remplace pas une analyse exhaustive de joignabilité dynamique. Les autres chemins provider du dépôt sont inventoriés dans `GATEWAY_INVENTORY.md`.

## Preuves natives, conservées sans écrasement

| Commande | Résultat | Interprétation |
| --- | --- | --- |
| `g3-runtime-clock-before` | 5 fail / 7 pass | Erreur de fixture de l'auteur : `caseId` n'avait pas le préfixe R36B requis. **Pas une reproduction produit.** |
| `g3-runtime-clock-before-r1` | 3 fail / 9 pass | Fixture corrigée, produit encore inchangé : override historique, saut d'horloge terminal et expiration dans la microtask réellement reproduits. R37h 7/7 vert. |
| `g3-runtime-clock-after` | 28/28 pass | Helper corrigé; tests de deux expirations pendant await DB simulé, R37a/c/g/h. |
| `g3-runtime-clock-after-r1` | 29/29 pass | Ajout d'un contrôle terminal explicite R37c; aucune preuve EVIDENCE_RECORDED acceptée après expiry. |
| `g3-runtime-clock-after-r2` | 29/29 pass, stderr vide | Retest frais après correction des types des mocks de test; mêmes 29 cas. |

Descripteurs : `launch/<id>.json`. Commande/temps/hashes/flux : `evidence/commands/<id>/{command.json,stdout.txt,stderr.txt}`. Chaque run charge le garde réseau local et utilise uniquement des fixtures. Les tests coordinator mockent la DB et les opérations de spend; ce ne sont pas des tests PostgreSQL réels. Aucune assertion de succès provider, secret, facture, audio ou Samsung.

Le lint ciblé des six fichiers produit/tests modifiés passe. Le typecheck global frais ne signale aucune erreur dans ces fichiers, mais reste rouge sur `test/unit/release-source-binding-review.test.ts:18`, hors de cette lane. Ce n'est donc pas un typecheck global vert.

## À revoir distinctement

Vérifier le passage de l'option d'horloge, les trois points de relecture du helper, les checks post-DB/terminal du coordinator, la conservation des bindings/replay et les limites de cancellation. R37A-002 demeure une limitation explicite, non un contrôle d'isolation accompli. Les anciens rapports R37 restent immuables; la campagne n'adopte aucun modèle.

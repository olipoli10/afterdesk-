# Offre individuelle : revue bornée lecteur / GET

2026-09-10, lane `android_permission_readiness`. Verdict **GREEN borné**, aucun nouveau défaut concret trouvé. Cette contre-revue par une autre lane n'est pas une validation indépendante de qualité du modèle ou une homologation de produit.

## Sources et portée

Lecture intégrale des deux sources, de leurs 103 tests auteur, de la fixture producteur-dérivée et de l'audit auteur. Plans backend/mobile et addenda individuels examinés dans le contexte des tranches précédentes. Guide `engineering:code-review` relu; skill Next et références route/runtime/async ainsi que guides Next installés avaient été lus intégralement dans la tranche HTTP C3 immédiatement antérieure.

- Lecteur `src/server/personal-assistant/correlated-calendar-approval-offer.ts` : SHA256 `80a0be51c2c35c83ae6d28b279fb821d24e19831139e6c28634295a8cd1a424d`.
- Route `src/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer/route.ts` : SHA256 `38b22379b8aafe09c350e85b921ec924cfea1f8b2752065b5d6e21fc5aa6b74e`.

Empreintes revérifiées après les tests : inchangées. Aucune modification de production, V1, collection, migration, SQL, mobile ou fixture native.

## Contrats relus

Le lecteur ne sélectionne qu'une review fournie, appelle une fois le gate canonique C2a, et garde le contrôle courant OWNER/modèle/Google dans ce gate. Il recalcule la vue/fingerprint et le hash historique six champs de la demande, compare le draft exact à l'item V1, puis copie et fige la présentation avant l'await de l'horloge finale. La preuve sémantique des deux SMS vient du gate canonique, pas du schéma de transport seul : ce dernier n'est pas une preuve cryptographique autonome d'autorité.

La projection retire les informations privées de gate (opération calendrier, credentials, grant, claim/nonce), tout en conservant les IDs des deux sources déjà présents en V1. Les champs d'offre servent de préconditions de comparaison pour une future commande explicite, jamais d'autorisation ou preuve de lecture humaine. Aucun bouton, POST ou exécuteur dans cette tranche.

La phase transactionnelle inclut maxWait dans son plafond et utilise une borne monotone. L'horloge DB finale doit rester comprise entre inspection et expiration. L'intervalle clock/commit est compté conservativement depuis avant le SELECT, puis le GET compte tout son intervalle lecteur. Cette double prudence peut refuser tôt une offre proche de l'expiration, mais ne renouvelle ni inspectedAt ni expiry.

Le GET conserve une deadline depuis l'entrée, session CLIENT vérifiée, query strictement workspaceId/reviewId, limite par utilisateur, et validation fermée de sortie. Refus opaque après parsing tardif/abort/retrait de switch; private,no-store et Vary Cookie,Authorization. L'infrastructure RateLimit existante reste la seule mutation HTTP possible. Une attente d'auth suspendue n'est pas prétendue terminée de force.

## Preuves de cette lane

Fichiers nouveaux :

- `test/correlated-calendar-approval-offer-review.test.ts` : 8 cas.
- `test/correlated-calendar-approval-offer-route-review.test.ts` : 7 cas.

À **15:36:32 : 118/118 PASS**, soit 15 contre-tests +103 auteur. ESLint des deux fichiers : exit0. TypeScript global `tsc --noEmit` : exit0 après ces tests.

Les contre-tests exécutent les vraies fonctions wrapper/GET et les vrais schémas, avec gate/transactions ou auth/rate/lecteur mockés selon la frontière. La fixture part des producteurs purs existants. Oracles supplémentaires :

- Textes complets et empreinte inchangés malgré mutation du gate pendant le commit ; gel des tableaux/objets exposés et liste exacte des clés racine.
- Retrait de l'authorityRef exact ou changement de la date canonique du pilote après commit.
- Attente de callback consommant cinq secondes, puis recul de l'horloge murale ; NaN/recul monotone après commit.
- Remplacement réel du signal dans le contexte mutable puis annulation de l'original.
- Expiration exactement atteinte par le cumul de latence clock et commit.
- Annulation et switch retiré pendant les getters du parsing strict final HTTP.
- Budget initial inchangé après auth/limiter, sans succès tardif si le lecteur consomme la dernière seconde.
- Réponse valide positive puis ajout uniquement d'une propriété d'action imbriquée : refus strict.
- Absence de session traitée avant query privée invalide ; sortie opaque sur horloge non finie/rétrograde.

Aucun RED produit nouveau n'a été observé dans cette contre-revue. Aucune simulation n'est présentée comme une preuve de locks/commit/rollback PostgreSQL, d'authentification HTTP réelle, de comportement Next HEAD/OPTIONS/405, de geste humain, d'appareil ou de réponse fournisseur.

## Dépendances inchangées

Le contrôleur possède la preuve native de l'offre et la suite C2c. L'offre n'autorise rien seule : le futur claim doit recharger les bindings courants et refuser une vue différente/expirée ; le wrapper ne doit exécuter qu'un claim dont le commit est confirmé, sans retry silencieux. Cette revue ne débloque aucune activation ni approbation générique.

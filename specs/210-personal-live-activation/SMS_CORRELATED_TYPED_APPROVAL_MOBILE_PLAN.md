# Approbation typée d’un rendez-vous issu de deux SMS

## Controller addendum — 2026-09-10 19:22Z

For the first implementation, use the selected V1 card's existing reviewId with
the sibling GET `/correlated-calendar-reviews/approval-offer`, rather than a new
negotiated approval collection. No manual identifier, new guide, automatic POST
or claim on read. Display and freeze the precise review returned with that offer
before allowing an explicit approval gesture. The V1 collection remains unchanged.
See the backend plan addendum for single-namespace/time/opaque-refusal invariants.
Backend execution proofs remain required before implementing the approval button.

2026-09-10 — **PROPOSITION, DESIGN ONLY.** Un seul document; aucun bouton, endpoint, flag, schéma ou garde modifié. Décision backend réservée au contrôleur. La liste/carte v1 reste `readOnly:true`, `approvalAvailable:false`, `executionAuthorized:false`.

## Point de départ vérifié

- `personal-model-reviews.tsx` possède déjà un geste explicite, un verrou synchrone et un reçu strict `{providerEventId, confirmed:true}`. Son `createPersonalCalendarApprovalFence` conserve les tentatives inconnues dans la session de l’écran. Réutiliser ces principes, pas copier ses limites de cycle de vie dans la nouvelle liste.
- `personal-google-connection.tsx` appelle le même `MobileApi.approvePersonalCalendar`, mais son bouton/traitement d’erreur n’est pas le modèle de sûreté pour cette tranche. Aucun nouveau lien vers son bouton générique ne rendrait un brouillon corrélé approuvable.
- `calendar-actions.ts` bloque intentionnellement tout marqueur `correlatedTemporalReceiptId` **OU** relation globale dans `lockWrite`, donc à la prise du claim et à ses relectures d’exécution. POST `/personal/google/actions` n’accepte que l’approbation générique operationId/hash. Ce blocage n’est pas un bug actuel à contourner.
- Le même fichier dispose du bon moteur à conserver : claim local pending/0 → processing/1, nonce durable, marqueur de dispatch à usage unique, autorité WRITE verrouillée avant départ HTTP, attente réseau hors transaction, relecture et CAS terminal exacts. `GoogleCalendarClient.insertEvent` exige la réponse Google correspondant à l’événement attendu avant `confirmed:true`.
- Le lecteur corrélé actuel relit le reçu accepté, les deux sources complétées, les preuves/calculs et l’autorité courante; il refuse après l’expiration originale. La carte/liste ne contient ni hash d’approbation ni autorisation d’exécuter.

## Raccord recommandé — même service, nouvelle variante explicite

Conserver la liste v1 et la carte fonctionnellement inchangées. Une future variante **séparée et versionnée** de la lecture peut contenir, par entrée, `review` égal à l’item read-only actuel plus une union `approvalOffer` :

- `UNAVAILABLE`, motif fermé non sensible; ou
- `ELIGIBLE_FOR_EXPLICIT_APPROVAL`, uniquement pending/attempts0/leaseNULL, avec `reviewId`, `expectedRequestHash`, `expectedReviewFingerprint`, `approvalExpiresAt` et version de fingerprint.

Recommandation de transport : version explicite `view=approval-v1` sur le même GET de collection, avec schéma réponse distinct `personal-correlated-calendar-approval-list-v1`. Ne pas ajouter silencieusement des champs à v1. Le contrôleur peut retenir un endpoint sibling équivalent, mais doit figer une seule convention avant le client.

Le wrapper mobile rend les **deux SMS complets et le brouillon exact** avec la carte existante, puis un seul bouton explicite d’ajout à Google seulement pour cette variante prouvée. Aucun ID à copier, édition des textes, approbation implicite, second modèle ou nouvelle page-guide. Une offre n’est pas une approbation; les booléens read-only de l’item et du packet historique ne sont jamais réécrits.

## Contrat POST privé recommandé

Endpoint authentifié proposé : `POST /api/endvera/v1/personal/model/correlated-calendar-reviews/approve`.

```ts
{
  version: "personal-correlated-calendar-approval-command-v1",
  workspaceId,
  reviewId,
  expectedRequestHash,        // hash existant du request calendrier exact
  expectedReviewFingerprint  // version/hash émis avec CETTE vue
}
```

Pas de `userId`, operationId, textes, dates, accountId, preuve libre ou `approved:true` fourni par le mobile. L’acteur vient exclusivement de la session authentifiée et doit être OWNER actuel, pas l’admin plus large permis au parcours legacy. Le serveur retrouve l’opération via la relation exacte. Même garde de session/origine de requête que les écritures authentifiées existantes; pas de mutation GET. Préparation et lecture n’activent pas ce POST : activation d’approbation distincte et OFF tant que ses preuves manquent.

Le fingerprint est calculé par le serveur avec un sérialiseur canonique fermé/versionné. Il lie review/receipt et scope propriétaire, requestHash, packet/proof/résolution, les **deux** identités/hash/textes de source et citations UTF-16, ancre/fuseau/slot, valeurs exactes présentées et leurs règles de normalisation. Les bindings courants nécessaires (notamment compte/version et epochs propriétaire) sont comparés au moment de l’usage. Ne pas inclure un inspectedAt volatil dans l’identité de contenu; la fraîcheur reste une borne séparée. Un hash présenté par le client est seulement une précondition de comparaison, jamais preuve d’autorité ou de lecture humaine.

Réponses fermées proposées, toutes liées à reviewId/fingerprint :

| Résultat | Réponse / sens mobile |
|---|---|
| Succès durable vérifié | 200, version de reçu typé, `status:"CONFIRMED"`, `receipt:{providerEventId,confirmed:true}`, `automaticRetry:false`. Montrer « Google a confirmé cet ajout » seulement après validation stricte du reçu et de son binding. |
| Claim connu, résultat non établi | 202, `status:"PENDING_RESULT"`, `automaticRetry:false`. Attendre ou relire le résultat; jamais envoyer de nouveau POST. |
| Vue changée, expirée ou refusée | 409/403 opaque, `automaticRetry:false`; aucune affirmation globale « rien n’a été fait » si un concurrent/claim antérieur existe. |
| HTTP perdu, timeout, abort, reçu incohérent | État mobile inconnu. Annuler l’attente n’annule pas nécessairement l’ajout; ne pas réarmer le bouton. |

## Dépendance backend indispensable avant tout bouton

Créer une origine interne typée, pas un `allowCorrelated` générique ni un deuxième exécuteur. La branche legacy conserve son refus global marqueur OU relation, même avec un operationId/hash connu. Un claim corrélé forgé ne suffit jamais.

1. Sous transaction SERIALIZABLE bornée : ordre namespace → question/reçu → sources/autorités → relation/calendrier compatible avec les lecteurs actuels. Recharger/recalculer la preuve canonique de la vue, vérifier OWNER et bindings modèle/Google actuels, pending/0, hash/fingerprint, DB clock et expiration. Ne jamais inventer de lease aux deux SMS déjà completed.
2. Enregistrer le choix exact dans le claim durable (origine review/receipt/fingerprint/requestHash, acteur et nonce), atomiquement avec le CAS pending→processing. Un concurrent ne peut ni réserver un second claim ni effacer celui du gagnant. Pas de retry transactionnel automatique susceptible de relancer une exécution.
3. Passer ce claim à **l’exécuteur existant**, dont chaque relecture doit reconnaître et revérifier l’origine typée depuis la DB. Garder marqueur one-use, copies privées, dernier contrôle courant avant HTTP, absence d’attente réseau sous locks, CAS terminal, récupération incertaine et absence de réessai. Ne pas enlever le refus global sans le remplacer par cette preuve aux mêmes points.
4. Conserver le binding de l’approbation dans le résultat durable confirmé/incertain, pas uniquement dans une réponse HTTP perdable. Le champ `result` existant peut suffire avec une union interne stricte; ce n’est **pas** une conclusion qu’aucune migration n’est nécessaire. Le contrôleur tranche après revue SQL/CAS/recovery. Aucun budget/consent/grant ni historique source ne change pour faciliter l’action.

Un simple appel du lecteur suivi du legacy approver ne fonctionne pas : l’origine reste bloquée et les checks seraient séparés du claim. Les invariants doivent atteindre le gate verrouillé avant HTTP, pas seulement la route.

## Expiration, résultat inconnu et UX

Trois notions distinctes : fenêtre originale de **préparation**, fenêtre d’**approbation**, et lecture **historique**. Première règle recommandée conservatrice : approbation jamais après `min(preparationExpiresAt,pilot courant)`; la prise de claim ne renouvelle rien. Définir explicitement la règle post-réponse avant le backend : si la relecture requise ne passe plus, conserver l’incertitude plutôt qu’inventer une confirmation.

Aujourd’hui, même la lecture des deux textes devient indisponible après la fenêtre originale (souvent moins de dix minutes restantes). Cette tranche ne promet pas d’historique durable lisible. Texte : « La vérification a expiré. L’ajout n’est pas disponible ici. » Cela ne signifie ni suppression du brouillon ni absence d’effet.

Après une tentative, il faut au minimum un **GET de résultat typé** par reviewId dans le même service, distinct de la lecture des textes : autorité de consultation actuelle + mapping immuable + résultat durable exact, sans réautoriser pending ni renouveler TTL. Recommandation `GET /.../correlated-calendar-reviews/approval-result?workspaceId=...&reviewId=...`. Il peut confirmer un reçu durable après TTL sans rouvrir les SMS expirés. S’il est indisponible : « Ajout non confirmé. Vérifie ton Google Agenda avant de refaire la demande. » Ce GET et sa politique de consultation sont des dépendances à arbitrer, pas des endpoints existants.

Le mobile fige l’offre montrée et marque la tentative **avant le premier await**. Scope utilisateur/session/workspace, foreground, lecture non expirée et pending exact sont revérifiés au tap. Une seule requête; pas de POST dans refresh, focus, hydratation ou reprise réseau. Une nouvelle lecture ne remet pas une tentative inconnue à zéro. Le registre de tentative doit survivre au démontage de la carte/liste dans la même session; après relance d’app, consulter d’abord le résultat serveur, jamais restaurer un envoi en attente automatique. Sans moyen sûr de réconcilier une tentative inconnue, le bouton reste fermé; ne pas choisir l’autoretry pour simplifier le stockage. Une éventuelle persistance locale de ce marqueur, sans textes et sans file d’envoi, nécessite son propre choix borné.

## Ordre exécutable et tests minimum

1. **Arbitrage backend** : fingerprint fermé, origine claim durable, expiration et GET résultat. Sinon rester read-only.
2. **Backend puis revue indépendante** : vrai parcours local reçu→préparation→offre→claim→exécuteur existant avec HTTP injecté. Concurrence à deux connexions : deux taps/un même claim/un départ; replay et claim forgé zéro nouveau départ; generic POST toujours refusé. Révocations avant/après latence, changement hash/deuxième citation/compte/OWNER, expiry et clocks UTC/NY/Tokyo, échec CAS/commit/recovery, preuve d’aucune attente réseau sous locks. Distinguer unités mockées et SQL natif réellement exécuté.
3. **Contrats mobiles seulement après ces preuves** : ancienne v1 toujours acceptée sans bouton; variante inconnue refusée; deux textes/UTC/fuseau inchangés; offre différente ne peut approuver l’ancienne carte. Double tap synchrone, expiry au tap, téléphone décalé, background/unmount/session changée à chaque await, reçu appartenant à une autre vue, timeout avant/après commit et refresh ne renvoient aucun POST. Seul le reçu typé confirmé donne la phrase de succès.
4. **Raccord unique dans personal-service**, sans page ni ID manuel, puis checks mobile/serveur et contrôle d’export local coordonné. Aucun test ci-dessus n’a été exécuté par ce document; aucun test synthétique ne vaut preuve Samsung ou fournisseur réel.

Critère d’arrêt : si un bouton nécessite d’alléger le refus générique, d’étendre silencieusement le TTL, d’utiliser les textes affichés comme autorité, de recréer le draft après incertitude ou de promettre une lecture historique inexistante, garder la carte read-only. L’approbation typée reste indisponible jusqu’à la décision et la preuve backend du contrôleur.

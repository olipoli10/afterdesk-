# AUDIT PRÉ-LANCEMENT AfterDesk — Rapport consolidé
Généré le 2026-08-02. Chaque constat = fichier:ligne ou vérification live sur afterdesk.co.

---

# 🔴 BLOQUEURS ABSOLUS (vérifiés personnellement)

## B0a — CRITIQUE — Un trigger de base de données empêche TOUTE tâche client d'entrer dans le pool
**Où** : `prisma/migrations/20260730001000_integrity_triggers/migration.sql:37-45` vs `src/lib/payments/stripe.ts:191,223-231`
**Quoi** : le trigger `Task_protect_invariants` (BEFORE UPDATE ON "Task") interdit la transition `awaiting_payment → open` pour toute tâche non-interne s'il n'existe pas un Payment de statut **`received`** :
```sql
IF NEW."status" = 'open' AND OLD."status" = 'awaiting_payment' AND NOT NEW."isInternal"
   AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."taskId" = NEW."id" AND p."status" = 'received')
THEN RAISE EXCEPTION 'a paid client task cannot enter the pool without received payment';
```
Or, depuis le passage à l'escrow, `fulfillCheckout` pose `status: "authorized"` (`stripe.ts:191`) puis transitionne `awaiting_payment → open` **dans la même transaction** (`stripe.ts:223-231`). Le paiement n'est `received` qu'à la capture, 48 h **après** l'approbation QC.
**Conséquence** : l'exception est levée à chaque fois, la transaction du webhook est annulée. **Aucune tâche d'un vrai client payant ne peut jamais atteindre le pool.** Elle reste bloquée en `awaiting_payment`, carte autorisée, personne ne peut travailler dessus.
**Chronologie du bug** : trigger créé le 2026-07-30 ; escrow livré le 2026-07-31 (`d5b05c9`, `482356d`) avec la migration `20260731020000_payment_authorize_capture` qui **n'ajoute que des valeurs d'enum** et ne touche pas au trigger. Un seul fichier de migration définit ce trigger (vérifié) — il n'a jamais été mis à jour.
**Pourquoi ce n'est jamais sorti en test** : les tâches internes sont exemptées (`AND NOT NEW."isInternal"`). Tout test fait avec des tâches internes passe. Et sans clés Stripe en prod (B2), aucun checkout réel n'a jamais abouti.
**Effort** : faible (~30 min) — une migration corrigeant la condition en `IN ('authorized','received')`.
**Statut de preuve** : ✅ **CONFIRMÉ À L'EXÉCUTION** — voir la reproduction ci-dessous.

## B0b — CRITIQUE — Un second trigger empêche TOUTE approbation QC d'une tâche Standing Capacity
**Où** : même migration, `second_shift_completed_task_has_payout` vs `src/server/actions/admin-qc.ts`
**Quoi** : le trigger `Task_completed_requires_payout` (CONSTRAINT TRIGGER DEFERRABLE) exige qu'une tâche atteignant `completed` avec un `claimedById` ait une row `Payout` correspondante. Or `approveDeliverable` **saute délibérément la création du Payout** pour les tâches Standing Capacity (garde `if (!isStandingCapacityTask)`) — le worker y est payé par période, pas par tâche. Et une tâche standing a bien un `claimedById` (`standing-capacity.ts:154,565`).
**Conséquence** : l'exception `completed task has no worker payout` est levée au COMMIT. **Aucune tâche Standing Capacity ne peut jamais être approuvée en QC.**
**Effort** : faible (~30 min) — exempter les tâches `standingCapacityAccountId IS NOT NULL` dans le trigger.

**Racine commune B0a/B0b** : deux invariants encodés en base pour le modèle d'avant (paiement capturé immédiatement, paiement par tâche) que les fonctionnalités suivantes (escrow, Standing Capacity) ont invalidés, sans qu'aucune migration ne les mette à jour. Les gardes applicatives ont été adaptées ; les gardes base de données non.

### ✅ REPRODUCTION À L'EXÉCUTION (PostgreSQL réel)
Exécutée sur PGlite (PostgreSQL compilé en WASM), avec les définitions de triggers **copiées mot pour mot** depuis la migration. Script : `scratchpad/repro.mjs`.

| Scénario | Résultat | Exception |
|---|---|---|
| **B0a** — tâche client, paiement `authorized` → `open` | 🔴 **BLOQUÉ** | `a paid client task cannot enter the pool without received payment` |
| Contrôle — même chose, paiement `received` | ✅ passe | — |
| Contrôle — tâche **interne**, aucun paiement | ✅ passe | — |
| **B0b** — tâche Standing Capacity → `completed` sans Payout | 🔴 **BLOQUÉ** | `completed task has no worker payout` |
| Contrôle — tâche one-off → `completed` **avec** Payout | ✅ passe | — |

Les deux contrôles qui passent sont aussi importants que les deux échecs : ils prouvent que le trigger discrimine bien sur le statut du paiement (donc que le modèle pré-escrow fonctionnait), et **que l'exemption `isInternal` est exactement la raison pour laquelle les tests internes n'ont jamais rien vu**.

**Portée du test** : il valide la logique des triggers avec un schéma réduit aux seules colonnes qu'ils consultent (`Task.status`, `Task.isInternal`, `Task.claimedById`, `Payment.status`, `Payout`). Il ne fait pas tourner l'application complète. Comme les triggers ne lisent rien d'autre, c'est un test fidèle de l'invariant lui-même.

---

## B0c — CRITIQUE — `/ledger` publiera le prix client ET le paiement worker au cent près : la RÈGLE 2 cassée dans les deux sens
**Où** : `src/lib/queries/public-ledger.ts:59-73` + `src/app/ledger/page.tsx:22-28`
**Chaîne complète, vérifiée personnellement ligne par ligne** :
1. `Payment.amountCents = task.clientPriceCents` — `stripe.ts:93` (**le prix client exact**)
2. L'entrée ledger `sale` reprend ce montant : `amountCents: authorized.amountCents` — `money-intents.ts:87`
3. `Payout.amountCents = submission.task.vaPayoutCents!` — `admin-qc.ts:179` (**le paiement worker exact**)
4. L'entrée ledger `payout` reprend ce montant — `admin-payments.ts:336`
5. Le ledger public sélectionne `amountCents`, `kind`, `occurredAt` **sans aucune mise en tranche** — `public-ledger.ts:65-73`
6. Rendu en dollars exacts, horodaté — `ledger/page.tsx:22-28`

**Conséquence** : n'importe qui, sans authentification, lit sur `/ledger` une ligne `sale` de $X puis une ligne `payout` de $Y horodatées. **Un worker apprend le prix payé par le client et la marge de la plateforme ; un client apprend ce que touche le worker.** C'est exactement ce que la RÈGLE 2 interdit.

**Aggravant** : le reste du code fait l'effort inverse. `public-stats.ts:34-36` applique un seuil de profondeur (`MIN_MONEY_DELIVERIES = 25`) **et** un arrondi en tranches (`MONEY_BUCKET_CENTS`) précisément pour empêcher cette dérivation — et `/ledger` contourne tout le dispositif. Le commentaire normatif de `public-stats.ts:6-8` décrit l'attaque en croyant s'en prémunir.

**Statut** : **latent aujourd'hui** (le ledger est vide, `$0`), **actif dès la première transaction réelle**. C'est le genre de bug qui n'apparaît qu'après le lancement, sur une page publique et indexable.
**Effort** : faible (~1 h) — mettre les montants en tranches sur `/ledger`, ou n'y publier que les totaux agrégés.

## B0d — CRITIQUE — Les ventes n'ont jamais `isInternal` : les tâches internes entrent dans les chiffres publics
**Où** : `src/server/money-intents.ts:85-92` et `src/server/actions/standing-capacity.ts:216-222`
**Quoi** : l'insertion de l'entrée `sale` ne passe **ni `isInternal` ni catégorie**, alors que le remboursement 120 lignes plus bas (`money-intents.ts:204-214`) passe les deux. `insertLedgerEntry` applique alors les défauts permissifs `isInternal ?? false` et `publiclyVisible ?? true` (`ledger.ts:39`) — l'entrée franchit donc **les deux filtres** de `public-ledger.ts:47,61`.
**Conséquence** : chaque tâche interne/de test que tu passes toi-même gonfle le total public affiché, et s'affiche sans catégorie (« — »). Le ledger étant append-only, **c'est irrattrapable autrement que par une entrée de correction**.
**Effort** : très faible (~20 min).

## B0e — CRITIQUE — Aucun fichier ne peut être téléversé en production
**Où** : `src/lib/file-security.ts:302-310` + `:373`, et l'absence de `CLAMAV_HOST` en production.
**Quoi** :
```js
const host = process.env.CLAMAV_HOST;
const required = process.env.NODE_ENV === "production" || process.env.FILE_SCAN_MODE === "required";
if (!host) { if (required) throw new ScannerUnavailableError(); return "heuristic-only"; }
```
`scanWithClamAv` est appelé sans condition dans le pipeline d'upload (`:373`). En production, `NODE_ENV === "production"` force `required = true` **à lui seul**, et `CLAMAV_HOST` est **absent de la liste des variables Vercel** (vérifié). Donc : exception à chaque téléversement → `503` (`upload/route.ts:133-135`).
**`FILE_SCAN_MODE` ne peut pas sauver la situation** : une seule occurrence dans tout le dépôt (`:305`), et elle ne peut que *renforcer* la contrainte (`=== "required"`), jamais la lever. Quelle que soit sa valeur en prod, le scan reste obligatoire.
**Conséquence** : **un client ne peut joindre aucun fichier à une tâche, un worker ne peut livrer aucun fichier.** Le cœur du produit est inopérant.
**Nuance importante** : ce comportement est *correct du point de vue de la sécurité* — la promesse « Production scanning fails closed when the malware service is unavailable » de /security est **honorée à la lettre**. Le problème n'est pas le code, c'est qu'aucun scanner n'est déployé.
**Effort** : moyen — déployer un ClamAV accessible et configurer `CLAMAV_HOST`/`CLAMAV_PORT`, ou décider consciemment d'un mode heuristique pour le lancement (ce qui rendrait alors la promesse publique fausse et exigerait de réécrire /security).

## B0f — CRITIQUE — La RÈGLE 1 tombe par Standing Capacity : le texte du client atteint le worker sans aucune médiation
**Où** : `src/server/actions/standing-capacity.ts:438-459` + `src/lib/queries/standing-capacity.ts:48-53` + `src/app/va/standing-capacity/page.tsx:51-73`
**Quoi** : le client écrit `communicationStyle` (500 car.), `deliverableFormat` (500 car.) et `notes` (2000 car.) via `writeAccountPreference`. Ces trois champs sont sélectionnés par `workerAccountSelect.preference` et **affichés tels quels au worker**. Aucune approbation admin, aucun scrub.
**Le code l'admet lui-même** (`:438-439`) : « *The client's own words about their own working style — **written directly, no operator mediation***. »
**Second chemin, pire** : `submitStandingTask` (`:484-587`) fait passer une tâche `submitted → claimed` **dans la même transaction que sa création** (`:558-567`), avec un `description` de 20 000 caractères écrit par le client, directement à l'assigné. Aucune file de pricing, aucun écran admin, aucune attestation `filesVerified`.
**Preuve d'exploitation** : un client tape « *je suis Jean Tremblay, Comptabilité Tremblay inc., 514-555-0199, jean@tremblay.ca* » → le worker le lit dans les deux cas.
**Aggravant** : l'outillage de scrub **existe déjà** (`src/lib/assistant-scrub.ts`, `src/lib/forbidden-vocabulary.ts`) mais n'est câblé **que sur l'assistant IA**. Et `src/server/actions/intake.ts:65` affirme « *no task reaches a worker without the operator's content review* » — vrai pour le one-off, **faux pour Standing Capacity**.
**Effort** : moyen — câbler le scrub existant sur ces chemins, et/ou insérer une revue admin avant routage.

## B0g — CRITIQUE — L'approbation QC n'a aucun contrôle d'identité : la brèche RULE 1 la plus probable en exploitation réelle
**Où** : `src/server/actions/admin-qc.ts:29-32` (`approveSchema`) + `src/components/qc-form.tsx:88-95`
**Quoi** : `approveSchema` n'accepte que `{ submissionId, rating }`. **Aucune attestation d'identité, aucun scan du contenu** — `file-security.ts` ne traite que les métadonnées, jamais le contenu visible. L'UI permet d'approuver **au clavier seul** (`1`-`5` puis `Ctrl+Enter`) sans ouvrir un fichier.
**Asymétrie révélatrice** : le chemin de pricing, lui, impose une attestation obligatoire (`admin.ts:75-81`, `filesVerified`). Le QC — le dernier rempart avant le client — n'en a aucune.
**Preuve d'exploitation** : un worker livre un `.docx` signé « *Maria — maria@gmail.com, contactez-moi en direct, 40 % moins cher* ». L'opérateur enchaîne « Approve & next ». Le client télécharge le fichier signé. **Le worker a un motif économique direct de le faire.**
**Effort** : faible — ajouter une case d'attestation au QC, symétrique de celle du pricing.

## B0h — CRITIQUE — Un worker jamais approuvé ne peut structurellement jamais être suspendu automatiquement
**Où** : `src/server/actions/admin-qc.ts:124-154` vs `:246-310`
**Quoi** : `dropsBelowFloor` exige `score !== null`, et `score` est calculé **exclusivement** depuis les `Submission` `qcStatus: "approved"` avec une note. Un worker dont aucune livraison n'est jamais approuvée garde `scoreCache = null` **à vie** → `dropsBelowFloor` est structurellement `false`. `rejectDeliverable` n'incrémente que `qcRejections`, sans recalcul ni test.
**Exploitation** : réclamer 3 tâches (`maxActiveClaims: 3`), livrer du vide, se faire rejeter 2 fois (`maxQcRounds: 2`), la tâche repart au pool, en reprendre 3 autres. **Répétable indéfiniment, et chaque cycle brûle la deadline d'un vrai client.** Aucun sweep ne compense (`sweeps.ts` ne touche jamais `VaProfile`).
**Effort** : faible-moyen.

---

# 🔴 BLOQUEURS DE DÉPLOIEMENT (vérifiés personnellement en production)

## B1 — CRITIQUE — Le cron n'a jamais tourné une seule fois
**Où** : `vercel.json` + `src/app/api/cron/maintenance/route.ts:36`
**Quoi** : la route n'exporte que `POST`. Les crons Vercel invoquent en **GET** (doc Vercel, maj 2026-06-16 : « Vercel makes an HTTP GET request »).
**Preuve live** : `GET https://afterdesk.co/api/cron/maintenance` → **405**, header `Allow: OPTIONS, POST`. `git log -p --follow` : jamais exporté en GET → n'a jamais fonctionné.
**Chaîne de l'argent morte** : QC approuvé → `releaseHeldFunds()` **n'appelle pas Stripe**, il enfile un `MoneyIntent capture_client_payment` (`src/lib/escrow.ts:58-68`) → traité uniquement par `processMoneyIntents()` (`src/server/money-intents.ts:8`) → appelé **uniquement** par la route cron (`route.ts:49`, grep exhaustif).
**Conséquence** : aucune carte jamais capturée (le hold meurt à 7 j), aucun payout, aucun courriel, aucune purge de fichiers, périodes Standing jamais avancées.
**Atténuation partielle** : `runOperatorSweeps()` (`src/server/sweeps.ts:282`) rattrape certains sweeps quand un admin ouvre `/admin`, `/admin/pricing` ou `/admin/qc` — mais **n'inclut ni `processMoneyIntents` ni `deliverPendingNotifications`**.
**Effort** : ~5 min (ajouter `export async function GET`).

## B2 — CRITIQUE — Aucune clé Stripe en production
**Où** : `npx vercel env ls production`
**Quoi** : `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` **absents**, alors que le code les exige.
**Conséquence** : paiement non fonctionnel de bout en bout ; contredit la promesse publique /security « A task cannot reach the worker pool until a signed webhook confirms the approved amount ».
**Effort** : ~10 min.

## B3 — CRITIQUE — Aucun courriel possible → inscription cassée
**Où** : `src/lib/email.ts:22-25`, `src/lib/auth.ts:78,85`
**Quoi** : `RESEND_API_KEY` et `EMAIL_FROM` absents de la prod. `sendEmail` **throw en production** sans clé. Or `sendVerificationOnSignUp: true` → OTP obligatoire → throw.
**Conséquence** : tout compte courriel/mot de passe échoue. Seul Google OAuth marche.
**Effort** : ~10 min.

---

# PHASE 1 — PARCOURS CLIENT

## CRITIQUES (au-delà des bloqueurs)

### P1-C1 — Le hold de 7 jours est structurellement incompatible avec le cycle de la tâche
**Où** : `stripe.ts:126` (`capture_method: "manual"`), `admin-qc.ts:103-108`, `escrow.ts:56-69`, `sweeps.ts:97-120`, `money-intents.ts:59-99`
**Quoi** : autorisation posée au paiement ; capture seulement après livraison + QC + 48 h de fenêtre dispute. Une autorisation Stripe expire à **7 jours**. Tout cycle > ~5 j de production échoue à la capture.
**Aggravant** : **aucun chemin in-app pour re-demander le paiement** (reconnu dans le code, `stripe.ts:568-571`). Le payout worker est déjà `released` mais bloqué « unfunded » (`admin-payments.ts:301-311`).
**Effort** : moyen-élevé (décision produit : capturer plus tôt, ou re-demander le paiement).

### P1-C2 — Aucune borne temporelle sur l'exécution : une tâche payée peut geler à vie
**Où** : `src/server/sweeps.ts` (absence vérifiée), `api/cron/maintenance/route.ts:41-51`
**Quoi** : aucun sweep/deadline sur `claimed`, `qc_rejected`, `revision_requested`. `vaDeadlineUtc` dépassée ne déclenche rien. `deadlinesMissed` jamais écrit ; `deadlineWarningHours` (`settings.ts:48`) jamais lu.
**Conséquence** : le client voit « Work is underway » indéfiniment ; le hold expire ; personne n'est alerté.
**Effort** : moyen.

### P1-C3 — Rejet QC totalement silencieux
**Où** : `src/server/actions/admin-qc.ts:257-296`
**Preuve** : vérifié personnellement — **zéro `notification.create`** dans `rejectDeliverable`, ni au round 1 ni à l'épuisement des rounds. (Contraste : `approveDeliverable` en crée deux, `submitDeliverable` notifie les admins.)
**Conséquence** : le worker n'apprend le retour de son travail qu'en rouvrant l'app spontanément.
**Effort** : faible (~30 min).

### P1-C4 — Une tâche jamais réclamée n'a ni sweep ni alerte, et reste réclamable non financée
**Où** : `sweeps.ts` (absence), `va-tasks.ts:33-116`
**Preuve** : vérifié personnellement — **`claimTask` ne consulte jamais l'état du paiement**.
**Conséquence** : après ~7 j le hold expire, mais la tâche reste dans le pool ; un worker peut livrer un travail sans financement.
**Effort** : faible-moyen.

### P1-C5 — Course capture-en-vol vs annulation/dispute → client débité sans remboursement
**Où** : `admin-resolutions.ts:228-235`, `admin.ts:264-271`, `money-intents.ts:33-41`
**Quoi** : la décision admin ne neutralise que les intents `queued|failed`. Un `capture_client_payment` déjà passé en `processing` (claim commité **hors** transaction de l'appel Stripe) capture pendant que la décision s'écrit. Le `cancel_authorization` ne trouve alors plus de payment `authorized` et se marque « already resolved ».
**État final** : Payment `received`, tâche `cancelled`, **aucun refund, aucune alerte**.
**Effort** : moyen.

### P1-C6 — Une tâche Standing Capacity peut atterrir dans le pool public → travail gratuit
**Où** : `admin-qc.ts:276`, `admin.ts:156`, `va-tasks.ts:131`, `queries/tasks.ts:159-168`
**Quoi** : 3 chemins légaux (épuisement QC, `reassignTask`, `releaseTask`) envoient une tâche standing dans le pool, qui ne filtre pas `standingCapacityAccountId`. Un VA quelconque la réclame et la livre — **payable par aucun mécanisme** (pas de Payout par tâche, et il n'est pas l'assigné de la période).
**Effort** : faible-moyen.

## MAJEURS (sélection — liste complète dans les segments)

| # | Où | Quoi |
|---|---|---|
| P1-M1 | `admin.ts:42-131` | **Le client n'est jamais averti que son prix est prêt.** Aucune Notification dans `approvePricing`. Le devis expire en 72 h → `lost/expired` sans un mot. Perte de revenus silencieuse garantie. |
| P1-M2 | `client-tasks.ts:31-138`, `state.ts:47` | **L'admin n'est jamais averti d'une nouvelle tâche.** `pricing_review` n'a aucune expiration ni alarme SLA, alors que le client voit une promesse « prix sous 4 h ». |
| P1-M3 | `settings.ts:173-174`, `sweeps.ts:97-120`, `client-tasks.ts:351-358` | **Fenêtre argent (48 h) ≠ fenêtre dispute (72 h).** Entre H+48 et H+72 la carte est capturée et le payout payable alors que la dispute est encore ouvrable → perte sèche possible. Contredit le contrat écrit du schéma (`schema.prisma:413-417`). |
| P1-M4 | `money-intents.ts:13-20` | **Famine du processeur.** `release_payout` reste `queued` jusqu'au versement manuel tout en occupant les slots du `take: 25` (tri `createdAt asc`) → ≥25 payouts en attente = captures/refunds jamais traités. |
| P1-M5 | `money-intents.ts:221-230` | **Échec définitif d'un intent = silence total.** Après 5 tentatives, disparition sans notification. |
| P1-M6 | `stripe.ts:509` | `charge.dispute.closed` « lost » est un **no-op complet** : pas de notif, payout jamais void, ClosedJobLog reste `won`. |
| P1-M7 | `admin.ts:151-174` | **Payout orphelin + boucle de sweep infinie** après réassignation post-approbation ; double paiement possible. |
| P1-M8 | `stripe.ts:221-309` vs `admin-payments.ts:65-83` | **Repool jamais notifié au pool** (ni `releaseTask`, ni QC épuisé, ni `reassignTask`, ni paiement manuel). |
| P1-M9 | `admin/page.tsx:19-46`, `admin/tasks/page.tsx:10-23` | **Aucune file « disputed » côté admin.** Une dispute dont la notif est manquée ne ressort nulle part. |
| P1-M10 | `admin.ts:305-323`, `admin-resolutions.ts:224-227` | **Le worker n'est jamais notifié** d'une annulation de sa tâche ni du void de son payout. |
| P1-M11 | `sweeps.ts:23-83` | Expiration de la fenêtre de paiement **100 % silencieuse** ; aucune action admin `expired→awaiting_payment`. Client chaud perdu sans un mot. |
| P1-M12 | `standing-capacity.ts:61-65` + `schema.prisma:930` | Standing `cancelled` **verrouille le client à vie** (`clientId @unique`), contredit le commentaire du code et la promesse publique « move up a capacity tier » (aucune action de changement de tier n'existe). |
| P1-M13 | `standing-capacity.ts:203-215` | **Double enregistrement de paiement de période** possible (ni check ni contrainte unique). |
| P1-M14 | `standing-capacity.ts:267-295`, `schema.prisma:1071` | **Double payout hebdo complet** après réassignation en cours de semaine. |
| P1-M15 | `queries/tasks.ts:434-454`, `admin.ts:100` | **File de pricing polluée** par les tâches standing → double facturation possible. |
| P1-M16 | `admin-resolutions.ts:277-287` | **Promesse de remboursement fantôme** : un client standing reçoit « refund queued » alors qu'aucun chemin de refund n'existe ; minutes du bloc jamais recréditées. |

## MINEURS (extrait)
- ClosedJobLog `won` ne teste pas `isInternal` (`admin-qc.ts:118-119`) alors que les 5 chemins `lost` l'excluent → biais d'analyse.
- ClosedJobLog asymétrique pour Standing : jamais `won`, parfois `lost`.
- « Work is underway » affiché pour une tâche `open` non réclamée (`status.ts:76-80`).
- Le client ne voit jamais `disputeWindowEndsAt` (absent de `clientTaskSelect`) alors que c'est cette fenêtre qui gate son argent.
- Cadence cron horaire vs 5 min recommandées par le README:106.
- Arêtes mortes dans la state machine : `revision_requested → claimed/completed/disputed` sans aucun appelant.
- « Malware protection » = heuristiques (chaînes EICAR/macros), pas un AV ; `scanStatus: "clean"` posé d'office (`upload/route.ts:153`) — le message d'erreur surpromet.
- Rows `Payment` `pending` orphelines à perpétuité (pas de handler `checkout.session.expired`).
- Issue de dispute **partielle inexistante** (enum fermé `admin-resolutions.ts:67-71`) — constat, pas bug.

## ✅ CONFIRMÉ SOLIDE EN PHASE 1
- `capture_method: "manual"` réellement en place (`stripe.ts:126`) ; aucun chemin de capture hors QC/dispute-window.
- **Réclamation concurrente**: une seule réussit. CAS `updateMany where {id, status:'open', claimedById:null}` (`state.ts:150-153`) + advisory lock par worker (`va-tasks.ts:78-80`), le tout dans une transaction. Le perdant reçoit un message clair.
- Toutes les transitions sont CAS-gardées avec audit `TaskEvent` dans la même transaction.
- Les prix ne transitent jamais par `TaskEvent.meta` ; `clientTaskSelect` ne projette jamais `vaPayoutCents`/`claimedById`.
- Rôle non-forgeable à l'inscription (`input: false`, défaut CLIENT).
- Idempotence des webhooks Stripe : Payment claim `pending→authorized`, ledger à clé unique `(sourceKind, sourceId)`, refunds dérivés des rows détenues et non du payload.
- Réconciliation des refunds robuste, avec alerte admin en cas de mismatch (`stripe.ts:426-433`).
- Récupération du paiement tardif, y compris tâche annulée entre-temps.
- Blocage des payouts non financés (`admin-payments.ts:297-313`).
- Claim de fichiers atomique avec garde propriétaire + scan.
- ClosedJobLog correctement alimenté sur `declined` (`price_declined`) et `expired`.
- Toutes les routes protégées redirigent vers `/login` ; API fichiers → 401 sans session (vérifié live).

---

# PHASE 5 — SEO (vérifié en direct sur afterdesk.co)

## MAJEURS

### P5-M1 — Les 3 pages multilingues les plus précieuses n'ont AUCUN hreflang
**Où** : `src/app/page.tsx:39-40`, `src/app/workers/page.tsx:43-47`, `src/app/academy/page.tsx:37-41`
**Quoi** : ces pages utilisent un `export const metadata` **statique** avec seulement `alternates: { canonical }`. Un export statique ne peut pas varier selon `?lang=`, donc aucun hreflang n'est émis. Seules `/about`, `/how-it-works` et `/services` utilisent `generateMetadata` + `langAlternates()` et ont les 5 balises correctes.
**Preuve live** (comptage d'occurrences, pas de lignes) :
| Page | hreflang | canonical |
|---|---|---|
| `/` | **0** | 1 |
| `/workers` | **0** | 1 |
| `/academy` | **0** | 1 |
| `/how-it-works` | 5 | 1 |
| `/about` | 5 | 1 |
| `/services` | 5 | 1 |
| `/security`, `/privacy`, `/terms`, `/acceptable-use` | 0 | 1 |
| `/services/standing-capacity` | **0** | **0** |
| `/ledger` | **0** | **0** |
**Conséquence** : Google voit `/` et `/?lang=fr` comme du contenu dupliqué sans signal de langue — exactement le problème de contenu dupliqué inter-langues. La page d'accueil est la plus impactée.
**Effort** : faible (~1 h) — convertir les 3 `metadata` statiques en `generateMetadata` avec `langAlternates()`, en réutilisant le motif déjà en place dans `/services`.

### P5-M2 — Pages commerciales absentes du sitemap
**Où** : `src/app/sitemap.ts` (à corriger)
**Preuve live** : le sitemap contient 29 URLs. `/services`, `/services/standing-capacity` et `/ledger` en sont **absents** (grep « services » → 0 occurrence), alors que `/about` et `/how-it-works` y sont.
**Conséquence** : le hub commercial « Our Services » et la page Standing Capacity — les deux pages d'offre — ne sont pas déclarées à Google.
**Effort** : très faible (~15 min).

### P5-M3 — Canonical manquant sur 2 pages
**Où** : `/services/standing-capacity`, `/ledger` — aucune balise canonical (vérifié live).
**Effort** : très faible.

## ✅ CONFIRMÉ SOLIDE EN PHASE 5
- **Titles et meta descriptions uniques, descriptifs et orientés recherche sur les 12 pages publiques** (vérifié un à un en direct). Ex. `/` : « Outsource admin, data & research tasks: done overnight at one fixed price ».
- **Un seul `<h1>` par page**, sur les 12 pages.
- **Open Graph + Twitter Card complets** (8 à 10 balises par page), avec image OG 1200×630 et texte alternatif.
- **robots.txt correct** : bloque `/client`, `/va`, `/admin`, `/api`, `/login`, `/register`, `/verify-email`, `/notifications`, et déclare le sitemap. Aucune page publique bloquée par erreur.
- **Page 404 personnalisée** renvoyant un vrai statut 404, avec deux portes de sortie (Get work done / For workers).
- **Données structurées** : `Organization` (JSON-LD) présent sur l'accueil.
- Canonical présent sur 10 des 12 pages publiques.

---

# PHASE 4 — PAGES ET TRADUCTIONS (partie vérifiée en direct)

## MAJEUR

### P4-M1 — « Our Services » reste en anglais dans les headers desktop, dans les 4 langues
**Où** : `src/app/page.tsx:179`, `src/app/workers/page.tsx:162`, `src/app/services/standing-capacity/page.tsx:41`
**Quoi** : chaîne codée en dur, jamais passée par un dictionnaire. Un visiteur FR/ES/FIL voit « Our Services » dans le header desktop des deux pages d'accueil.
**Preuve live** : scan des 4 langues sur `/` et `/workers` → « Our Services » présent en `fr`, `es` et `tl`.
**Contexte** : le correctif de traduction livré plus tôt aujourd'hui (`src/lib/i18n/mobile-menu-compact.ts`) n'a couvert **que le menu mobile**. Le lien du header desktop a le même défaut et je l'avais manqué — les traductions existent déjà (`COMPACT_SERVICES_LABEL`), il suffit de les brancher.
**Effort** : très faible (~15 min).

### P4-m2 — MINEUR — Chaîne cliente non traduite
**Où** : `src/app/client/standing-capacity/page.tsx:43` — corps de message en anglais codé en dur (« Ask us about it from Our Services. »). À confirmer : le portail client est-il censé être multilingue ou anglais-seulement ?

### P4-note — `<html lang>` reste « en » dans toutes les langues (aggrave P5-M1)
**Où** : `src/app/layout.tsx` (racine `lang="en"`), contenu traduit encapsulé dans `<div lang={lang}>`.
**Constat** : choix **délibéré et documenté** (`src/app/page.tsx:152-153`) — les lecteurs d'écran respectent le `lang` le plus proche, donc **l'accessibilité est correcte** (vérifié en direct sur `/academy?lang=fr` : `<div lang="fr">` bien présent).
**Mais** : Google lit `<html lang>`. Sur les 3 pages sans hreflang (`/`, `/workers`, `/academy`), le moteur reçoit donc **zéro signal de langue** — ni `html lang`, ni hreflang. C'est ce qui rend P5-M1 plus grave qu'il n'en a l'air.

## ✅ CONFIRMÉ SOLIDE EN PHASE 4 (partie faite)
- **Aucun débordement horizontal** sur mobile 375px, y compris en français (le cas le plus long) : `scrollWidth - clientWidth = 0` sur `/workers?lang=fr` et `/academy?lang=fr`. Les éléments larges détectés sont tous des halos décoratifs `pointer-events-none`, correctement rognés par `overflow-x-clip`.
- **Hiérarchie de titres correcte** : un seul `h1`, aucun saut de niveau détecté sur `/academy?lang=fr`.
- **Contenu traduit correctement encapsulé** dans un sous-arbre `lang="fr"` — les lecteurs d'écran changent de voix.
- **Les 12 pages publiques répondent 200 en EN et en FR** (24 requêtes vérifiées).
- **État vide de `/ledger` traité avec honnêteté** (vérifié en direct) : affiche « $0 — this updates automatically the moment the first transaction settles. **Nothing has yet.** » et « No entries yet ». Aucun chiffre gonflé, aucune donnée fictive présentée comme réelle. La ligne de démonstration est préfixée « example ». **Aucune identité ni prix client exposé** — la page annonce et respecte « No client names, no worker names — just amounts, categories, and timestamps ».
- **Les 12 pages publiques renvoient 200** et se chargent sans erreur.
- **Aucune fuite d'anglais** détectée sur `/about`, `/how-it-works` et `/services` en FR et ES.
- **Le tagalog garde volontairement Security/Privacy/Terms/Acceptable use en anglais** — choix documenté et assumé (`src/components/trust-links.tsx:12-14`, code-switching Taglish, faute de glossaire juridique tagalog établi). **Ce n'est pas un défaut**, vérifié avant de le classer.
- **Aucune image bitmap sur le site** (0 balise `<img>`) — tout est SVG/CSS : pas de problème de format, de dimensionnement ni de lazy loading.

---

# PHASE 6 — PERFORMANCE (partie vérifiée en direct)

## ✅ CONFIRMÉ SOLIDE
| Page | TTFB | Total | HTML |
|---|---|---|---|
| `/` | 0,22 s | 0,24 s | 86 ko |
| `/workers` | 0,13 s | 0,14 s | 96 ko |
| `/academy` | 0,13 s | 0,20 s | 292 ko |
| `/services` | 0,13 s | 0,13 s | 28 ko |
| `/how-it-works` | 0,12 s | 0,14 s | 52 ko |

- **JS de la page d'accueil : 201 ko compressés (brotli)**, 10 chunks — raisonnable pour une app Next.js.
- **Compression brotli active** (`Content-Encoding: br`).
- TTFB de 120 à 220 ms : très bon.
- Seul point d'attention : `/academy` sert 292 ko de HTML (29 cours listés) — acceptable mais c'est la page la plus lourde.

## MAJEUR

### P6-M1 — Aucune visibilité sur les erreurs de production
**Où** : `package.json` (absence vérifiée), 13 `console.error` dans `src/`
**Quoi** : **aucun outil de suivi d'erreurs** (Sentry, Datadog, Rollbar, etc.) n'est installé. Les erreurs partent uniquement en `console.error` → logs de fonction Vercel, à rétention limitée et **sans aucune alerte**.
**Pourquoi c'est grave au lancement** : combiné aux constats P1-M5 (un money intent qui échoue définitivement disparaît en silence), P1-C3 (rejet QC silencieux) et P1-C2 (aucun sweep de deadline), **une tâche bloquée ou un paiement raté ne remonterait à personne**. Le premier signal serait un client mécontent.
**Effort** : faible (~1 h pour brancher Sentry).

### P6-m2 — MINEUR — `global-error.tsx` absent
**Où** : `src/app/` — `error.tsx` et les `not-found.tsx` existent, mais pas `global-error.tsx`. Une erreur levée dans le root layout ne serait pas capturée proprement.

### P6-m3 — MINEUR — `putObject` non protégé
**Où** : `src/app/api/upload/route.ts:138` — l'écriture R2 n'est pas dans un try/catch. Si le stockage est indisponible, le client reçoit un 500 brut plutôt qu'un message utile. Aucune corruption (le compensating `deleteObject` couvre le cas inverse), seulement une mauvaise expérience.

## ✅ CONFIRMÉ SOLIDE (dégradation gracieuse)
- **Scanner indisponible → 503 et refus de l'upload** (`upload/route.ts:133-135`) : la promesse « fails closed » de /security est **tenue**.
- **Compensation transactionnelle sur l'upload** (`upload/route.ts:168-171`) : si l'insertion DB échoue après l'écriture du blob, le blob est supprimé — jamais de fichier orphelin sans row.
- **Panne Anthropic pendant l'intake** : capturée (`ai.ts:151`), la tâche reste dans la file de pricing sans suggestion — dégradation propre, pas de blocage.
- `error.tsx` + `not-found.tsx` présents pour les segments principaux (racine, admin, client, va).

---

# PHASE 3 — SÉCURITÉ APPLICATIVE (partie vérifiée en direct)

## ✅ CONFIRMÉ SOLIDE
- **Headers de sécurité complets et stricts** (vérifié live sur `/`) : CSP avec `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests` ; HSTS `max-age=63072000; includeSubDomains` (2 ans) ; `X-Frame-Options: DENY` ; `X-Content-Type-Options: nosniff` ; `Referrer-Policy: same-origin` ; `Permissions-Policy` verrouillant caméra/micro/géoloc/paiement. **Aucun header manquant.**
- **`npm audit` : 0 vulnérabilité.**
- **Webhook Stripe : signature réellement exigée.** Requête POST sans signature → `400 {"error":"Missing signature."}` ; avec signature forgée → rejet également. Aucun traitement avant vérification.
- Toutes les routes protégées (`/client`, `/va`, `/admin`, et objets profonds `/client/tasks/<id>`, `/admin/tasks/<id>`, `/va/pool/<id>`) redirigent en 307 vers `/login?next=…`. `/api/files/<id>/download` → 401 sans session.

## ✅ PROMESSE PUBLIQUE VÉRIFIÉE — retrait des métadonnées (RÈGLE 1)
Promesse /security : « Common author metadata is removed from Office and image files. » → **VRAIE, et même en dessous de la réalité.**
Vérifié dans `src/lib/file-security.ts` :
- **OOXML `docProps/core.xml`** : `dc:creator`, `cp:lastModifiedBy`, `dc:title`, `dc:subject`, `cp:keywords`, `cp:category` (`:229-238`)
- **OOXML `docProps/app.xml`** : `Company`, `Manager`, `Application`, `AppVersion` (`:239-247`)
- **Suppression complète de fichiers entiers** : `word/people.xml` (**les auteurs de suivi de modifications** — la fuite classique), `docProps/custom.xml` (« Last Saved By »), `xl/persons/person.xml` (`:181`)
- **JPEG** : EXIF retiré, y compris les **coordonnées GPS** (`stripJpegMetadata:250`, motivation documentée `:209`)
- **PNG** : `stripPngMetadata:271`
- **PDF** : module dédié `scrubPdfIdentity` (`pdf-identity.ts`, appelé `:359`)

C'est un des points les plus soignés du dépôt : le traitement du suivi de modifications et du GPS va au-delà de ce que la page publique annonce.

## NOTE
Le rejet du webhook avec signature forgée renvoie **503** plutôt que 400 — cohérent avec l'absence de `STRIPE_WEBHOOK_SECRET` en production (bloqueur B2) : le service se déclare indisponible faute de secret. Le comportement est sûr (rejet), mais le code de statut confirme indirectement B2.

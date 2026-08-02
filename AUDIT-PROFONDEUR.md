# EXAMEN COMPLÉMENTAIRE AfterDesk — audit de profondeur
Généré le 2026-08-02, **après** les correctifs de `AUDIT-PRELANCEMENT.md` (4 commits appliqués, non poussés).
Méthode : lecture du code réel + rejeu sur PostgreSQL réel (PGlite) quand une preuve à l'exécution était possible.
8 agents en parallèle + vérifications personnelles. Aucun fichier modifié.

---

# RÉSUMÉ

**Cette exploration ne change pas la recommandation : elle la confirme et l'aggrave.**

La revue précédente avait trouvé 11 bloqueurs, dont 9 relevaient d'un motif unique : *une garde écrite pour un modèle produit antérieur, qu'une fonctionnalité ultérieure a invalidée sans la mettre à jour*. Cet examen cherchait d'autres instances du même motif. **Il en a trouvé beaucoup**, concentrées sur Standing Capacity — la greffe la plus récente sur une machine conçue pour le one-off.

**Le constat structurant : Standing Capacity n'est pas prêt.** Le flux one-off, lui, est solide et le reste après cet examen approfondi.

---

# ÉLEVÉ

## D1 — Dépassement du bloc payé par soumissions simultanées (TOCTOU)
**Où** : `standing-capacity.ts:568-576` (lecture) vs `:642-645` (écriture)
**Quoi** : lecture de `minutesUsedThisPeriod` **hors transaction**, contrôle en JavaScript, puis `{ increment }` **sans aucun prédicat** dans une transaction ouverte plus tard.
**Preuve à l'exécution** : compte à 180/300 min (une seule tâche de 2 h possible) → **4 soumissions sur 4 acceptées, compteur final 660/300, dépassement de 6 h de travail hors bloc payé.**
**Ce que le dépôt sait déjà** : ce motif est corrigé deux fois ailleurs par verrou consultatif (`va-tasks.ts:78`, `academy.ts:58`) — les **seuls deux verrous du dépôt**. Le commentaire de `va-tasks.ts:75-77` décrit littéralement ce bug.
**Effort** : faible (~30 min).

## D2 — Aucune garde de période à l'écriture, et reset inconditionnel côté sweep
**Où** : `standing-capacity.ts:642-645` + `sweeps.ts:262-265`
**Quoi** : `currentPeriodEnd` n'apparaît **nulle part** dans `submitStandingTask` (vérifié par grep : lignes 76, 199/210, 266/292 seulement). Et `advanceStandingCapacityPeriods` écrit `minutesUsedThisPeriod: 0` **sans re-vérifier** que la période n'a pas bougé.
**Preuve à l'exécution (agent)** : dans un ordre, des minutes validées contre l'ancienne période sont facturées à la nouvelle ; dans l'autre, **300 min de travail réservé sont effacées par le reset — le client obtient un bloc gratuit.**
**Effort** : faible.

## D3 — Deux assignations actives possibles, et l'admin ne voit pas celle qui travaille
**Où** : schéma `StandingCapacityAssignment` + `queries/standing-capacity.ts:113-117` vs `standing-capacity.ts:24-33`
**Quoi** : aucune contrainte d'unicité (deux `@@index` simples seulement, confirmé dans le schéma **et** la migration). `assignWorker` insère sans CAS ni verrou.
**Le dépôt connaît le motif** : `Dispute_one_pending_per_task` est un index unique partiel, exactement la même forme d'invariant. Un seul des deux est protégé.
**Preuve à l'exécution (agent)** : second `INSERT` accepté ; avec l'index unique partiel, il est refusé. Le commentaire `standing-capacity.ts:17-22` affirme l'invariant inverse.
**Divergence qui en découle** : le routage prend le plus récent (`orderBy activeFrom desc`), l'écran admin prend une ligne arbitraire (`take: 1` **sans `orderBy`** — alors que le bloc `payments` juste en dessous, lui, trie). **L'admin lit un nom et verse à l'autre.**
**Effort** : ~30 min.

## D4 — Une tâche Standing Capacity n'hérite jamais du drapeau interne du compte
**Où** : `standing-capacity.ts:568-576` (select) + `:594-603` (`task.create`)
**Quoi** : le select du compte ne lit pas `isInternal`, et `task.create` ne le pose pas → défaut `false`. Le trigger `isInternal is frozen after pricing` **empêche toute correction ultérieure**.
**Conséquence** : le travail de pratique de l'opérateur entre définitivement dans `tasksDelivered`, TIME SAVED et les trois taux de fiabilité publiés.
**⚠️ Lacune de mon propre correctif** : j'ai ajouté `isInternal` à `StandingCapacityAccount` et l'ai branché sur les entrées de ledger — **j'ai couvert le côté argent, pas le côté compteurs**. La tâche elle-même reste `false`.
**Preuve à l'exécution (agent)** : les deux tentatives de correction lèvent `isInternal is frozen after pricing` ; les deux contrôles one-off passent.
**Effort** : moyen (propagation + backfill SQL, trigger à désactiver le temps du backfill).

## D5 — Un worker suspendu continue de recevoir des tâches
**Où** : `standing-capacity.ts:24-33` (`currentAssignee`) + les trois voies de suspension
**Quoi** : `currentAssignee` ne consulte jamais `vaProfile.status`. Aucune des trois suspensions (manuelle, auto-score, auto-rejets) ne ferme les `StandingCapacityAssignment`.
**Conséquence** : les tâches du client partent chez un worker suspendu qui ne peut ni les ouvrir ni les libérer, **pendant que les minutes du client sont décomptées**. Aucun sweep ne récupère `claimed`.
**Aggravant** : ce chemin devient atteignable **pour la première fois** avec `maxConsecutiveQcRejections` — le correctif que je viens de livrer. Il crée un cas qui n'existait pas avant.
**Effort** : ~1 h.

## D6 — Interblocage fermé de l'escrow à 25 payouts en attente
**Où** : `money-intents.ts:28-31` + `admin-payments.ts:301-311`
**Quoi** : `release_payout` reste `queued` jusqu'au versement manuel, et **son compteur `attempts` n'est jamais incrémenté** — ces lignes ne vieillissent donc jamais hors du `WHERE`. À 25 payouts en attente, la file ne contient plus qu'eux : captures, remboursements et annulations ne sont **plus jamais traités**. Puis le contrôle de financement (qui exige `received`) refuse les versements, ce qui empêche de vider la file.
**Preuve à l'exécution (agent)** : file 100 % `release_payout` en 6 passages horaires. Sortie uniquement par SQL direct.
**Effort** : faible — exclure `release_payout` du `WHERE` de drainage.

## D7 — Aucun repreneur des intents bloqués en `processing`
**Où** : `money-intents.ts:15,33-41`
**Quoi** : le statut `processing` est posé **avant** l'appel Stripe, et la requête de drainage ne lit que `queued|failed`. Un timeout de fonction laisse **une capture réussie chez Stripe et un `Payment` toujours `authorized`, sans entrée `sale`, définitivement**.
**Preuve à l'exécution (agent)** : claim OK, puis 0 intent relu à +1 h/+2 h/+3 h.
**Effort** : moyen (reprise sur âge + réconciliation Stripe avant retry).

## D8 — `releaseHeldFunds` ressuscite un versement déjà effectué
**Où** : `escrow.ts:52`
**Quoi** : l'upsert `update: { status: "queued", processedAt: null }` **remet en file un `release_payout` déjà `done`**. Atteignable par QC → sweep → `markPayoutPaid` → litige dans les 72 h → `decideDispute("rejected")`.
**Conséquence** : un virement effectué réapparaît comme dû à l'opérateur, et squatte définitivement un des 25 slots (compose avec D6).
**Preuve à l'exécution (agent)** : intent `done` → `queued`, Payout `paid`.
**Effort** : faible — `update: {}`, comme le fait déjà la branche capture juste en dessous (`escrow.ts:67`).

## D9 — `markPayoutPaid` ferme l'ordre de virement du mauvais worker
**Où** : `admin-payments.ts:326-333`
**Quoi** : ferme les `MoneyIntent` `release_payout` **par `taskId` seul**, alors que la clé d'idempotence est `release-payout:${taskId}:${vaId}` et que `MoneyIntent` n'a pas de colonne `vaId`. **Payer un worker ferme l'ordre de virement de l'autre.**
**Effort** : faible-moyen.

## D10 — Le pricing IA apprend des échecs
**Où** : `pricing-ai.ts:172-184`
**Quoi** : le voisinage de référence ne filtre **ni statut, ni issue, ni `isInternal`** — il ne teste que « a un prix ». Or `declineQuote` laisse `clientPriceCents` intact.
**Preuve à l'exécution (agent)** : une tâche « devis refusé à 950 $ » sort **en 1ʳᵉ position**, une tâche interne à 1 $ en 2ᵉ, devant la seule tâche réellement livrée. Le prompt les présente au modèle comme « already-approved ... final client price ».
**Conséquence** : le système réapprend le prix qui a fait fuir le client.
**Effort** : faible (~10 lignes).

## D11 — Le moteur de pricing s'aveugle à mesure que l'historique grandit
**Où** : `pricing-ai.ts:246` + `:178-181`
**Quoi** : un embedding est écrit à **chaque soumission**, jamais supprimé, et le filtre « pricée » est un **post-filtre** sur la table jointe.
**Preuve à l'exécution (agent)** : avec 6 000 références pricées disponibles, **40 doublons jamais pricés ramènent le résultat à 0/12** (`hnsw.ef_search=40`, `iterative_scan=off` par défaut). Confiance forcée à `low` à vie pour cette zone.
**Effort** : faible, mais **choix à faire** (n'indexer qu'à l'approbation, ou `iterative_scan = relaxed_order`, ou index partiel).

## D12 — Le total public du ledger est incorrigible
**Où** : `public-ledger.ts:82-83` + trigger d'immuabilité
**Quoi** : les deux mécanismes de correction documentés sont inopérants — l'`UPDATE` de `publiclyVisible` lève `LedgerEntry is append-only`, et une entrée `correction` ne déplace pas le total (`kind` absent des ensembles crédit/débit, et **aucun code n'en insère jamais**).
**Effort** : faible.

## D13 — Boucle de litiges sans plafond
**Où** : `client-tasks.ts:337-408` + `admin-resolutions.ts:138-147`
**Quoi** : chaque décision « rejected » réarme la fenêtre d'au moins 24 h, ce qui rouvre `openDispute`. Le payout du worker repasse à `owed` à chaque tour. `maxRevisionRounds` existe pour les révisions ; **rien d'équivalent pour les litiges**.
**Effort** : faible (compteur symétrique).

## D14 — La purge de fichiers ignore les fenêtres encore ouvertes
**Où** : `sweeps.ts:154-174`
**Quoi** : le prédicat de rétention ignore `revisionWindowEndsAt`, `disputeWindowEndsAt` et `windowPausedAt`. Après un litige long, la fenêtre de révision peut dépasser 90 jours : **la purge efface les pièces pendant que le client peut encore demander une révision** — et pendant qu'une rétrofacturation peut encore être contestée.
**Effort** : faible.

---

# MOYEN

- **D15** — `reassignTask` ne void pas le `Payout` du worker sortant (`admin.ts:152-173`), alors que `cancelTask:260` le fait. *Preuve à l'exécution : 6 000 c versés pour un prix client de 7 400 c, les deux `markPayoutPaid` retournent AUTORISÉ.*
- **D16** — Une tâche standing sans assigné entre dans la file de tarification et peut être **facturée une seconde fois**, minutes déjà décomptées (`queries/tasks.ts:433-458`, aucune garde dans `approvePricing`).
- **D17** — Litige gagné sur une tâche standing : le client reçoit « refund queued » alors qu'**aucun remboursement n'existe et qu'aucune minute n'est recréditée**. Il est bloqué par sa propre plainte fondée jusqu'au rollover — c'est-à-dire jusqu'à payer une deuxième semaine.
- **D18** — `emailAttempts` ne se remet jamais à zéro : avec `RESEND_API_KEY` absent, tout l'arriéré est **définitivement perdu** après 5 passages de cron. Configurer la clé plus tard ne le rattrape pas.
- **D19** — Un courriel peut être **envoyé deux fois** : le claim incrémente avant l'envoi, `emailedAt` n'est écrit qu'après (`notifications.ts:25-52`).
- **D20** — Le cron lance 8 jobs en `Promise.all` **sans `maxDuration` déclaré**, dont `expireStaleQuotes` **sans `take`** (le seul des huit). C'est le moteur qui produit D6 et D7.
- **D21** — `upsertClosedJobLog` appelé **hors transaction** dans les deux sweeps (`sweeps.ts:46,75`) : une coupure laisse la tâche `expired` sans ligne ClosedJobLog, définitivement.
- **D22** — Le total exact du ledger rouvre RULE 2 par différenciation : deux chargements encadrant une capture donnent `clientPriceCents` à ±1 $, et **le worker connaît l'instant de sa capture**. Le seuil existe, le bucket non.
- **D23** — `/ledger` : deux balayages complets par visite (`groupBy` + `count`), **aucun index sur `(isInternal, publiclyVisible)`**, **aucun `revalidate`** sur une page publique indexable.
- **D24** — Étiquette publique « Passes QC on the first try » sur une requête qui ne filtre pas `attemptNo` : c'est un taux par soumission, structurellement supérieur au vrai taux.
- **D25** — Une ligne ClosedJobLog passée de `won` à `lost` **garde `marginCents`** = la marge de la vente annulée, et l'agrégat envoyé au modèle moyenne `won` et `lost` sans filtre.
- **D26** — `admin-resolutions.ts:103-107` : commentaire décrivant le modèle **pré-escrow, exactement inversé** (« QC approval already enqueues the capture » — c'est faux, vérifié). Le code est correct ; la croyance périmée est le risque.
- **D27** — Les deux actions d'argent Standing Capacity ne ciblent que `currentPeriodStart` : une semaine non saisie à temps devient **impayable** et son revenu n'atteint jamais le ledger.
- **D28** — L'ancien assigné garde l'accès aux **fichiers et au brief** d'une tâche `disputed` sans limite de durée, mais perd instantanément les notes de contexte — l'inverse de ce qu'on voudrait.

---

# ✅ CONFIRMÉ SOLIDE À CE NIVEAU DE PROFONDEUR

- **Le flux one-off résiste.** Aucun des constats ÉLEVÉS ci-dessus n'est propre au one-off, sauf D6/D7/D8/D9 (file d'intents) — qui sont des défauts de robustesse, pas de correction.
- **Réclamation concurrente du pool public** : re-confirmée solide (CAS + verrou consultatif dans une seule transaction).
- **Séparation des prix au niveau SQL** : les selects role-shaped ne projettent jamais la colonne de l'autre côté. Structurel, pas déclaratif.
- **Idempotence des webhooks Stripe** et déduplication du ledger par `(sourceKind, sourceId)` : re-confirmées.
- **Intégrité des examens** : bonnes réponses jamais envoyées au navigateur, mélange dérivé côté serveur, verrou anti-course.
- **Minutes négatives impossibles** : aucun décrément n'existe nulle part.
- **Le verrou global du ledger** est un compromis assumé et correct, pas un défaut.
- **Anonymisation des fichiers** : re-confirmée au-delà de ce que la page publique promet.

---

# CONCLUSION

**La recommandation ne change pas : ne pas lancer en l'état. Et elle se précise.**

L'examen approfondi **confirme la santé du flux one-off** et **disqualifie Standing Capacity pour le lancement**. Sur les 14 constats ÉLEVÉS, **9 touchent Standing Capacity** — dépassement de bloc prouvé, deux assignations actives possibles, worker suspendu qui reçoit encore des tâches, double facturation, remboursement fantôme, compteurs pollués de façon irréversible.

**La raison est structurelle, pas accidentelle.** Standing Capacity est une greffe récente sur une machine bâtie pour le one-off, et à chaque greffe les gardes périphériques n'ont pas été rejouées : ni les triggers (trouvés à la revue précédente), ni les verrous de concurrence, ni les contraintes d'unicité, ni l'héritage des drapeaux, ni les invariants de paiement. Le motif ne s'est pas arrêté aux deux triggers — **il traverse tout le sous-système**.

**Recommandation opérationnelle** : lancer **le one-off seul**, en retirant Standing Capacity de l'offre publique jusqu'à ce que les 9 constats le concernant soient traités et re-vérifiés à double sens. C'est réalisable : le hub `/services` distingue déjà les deux offres, et la page Standing Capacity est absente du sitemap.

**Un avertissement sur mes propres correctifs** : deux d'entre eux ont des effets de bord découverts ici. `maxConsecutiveQcRejections` **crée** le cas D5 (worker suspendu encore assigné), qui n'était pas atteignable avant. Et mon ajout de `isInternal` au compte standing ne couvre **pas** la tâche (D4) — le côté argent est protégé, le côté compteurs non. Les deux sont à traiter avec le reste.

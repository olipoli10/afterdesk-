-- Deux invariants de la migration 20260730001000_integrity_triggers ont été
-- écrits pour un modèle qui n'existe plus. Le produit a changé sous eux, et
-- aucune migration ne les avait suivis. Ils bloquent aujourd'hui les deux
-- flux principaux ; les deux blocages ont été reproduits à l'exécution sur
-- PostgreSQL avant d'écrire ce correctif.
--
-- Les gardes applicatives correspondantes n'ont pas changé — c'est bien la
-- règle en base qui a divergé, pas le code qui a triché.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Entrée dans le pool : accepter une autorisation, pas seulement une capture
--
-- Avant l'escrow, le client était débité immédiatement et le paiement était
-- 'received' au moment où la tâche entrait dans le pool. Depuis
-- 20260731020000_payment_authorize_capture, fulfillCheckout pose 'authorized'
-- (la carte est bloquée, pas débitée) et ne capture qu'après QC + fenêtre de
-- dispute. Le trigger exigeait toujours 'received' : toute tâche d'un vrai
-- client levait « a paid client task cannot enter the pool without received
-- payment » et le webhook Stripe était annulé en entier.
--
-- 'authorized' est la garantie que l'invariant cherchait réellement : la
-- banque a confirmé et réservé les fonds. Capturer avant que le travail
-- existe serait précisément ce que l'escrow supprime.
CREATE OR REPLACE FUNCTION second_shift_protect_task_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."firstCompletedAt" IS NOT NULL
     AND NEW."firstCompletedAt" IS DISTINCT FROM OLD."firstCompletedAt" THEN
    RAISE EXCEPTION 'firstCompletedAt is immutable once set';
  END IF;

  IF OLD."status" NOT IN ('submitted', 'pricing_review')
     AND NEW."isInternal" IS DISTINCT FROM OLD."isInternal" THEN
    RAISE EXCEPTION 'isInternal is frozen after pricing';
  END IF;

  IF NEW."status" = 'open'
     AND OLD."status" = 'awaiting_payment'
     AND NOT NEW."isInternal"
     AND NOT EXISTS (
       SELECT 1
       FROM "Payment" p
       WHERE p."taskId" = NEW."id"
         AND p."status" IN ('authorized', 'received')
     ) THEN
    RAISE EXCEPTION 'a paid client task cannot enter the pool without an authorized or received payment';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Complétion : exempter les tâches Standing Capacity
--
-- L'invariant « une tâche complétée avec un worker assigné doit avoir un
-- Payout » est juste pour le one-off, où le worker est payé par tâche. En
-- Standing Capacity le worker est payé PAR PÉRIODE (recordWorkerPeriodPayout),
-- jamais par tâche : approveDeliverable saute délibérément la création du
-- Payout (garde `if (!isStandingCapacityTask)`), alors que la tâche porte bien
-- un claimedById. Le trigger levait donc « completed task has no worker
-- payout » au COMMIT de chaque approbation QC standing.
--
-- L'invariant reste pleinement en vigueur pour le one-off, qui est le seul
-- flux où l'absence de Payout signalerait vraiment de l'argent perdu.
CREATE OR REPLACE FUNCTION second_shift_completed_task_has_payout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'completed'
     AND NEW."claimedById" IS NOT NULL
     AND NEW."standingCapacityAccountId" IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "Payout" p
       WHERE p."taskId" = NEW."id" AND p."vaId" = NEW."claimedById"
     ) THEN
    RAISE EXCEPTION 'completed task has no worker payout';
  END IF;
  RETURN NULL;
END;
$$;

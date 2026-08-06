-- PHASE 1B (3/3) — LES GARDE-FOUS.
--
-- Trois protections, toutes en base plutôt qu'en code applicatif, parce que
-- chacune protège quelque chose qu'un futur chemin d'écriture pourrait
-- contourner sans le vouloir.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. LE GARDE-FOU DE PAIEMENT, ÉTENDU.
--
-- second_shift_protect_task_invariants refusait l'entrée au bassin sans
-- paiement en testant `OLD."status" = 'awaiting_payment'`. En insérant
-- `ai_processing` entre le paiement et le bassin, le chemin normal devient
-- ai_processing → open : `OLD."status"` ne vaut plus 'awaiting_payment' et LE
-- TRIGGER NE SE DÉCLENCHE PLUS. Une tâche impayée pourrait entrer dans le
-- bassin par le nouveau chemin.
--
-- C'est exactement le motif décrit dans AUDIT-PROFONDEUR.md : « un garde écrit
-- pour un modèle produit antérieur qu'une fonctionnalité ultérieure invalide
-- sans le mettre à jour ». La condition couvre désormais les deux états
-- d'origine. Le reste de la fonction est recopié à l'identique.

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

  -- Recopiée de 20260802150000_standing_task_never_quoted. Une première
  -- version de cette migration l'avait PERDUE en affirmant recopier la
  -- fonction à l'identique : CREATE OR REPLACE remplace le corps entier, donc
  -- une clause oubliée est une clause supprimée. Ce garde-fou existe parce
  -- qu'une tâche Standing Capacity arrivée en `submitted` sans travailleur
  -- assigné a déjà fuité dans la file de tarification, et que l'opérateur qui
  -- l'a tarifée a facturé le client une seconde fois pour du travail que le
  -- bloc hebdomadaire payait déjà.
  IF NEW."standingCapacityAccountId" IS NOT NULL
     AND NEW."status" IN ('quoted', 'awaiting_payment')
     AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'a standing capacity task is already paid for by its block and cannot be quoted or billed separately';
  END IF;

  IF NEW."status" = 'open'
     AND OLD."status" IN ('awaiting_payment', 'ai_processing')
     AND NOT NEW."isInternal"
     AND NOT EXISTS (
       SELECT 1
       FROM "Payment" p
       WHERE p."taskId" = NEW."id"
         AND p."status" IN ('authorized', 'received')
     ) THEN
    RAISE EXCEPTION 'a paid client task cannot enter the pool without an authorized or received payment';
  END IF;

  -- Entrer en ai_processing coûte de l'argent réel (appels de modèle,
  -- recherches facturées) : la même exigence de paiement s'applique.
  IF NEW."status" = 'ai_processing'
     AND NOT NEW."isInternal"
     AND NOT EXISTS (
       SELECT 1
       FROM "Payment" p
       WHERE p."taskId" = NEW."id"
         AND p."status" IN ('authorized', 'received')
     ) THEN
    RAISE EXCEPTION 'a client task cannot enter automated processing without an authorized or received payment';
  END IF;

  -- 2. LE PAYOUT EST GELÉ À LA RÉCLAMATION.
  --
  -- Le résiduel calculé par le moteur est écrit UNE SEULE FOIS, dans la
  -- transition ai_processing → open, donc avant que le bassin ne l'affiche.
  -- Après réclamation, plus personne ne le change : un travailleur ne peut pas
  -- voir fondre le montant pour lequel il a accepté le travail.
  IF OLD."claimedById" IS NOT NULL
     AND NEW."claimedById" IS NOT NULL
     AND NEW."vaPayoutCents" IS DISTINCT FROM OLD."vaPayoutCents" THEN
    RAISE EXCEPTION 'vaPayoutCents is frozen once a worker has claimed the task';
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. LE PAQUET HUMAIN EST IMMUABLE DÈS LA RÉCLAMATION.
--
-- Le payout, les unités restantes, les instructions, la checklist : rien de ce
-- que le travailleur a lu avant de réclamer ne peut changer après. Avant la
-- réclamation la ligne reste modifiable (l'admin peut corriger un mandat que
-- personne n'a encore pris) ; après, la base refuse.
--
-- DELETE est refusé de la même manière : effacer le paquet reviendrait à
-- effacer le mandat sous les pieds du travailleur.

CREATE OR REPLACE FUNCTION second_shift_human_package_frozen_after_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claimed TEXT;
BEGIN
  SELECT t."claimedById" INTO claimed
  FROM "Task" t
  WHERE t."id" = COALESCE(NEW."taskId", OLD."taskId");

  IF claimed IS NOT NULL THEN
    RAISE EXCEPTION 'TaskHumanWorkPackage is frozen once the task is claimed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS "TaskHumanWorkPackage_frozen_after_claim" ON "TaskHumanWorkPackage";

CREATE TRIGGER "TaskHumanWorkPackage_frozen_after_claim"
BEFORE UPDATE OR DELETE ON "TaskHumanWorkPackage"
FOR EACH ROW EXECUTE FUNCTION second_shift_human_package_frozen_after_claim();

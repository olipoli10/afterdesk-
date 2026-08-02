-- Une tâche Standing Capacity ne doit jamais entrer dans un second circuit
-- de facturation. Son prix est déjà fixé et déjà payé au niveau du bloc
-- hebdomadaire, et les minutes sont décomptées au moment même de la
-- soumission (submitStandingTask incrémente minutesUsedThisPeriod).
--
-- Le trou : quand aucun worker n'est assigné au compte, la tâche reste en
-- 'submitted' au lieu de passer à 'claimed'. Or pricingQueue() ne filtre que
-- sur le statut. La tâche apparaissait donc dans la file de tarification
-- one-off, indistinguable des autres, et un opérateur qui la tarifait
-- déclenchait tout le circuit one-off : devis, acceptation, Stripe. Le client
-- payait une deuxième fois un travail que son bloc couvre déjà — et dont les
-- minutes lui avaient déjà été retirées.
--
-- Le filtre de la file et la garde applicative sont corrigés dans le même
-- commit. Cette règle-ci est le filet : les deux autres sont des décisions
-- d'affichage et de code, celle-ci est un invariant d'argent, et c'est la
-- seule des trois qu'aucune requête directe ne peut contourner.
--
-- 'awaiting_payment' est inclus explicitement plutôt que déduit de 'quoted' :
-- rien ne garantit que le seul chemin vers un paiement passe toujours par un
-- devis, et cette règle doit tenir même si un chemin futur saute l'étape.
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

  IF NEW."standingCapacityAccountId" IS NOT NULL
     AND NEW."status" IN ('quoted', 'awaiting_payment')
     AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'a standing capacity task is already paid for by its block and cannot be quoted or billed separately';
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

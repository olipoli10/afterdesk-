-- CORRECTIF 1D-α0 — GEL ÉCONOMIQUE DU CONTRAT ET INVARIANT DU BASSIN.
--
-- Additive sur les données : aucun DROP TABLE, aucun DROP COLUMN, aucun RENAME.
-- Trois élargissements de type Int -> BIGINT, qui ne perdent rien.
--
-- NOTE SUR LA GÉNÉRATION : comme en 1B, 1C et 1D-α0, `prisma migrate diff`
-- produit en plus deux DROP INDEX et un RENAME INDEX décrivant une dérive entre
-- l'introspection de Prisma et des index créés à la main en SQL. L'index HNSW de
-- pgvector n'est pas exprimable dans le schéma Prisma et le supprimer rendrait la
-- recherche de similarité lente sans que rien ne le signale. Ils sont retirés
-- ici : cette migration ne touche à aucun index préexistant.

-- ── 1. L'ÉCONOMIE GRAVÉE PAR ÉTAPE, AVANT LE DEVIS ────────────────────────
--
-- Nullables et JAMAIS rétro-remplies. Un contrat accepté avant ce correctif
-- n'avait pas ces valeurs au moment de sa signature ; les reconstruire
-- inventerait une provenance. Une étape acceptée sans valeur gelée compile en
-- HUMAIN, fail-closed.
ALTER TABLE "TaskExecutionPlanStep"
  ADD COLUMN "expectedCostMicrosAtQuote"      BIGINT,
  ADD COLUMN "maxCostMicrosPerAttemptAtQuote" BIGINT,
  ADD COLUMN "automationCostPolicyVersion"    TEXT,
  ADD COLUMN "demotedForBudget"               BOOLEAN NOT NULL DEFAULT false;

-- ── 2. LES AGRÉGATS, SUR LA VERSION DE PLAN PUIS SUR LE CONTRAT ───────────
ALTER TABLE "TaskExecutionPlanVersion"
  ADD COLUMN "expectedAutomationCostMicros"     BIGINT,
  ADD COLUMN "conservativeAutomationCostMicros" BIGINT,
  ADD COLUMN "automationSpendCeilingMicros"     BIGINT,
  ADD COLUMN "automationCostPolicyVersion"      TEXT;

ALTER TABLE "TaskAcceptanceSnapshot"
  ADD COLUMN "expectedAutomationCostMicros"     BIGINT,
  ADD COLUMN "conservativeAutomationCostMicros" BIGINT,
  ADD COLUMN "automationSpendCeilingMicros"     BIGINT,
  ADD COLUMN "automationCostPolicyVersion"      TEXT;

-- ── 3. TOUT MONTANT EN MICROS PASSE EN BIGINT ─────────────────────────────
--
-- Le plafond Int est de 2 147 483 647 micros, soit 2 147,48 $. Le type ne se
-- choisit pas sur l'hypothèse que les primitives d'aujourd'hui coûtent quelques
-- dollars : une primitive future ne doit pas exiger une migration de type pour
-- le dépasser. C'est exactement le débordement identifié en Phase 1C.
ALTER TABLE "TaskWorkflowRun"
  ALTER COLUMN "runAutomationBudgetMicros" TYPE BIGINT;

ALTER TABLE "WorkflowBudgetHold"
  ALTER COLUMN "amountMicros"  TYPE BIGINT,
  ALTER COLUMN "settledMicros" TYPE BIGINT;

-- ── 4. UN PLAN ACCEPTÉ DEVIENT RÉELLEMENT APPEND-ONLY ─────────────────────
--
-- La FK Restrict empêchait déjà de SUPPRIMER une version référencée par un
-- snapshot, mais rien n'empêchait de toucher ses ÉTAPES : on pouvait donc
-- changer `maxCostMicrosPerAttemptAtQuote` sous un contrat signé, ce qui vide
-- de son sens tout le gel ci-dessus.
--
-- Fonction NOUVELLE et isolée. Aucun trigger existant n'est modifié.
--
-- Les trois opérations sont couvertes, et l'UPDATE regarde OLD **et** NEW :
-- sans ça, un reparenting (déplacer une étape d'une version libre vers une
-- version acceptée, ou l'inverse) contournerait la protection dans un sens ou
-- dans l'autre.
CREATE OR REPLACE FUNCTION second_shift_accepted_plan_is_append_only()
RETURNS TRIGGER AS $$
DECLARE
  offending TEXT;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE')
     AND EXISTS (SELECT 1 FROM "TaskAcceptanceSnapshot" s
                 WHERE s."planVersionId" = NEW."planVersionId") THEN
    offending := NEW."planVersionId";
  END IF;

  IF offending IS NULL
     AND (TG_OP = 'DELETE' OR TG_OP = 'UPDATE')
     AND EXISTS (SELECT 1 FROM "TaskAcceptanceSnapshot" s
                 WHERE s."planVersionId" = OLD."planVersionId") THEN
    offending := OLD."planVersionId";
  END IF;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'plan version % is referenced by an acceptance snapshot; its steps and their quoted economics are append-only',
      offending;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS second_shift_accepted_plan_step_guard ON "TaskExecutionPlanStep";
CREATE TRIGGER second_shift_accepted_plan_step_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "TaskExecutionPlanStep"
  FOR EACH ROW EXECUTE FUNCTION second_shift_accepted_plan_is_append_only();

-- La version elle-même : ses agrégats économiques sont le plafond du run.
CREATE OR REPLACE FUNCTION second_shift_accepted_plan_version_frozen()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TaskAcceptanceSnapshot" s WHERE s."planVersionId" = OLD."id") THEN
    RAISE EXCEPTION
      'plan version % is referenced by an acceptance snapshot and cannot be modified', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS second_shift_accepted_plan_version_guard ON "TaskExecutionPlanVersion";
CREATE TRIGGER second_shift_accepted_plan_version_guard
  BEFORE UPDATE ON "TaskExecutionPlanVersion"
  FOR EACH ROW EXECUTE FUNCTION second_shift_accepted_plan_version_frozen();

-- ── 5. UNE TÂCHE COMMERCIALE AU BASSIN A UN PAYOUT CONNU ──────────────────
--
-- Garde ADDITIVE et isolée : le trigger d'invariants existant reste intact.
-- Il protège l'ÉTAT, pas seulement la transition : une tâche déjà `open` ne
-- doit pas pouvoir devenir invalide ensuite. Le contrôle se déclenche donc à
-- l'entrée réelle en `open`, ET quand un champ pertinent bouge sur une tâche
-- déjà `open` — y compris les deux drapeaux d'exemption, puisque les changer
-- est précisément la façon dont une tâche sortirait de l'exemption en gardant
-- un payout absent.
--
-- EXEMPTIONS, justifiées et non décoratives :
--   isInternal                     tâche d'entraînement, jamais payée ;
--   standingCapacityAccountId      payée par son bloc hebdomadaire, pas à la
--                                  tâche (le trigger existant refuse déjà de
--                                  la coter séparément).
CREATE OR REPLACE FUNCTION second_shift_pool_task_is_payable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" <> 'open' THEN RETURN NEW; END IF;

  IF NOT (
    OLD."status" IS DISTINCT FROM 'open'
    OR NEW."vaPayoutCents"             IS DISTINCT FROM OLD."vaPayoutCents"
    OR NEW."estimatedMinutes"          IS DISTINCT FROM OLD."estimatedMinutes"
    OR NEW."isInternal"                IS DISTINCT FROM OLD."isInternal"
    OR NEW."standingCapacityAccountId" IS DISTINCT FROM OLD."standingCapacityAccountId"
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW."isInternal" OR NEW."standingCapacityAccountId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."vaPayoutCents" IS NULL OR NEW."vaPayoutCents" <= 0 THEN
    RAISE EXCEPTION
      'a commercial task cannot be available in the pool without a positive payout (task %)', NEW."id";
  END IF;

  IF NEW."estimatedMinutes" IS NULL OR NEW."estimatedMinutes" <= 0 THEN
    RAISE EXCEPTION
      'a commercial task cannot be available in the pool without a positive effort estimate (task %)', NEW."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS second_shift_pool_payable_guard ON "Task";
CREATE TRIGGER second_shift_pool_payable_guard
  BEFORE UPDATE ON "Task"
  FOR EACH ROW EXECUTE FUNCTION second_shift_pool_task_is_payable();

-- PHASE 1C (2/2) — LA BASELINE EST IMMUABLE.
--
-- Même mécanisme que second_shift_acceptance_snapshot_immutable
-- (20260806120000) : la baseline est la copie des estimations internes au
-- moment exact de l'acceptation, et toute comparaison estimé-vs-réel future
-- repose sur le fait qu'elle n'a PAS été recalculée avec les paramètres du
-- jour. UPDATE, DELETE et TRUNCATE sont refusés en base, pas en code.
--
-- Fonction NEUVE, nom propre à cette table : aucun CREATE OR REPLACE d'une
-- fonction existante nulle part dans cette migration — la leçon de la clause
-- Standing Capacity silencieusement perdue en 1B reste appliquée en n'ayant
-- simplement rien à recopier.

CREATE OR REPLACE FUNCTION second_shift_operational_baseline_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TaskOperationalBaseline is immutable: it records the estimates as they stood at acceptance';
END;
$$;

DROP TRIGGER IF EXISTS "TaskOperationalBaseline_immutable" ON "TaskOperationalBaseline";
CREATE TRIGGER "TaskOperationalBaseline_immutable"
BEFORE UPDATE OR DELETE ON "TaskOperationalBaseline"
FOR EACH ROW EXECUTE FUNCTION second_shift_operational_baseline_immutable();

DROP TRIGGER IF EXISTS "TaskOperationalBaseline_no_truncate" ON "TaskOperationalBaseline";
CREATE TRIGGER "TaskOperationalBaseline_no_truncate"
BEFORE TRUNCATE ON "TaskOperationalBaseline"
FOR EACH STATEMENT EXECUTE FUNCTION second_shift_operational_baseline_immutable();

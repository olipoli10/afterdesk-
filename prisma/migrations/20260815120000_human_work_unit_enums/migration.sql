-- HUMAN WORK UNIT — ENUMS ONLY.
--
-- Cette migration ne fait QUE du travail d'enum, et elle est séparée pour une
-- raison mécanique : PostgreSQL refuse d'utiliser une valeur d'enum dans la
-- transaction qui l'ajoute. La migration des tables qui suit référence
-- `awaiting_human_unit` et `blocked_on_human_unit` ; les ajouter ici, dans une
-- transaction antérieure, est la seule façon que cela fonctionne.
--
-- Le précédent exact est `20260806170000_workflow_enum_values` →
-- `20260806170100_workflow_execution`, qui existe précisément pour cela.
--
-- `ADD VALUE IF NOT EXISTS` : rejouable, et sans erreur si une base a déjà été
-- amenée à cet état par un chemin différent.

ALTER TYPE "TaskWorkflowRunStatus" ADD VALUE IF NOT EXISTS 'awaiting_human_unit';
ALTER TYPE "TaskWorkflowStepStatus" ADD VALUE IF NOT EXISTS 'blocked_on_human_unit';

-- Les six nouveaux types. Créés ici plutôt que dans la migration des tables
-- pour la même raison : une contrainte CHECK ou une valeur par défaut qui les
-- nomme ne peut pas les voir dans la transaction qui les crée.

CREATE TYPE "HumanWorkUnitState" AS ENUM (
  'admitted',
  'published',
  'claimed',
  'submitted',
  'in_review',
  'revision_requested',
  'accepted',
  'resumed',
  'exhausted',
  'paused',
  'withdrawn'
);

-- Vocabulaire PROPRE, délibérément disjoint de celui des capacités et des
-- budgets : un refus de topologie rendu comme « capacité manquante » enverrait
-- l'opérateur réparer la mauvaise chose.
CREATE TYPE "HumanWorkUnitRefusalCause" AS ENUM (
  'unsupported_topology',
  'malformed_topology',
  'unmapped_economics',
  'input_unavailable',
  'classification_conflict',
  'task_already_claimed',
  'revisions_exhausted',
  'publication_deadline',
  'submission_deadline',
  'claim_lease_expired',
  'lifecycle_exit',
  'unsafe_or_unverifiable',
  'economics_exceeds_reserved'
);

CREATE TYPE "HumanWorkUnitCandidateStatus" AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'superseded',
  'withdrawn'
);

CREATE TYPE "HumanWorkUnitDecisionOutcome" AS ENUM ('accepted', 'rejected');

CREATE TYPE "HumanWorkUnitAlertKind" AS ENUM (
  'publication_deadline',
  'submission_deadline',
  'claim_lease',
  'admin_pause',
  'revision_requested',
  'withdrawn'
);

CREATE TYPE "HumanWorkUnitTransitionActorRole" AS ENUM ('worker', 'admin', 'system');

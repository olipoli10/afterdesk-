-- HUMAN WORK UNIT — TABLES, CONTRAINTES, TRIGGERS.
--
-- Additive de bout en bout. Aucune colonne existante n'est supprimée,
-- renommée, retypée ni redéfinie ; AUCUNE fonction trigger existante n'est
-- remplacée. Chaque garde ici est une fonction NOUVELLE avec un nom NOUVEAU,
-- parce que `CREATE OR REPLACE` remplace le corps entier : une clause omise
-- est une clause supprimée, et ce dépôt a perdu la garde standing-capacity
-- exactement de cette façon (20260806170200_workflow_guards).
--
-- Uniquement des fonctions PostgreSQL intégrées, pour que la même migration
-- tourne sur du Postgres géré et sur le cluster de développement local.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. LE CONTRAT DE SORTIE HUMAIN, SUR L'ÉTAPE DE PLAN ACCEPTÉE
--
-- Deux colonnes additives. NULLABLES ET JAMAIS RÉTRO-REMPLIES : un contrat
-- accepté avant cette migration ne portait pas ces valeurs au moment de sa
-- signature, et les inventer aujourd'hui fabriquerait une provenance. Une
-- étape humaine sans contrat de sortie compilable n'est PAS admise en unité —
-- fail-closed, jamais une obligation par défaut que personne n'a acceptée.
--
-- Le tableau vide sur les lignes existantes n'est pas un remplissage : c'est
-- l'ABSENCE d'artefact exigé, et elle n'est de toute façon jamais atteignable
-- tant que `humanOutputSchema` est NULL.
--
-- IMMUTABILITÉ : aucune garde nouvelle n'est requise. Le trigger existant
-- `second_shift_accepted_plan_step_guard` est au niveau LIGNE et ne nomme
-- aucune colonne — il refuse déjà tout UPDATE d'une étape dont la version de
-- plan est référencée par un snapshot d'acceptation. Ces deux colonnes en
-- héritent à l'instant où elles existent. C'est épinglé par test dans
-- `human-unit-schema-invariants.itest.ts`, parce qu'un héritage non épinglé
-- est un héritage qui peut se perdre en silence.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "TaskExecutionPlanStep"
  ADD COLUMN IF NOT EXISTS "humanOutputSchema" JSONB,
  ADD COLUMN IF NOT EXISTS "humanRequiredArtifactKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "HumanWorkUnitDefinition" (
  "id"                       TEXT NOT NULL,
  "planVersionId"            TEXT NOT NULL,
  "planStepId"               TEXT NOT NULL,
  "instructions"             TEXT NOT NULL,
  "declaredInputs"           JSONB NOT NULL,
  "outputSchema"             JSONB NOT NULL,
  "requiredArtifactKinds"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "acceptanceCriteria"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "verificationMethod"       TEXT NOT NULL,
  "eligibility"              JSONB NOT NULL,
  "reviewerAuthority"        TEXT NOT NULL DEFAULT 'admin',
  "expectedMinutes"          INTEGER NOT NULL,
  "revisionBound"            INTEGER NOT NULL,
  "publicationDeadlineHours" INTEGER NOT NULL,
  "submissionDeadlineHours"  INTEGER NOT NULL,
  "claimLeaseHours"          INTEGER NOT NULL,
  "economicProvenance"       JSONB NOT NULL,
  "dataClass"                TEXT NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HumanWorkUnitDefinition_pkey" PRIMARY KEY ("id"),

  -- CHK-2 : ni la borne de révisions ni les minutes attendues ne peuvent être
  -- négatives.
  CONSTRAINT "HumanWorkUnitDefinition_chk2"
    CHECK ("revisionBound" >= 0 AND "expectedMinutes" >= 0),

  -- CHK-3 : un délai à zéro est une attente NON BORNÉE, pas une attente
  -- rapide. Les trois doivent être strictement positifs.
  CONSTRAINT "HumanWorkUnitDefinition_chk3"
    CHECK ("publicationDeadlineHours" > 0
           AND "submissionDeadlineHours" > 0
           AND "claimLeaseHours" > 0)
);

CREATE UNIQUE INDEX "HumanWorkUnitDefinition_planStepId_key"
  ON "HumanWorkUnitDefinition"("planStepId");
CREATE INDEX "HumanWorkUnitDefinition_planVersionId_idx"
  ON "HumanWorkUnitDefinition"("planVersionId");

CREATE TABLE "HumanWorkUnitRunState" (
  "id"                    TEXT NOT NULL,
  "runId"                 TEXT NOT NULL,
  "taskId"                TEXT NOT NULL,
  "snapshotId"            TEXT NOT NULL,
  "definitionId"          TEXT NOT NULL,
  "cutOrder"              INTEGER NOT NULL,
  "state"                 "HumanWorkUnitState" NOT NULL,
  "claimGeneration"       INTEGER NOT NULL DEFAULT 0,
  "resumeGeneration"      INTEGER NOT NULL DEFAULT 0,
  "transitionSeq"         INTEGER NOT NULL DEFAULT 0,
  "remainingRevisions"    INTEGER NOT NULL,
  "claimedById"           TEXT,
  "claimedAt"             TIMESTAMP(3),
  "claimLeaseExpiresAt"   TIMESTAMP(3),
  "submissionDeadlineAt"  TIMESTAMP(3),
  "publishedAt"           TIMESTAMP(3),
  "publicationDeadlineAt" TIMESTAMP(3),
  "submittedAt"           TIMESTAMP(3),
  "acceptedAt"            TIMESTAMP(3),
  "refusalCause"          "HumanWorkUnitRefusalCause",
  "pausedDetail"          TEXT,
  "admittedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HumanWorkUnitRunState_pkey" PRIMARY KEY ("id"),

  -- CHK-1
  CONSTRAINT "HumanWorkUnitRunState_chk1" CHECK ("remainingRevisions" >= 0),

  -- CHK-4 : un état `accepted` ou `resumed` sans instant d'acceptation est un
  -- résultat sans provenance.
  CONSTRAINT "HumanWorkUnitRunState_chk4"
    CHECK ("state" NOT IN ('accepted', 'resumed') OR "acceptedAt" IS NOT NULL)
);

-- INV-1 / INV-2 : une unité par run, une par contrat accepté.
CREATE UNIQUE INDEX "HumanWorkUnitRunState_runId_key" ON "HumanWorkUnitRunState"("runId");
CREATE UNIQUE INDEX "HumanWorkUnitRunState_taskId_key" ON "HumanWorkUnitRunState"("taskId");
CREATE UNIQUE INDEX "HumanWorkUnitRunState_snapshotId_key" ON "HumanWorkUnitRunState"("snapshotId");
CREATE UNIQUE INDEX "HumanWorkUnitRunState_definitionId_key" ON "HumanWorkUnitRunState"("definitionId");
CREATE INDEX "HumanWorkUnitRunState_state_idx" ON "HumanWorkUnitRunState"("state");
CREATE INDEX "HumanWorkUnitRunState_state_publicationDeadlineAt_idx"
  ON "HumanWorkUnitRunState"("state", "publicationDeadlineAt");
CREATE INDEX "HumanWorkUnitRunState_state_submissionDeadlineAt_idx"
  ON "HumanWorkUnitRunState"("state", "submissionDeadlineAt");
CREATE INDEX "HumanWorkUnitRunState_state_claimLeaseExpiresAt_idx"
  ON "HumanWorkUnitRunState"("state", "claimLeaseExpiresAt");
CREATE INDEX "HumanWorkUnitRunState_claimedById_idx" ON "HumanWorkUnitRunState"("claimedById");

CREATE TABLE "HumanWorkUnitCandidate" (
  "id"              TEXT NOT NULL,
  "unitStateId"     TEXT NOT NULL,
  "claimGeneration" INTEGER NOT NULL,
  "revisionIndex"   INTEGER NOT NULL,
  "submittedById"   TEXT NOT NULL,
  "payload"         JSONB NOT NULL,
  "status"          "HumanWorkUnitCandidateStatus" NOT NULL DEFAULT 'pending',
  "submittedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HumanWorkUnitCandidate_pkey" PRIMARY KEY ("id")
);

-- CHK-6 : une soumission dupliquée ne peut pas créer un second candidat.
CREATE UNIQUE INDEX "HumanWorkUnitCandidate_unit_gen_rev_key"
  ON "HumanWorkUnitCandidate"("unitStateId", "claimGeneration", "revisionIndex");
CREATE INDEX "HumanWorkUnitCandidate_unitStateId_status_idx"
  ON "HumanWorkUnitCandidate"("unitStateId", "status");

-- INV-11 : AU PLUS UN candidat en attente par unité. Index unique PARTIEL,
-- l'idiome que `Dispute_one_pending_per_task` utilise déjà : deux candidats
-- non tranchés rendraient la file de revue ambiguë.
CREATE UNIQUE INDEX "HumanWorkUnitCandidate_one_pending_per_unit"
  ON "HumanWorkUnitCandidate"("unitStateId")
  WHERE "status" = 'pending';

CREATE TABLE "HumanWorkUnitCandidateFile" (
  "candidateId"  TEXT NOT NULL,
  "fileId"       TEXT NOT NULL,
  "artifactKind" TEXT NOT NULL,

  CONSTRAINT "HumanWorkUnitCandidateFile_pkey" PRIMARY KEY ("candidateId", "fileId")
);
CREATE INDEX "HumanWorkUnitCandidateFile_fileId_idx"
  ON "HumanWorkUnitCandidateFile"("fileId");

CREATE TABLE "HumanWorkUnitReviewDecision" (
  "id"                      TEXT NOT NULL,
  "candidateId"             TEXT NOT NULL,
  "unitStateId"             TEXT NOT NULL,
  "decidedById"             TEXT NOT NULL,
  "outcome"                 "HumanWorkUnitDecisionOutcome" NOT NULL,
  "cause"                   "HumanWorkUnitRefusalCause",
  "revisionInstructions"    TEXT,
  "remainingRevisionsAfter" INTEGER NOT NULL,
  "claimGeneration"         INTEGER NOT NULL,
  "decidedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HumanWorkUnitReviewDecision_pkey" PRIMARY KEY ("id")
);

-- INV-5 : exactement une décision par candidat.
CREATE UNIQUE INDEX "HumanWorkUnitReviewDecision_candidateId_key"
  ON "HumanWorkUnitReviewDecision"("candidateId");
CREATE INDEX "HumanWorkUnitReviewDecision_unitStateId_idx"
  ON "HumanWorkUnitReviewDecision"("unitStateId");

CREATE TABLE "HumanWorkUnitAcceptance" (
  "id"                          TEXT NOT NULL,
  "unitStateId"                 TEXT NOT NULL,
  "candidateId"                 TEXT NOT NULL,
  "decisionId"                  TEXT NOT NULL,
  "acceptedById"                TEXT NOT NULL,
  "claimGenerationAtAcceptance" INTEGER NOT NULL,
  "resultPayload"               JSONB NOT NULL,
  "resultSha256"                TEXT NOT NULL,
  "dataClass"                   TEXT NOT NULL,
  "criteriaVersionRef"          TEXT NOT NULL,
  "acceptedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HumanWorkUnitAcceptance_pkey" PRIMARY KEY ("id")
);

-- INV-4 : une acceptation par unité, à jamais.
CREATE UNIQUE INDEX "HumanWorkUnitAcceptance_unitStateId_key"
  ON "HumanWorkUnitAcceptance"("unitStateId");
CREATE UNIQUE INDEX "HumanWorkUnitAcceptance_candidateId_key"
  ON "HumanWorkUnitAcceptance"("candidateId");
CREATE UNIQUE INDEX "HumanWorkUnitAcceptance_decisionId_key"
  ON "HumanWorkUnitAcceptance"("decisionId");

CREATE TABLE "HumanWorkUnitResumeRecord" (
  "id"                TEXT NOT NULL,
  "runId"             TEXT NOT NULL,
  "unitStateId"       TEXT NOT NULL,
  "acceptanceId"      TEXT NOT NULL,
  "resumeGeneration"  INTEGER NOT NULL,
  "resumedStepRunIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "skippedStepRunIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resumedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HumanWorkUnitResumeRecord_pkey" PRIMARY KEY ("id")
);

-- INV-3 : UNE REPRISE PAR RUN. Cette contrainte unique — pas un chemin de
-- code — est la garantie exactement-une-fois à travers triggers concurrents,
-- retries, balayages, crashs et rejeux. Une seconde reprise pourrait rejouer
-- une étape d'aval et dépenser une seconde fois contre un plafond gelé, et
-- l'argent parti ne revient pas.
CREATE UNIQUE INDEX "HumanWorkUnitResumeRecord_runId_key"
  ON "HumanWorkUnitResumeRecord"("runId");
CREATE UNIQUE INDEX "HumanWorkUnitResumeRecord_unitStateId_key"
  ON "HumanWorkUnitResumeRecord"("unitStateId");
CREATE UNIQUE INDEX "HumanWorkUnitResumeRecord_acceptanceId_key"
  ON "HumanWorkUnitResumeRecord"("acceptanceId");

CREATE TABLE "HumanWorkUnitTransition" (
  "id"                    TEXT NOT NULL,
  "unitStateId"           TEXT NOT NULL,
  "seq"                   INTEGER NOT NULL,
  "actorId"               TEXT,
  "actorRole"             "HumanWorkUnitTransitionActorRole" NOT NULL,
  "fromState"             "HumanWorkUnitState",
  "toState"               "HumanWorkUnitState" NOT NULL,
  "cause"                 TEXT NOT NULL,
  "claimGeneration"       INTEGER NOT NULL,
  "resumeGeneration"      INTEGER NOT NULL,
  "assignmentEstablished" BOOLEAN,
  "occurredAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HumanWorkUnitTransition_pkey" PRIMARY KEY ("id")
);

-- INV-T1 : la séquence est allouée depuis `transitionSeq` dans le même CAS.
-- Cette contrainte rend `MAX(seq)+1` impossible à faire passer en douce.
CREATE UNIQUE INDEX "HumanWorkUnitTransition_unitStateId_seq_key"
  ON "HumanWorkUnitTransition"("unitStateId", "seq");
CREATE INDEX "HumanWorkUnitTransition_unitStateId_occurredAt_idx"
  ON "HumanWorkUnitTransition"("unitStateId", "occurredAt");

CREATE TABLE "HumanWorkUnitAlert" (
  "id"              TEXT NOT NULL,
  "unitStateId"     TEXT NOT NULL,
  "kind"            "HumanWorkUnitAlertKind" NOT NULL,
  "dueAt"           TIMESTAMP(3) NOT NULL,
  "firedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimGeneration" INTEGER NOT NULL,

  CONSTRAINT "HumanWorkUnitAlert_pkey" PRIMARY KEY ("id")
);

-- CHK-5 : c'est CE qui rend le balayage des délais rejouable, sans lecture
-- « a-t-on déjà notifié ? » sujette aux courses.
CREATE UNIQUE INDEX "HumanWorkUnitAlert_unit_kind_dueAt_key"
  ON "HumanWorkUnitAlert"("unitStateId", "kind", "dueAt");
CREATE INDEX "HumanWorkUnitAlert_unitStateId_idx" ON "HumanWorkUnitAlert"("unitStateId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CLÉS ÉTRANGÈRES
--
-- `Restrict` partout où la ligne est une PREUVE (candidat, décision,
-- acceptation, audit) : elle ne doit pas disparaître avec une ligne d'état.
-- `Cascade` seulement depuis le run et la tâche, dont la disparition
-- signifierait que le mandat entier n'existe plus.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "HumanWorkUnitDefinition"
  ADD CONSTRAINT "HumanWorkUnitDefinition_planVersionId_fkey"
    FOREIGN KEY ("planVersionId") REFERENCES "TaskExecutionPlanVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitDefinition_planStepId_fkey"
    FOREIGN KEY ("planStepId") REFERENCES "TaskExecutionPlanStep"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitRunState"
  ADD CONSTRAINT "HumanWorkUnitRunState_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "TaskWorkflowRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitRunState_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitRunState_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "TaskAcceptanceSnapshot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitRunState_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "HumanWorkUnitDefinition"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitRunState_claimedById_fkey"
    FOREIGN KEY ("claimedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitCandidate"
  ADD CONSTRAINT "HumanWorkUnitCandidate_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitCandidate_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitCandidateFile"
  ADD CONSTRAINT "HumanWorkUnitCandidateFile_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "HumanWorkUnitCandidate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitCandidateFile_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "File"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitReviewDecision"
  ADD CONSTRAINT "HumanWorkUnitReviewDecision_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "HumanWorkUnitCandidate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitReviewDecision_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitReviewDecision_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitAcceptance"
  ADD CONSTRAINT "HumanWorkUnitAcceptance_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitAcceptance_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "HumanWorkUnitCandidate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitAcceptance_decisionId_fkey"
    FOREIGN KEY ("decisionId") REFERENCES "HumanWorkUnitReviewDecision"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitAcceptance_acceptedById_fkey"
    FOREIGN KEY ("acceptedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitResumeRecord"
  ADD CONSTRAINT "HumanWorkUnitResumeRecord_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "TaskWorkflowRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitResumeRecord_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HumanWorkUnitResumeRecord_acceptanceId_fkey"
    FOREIGN KEY ("acceptanceId") REFERENCES "HumanWorkUnitAcceptance"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitTransition"
  ADD CONSTRAINT "HumanWorkUnitTransition_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HumanWorkUnitAlert"
  ADD CONSTRAINT "HumanWorkUnitAlert_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. GARDES
--
-- Chacune est une fonction NOUVELLE avec un nom NOUVEAU. La GUC de rétention
-- est lue avec le second argument `true`, qui renvoie NULL au lieu de lever
-- quand le paramètre n'est pas défini — le défaut est donc le REFUS.
-- ═══════════════════════════════════════════════════════════════════════════

-- INV-9 : la définition est immuable. Une définition mutée changerait
-- rétroactivement ce qu'on a demandé à un travailleur et ce contre quoi un
-- réviseur a jugé.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_definition_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'human work unit definition % is immutable; a new definition requires a new plan version',
    OLD."id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_definition_immutable
  BEFORE UPDATE OR DELETE ON "HumanWorkUnitDefinition"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_definition_immutable();

-- INV-4 : l'acceptation est immuable. C'est ce que les étapes d'aval ont
-- consommé et ce qui a été livré.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_acceptance_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'human work unit acceptance is immutable; the accepted result cannot be rewritten';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_acceptance_immutable
  BEFORE UPDATE OR DELETE ON "HumanWorkUnitAcceptance"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_acceptance_immutable();

CREATE TRIGGER afterdesk_human_unit_acceptance_no_truncate
  BEFORE TRUNCATE ON "HumanWorkUnitAcceptance"
  FOR EACH STATEMENT EXECUTE FUNCTION afterdesk_human_unit_acceptance_immutable();

-- INV-8 : les décisions sont append-only. Deux décisions rendraient
-- « laquelle a tenu » sans réponse après coup.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_decision_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'human work unit review decisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_decision_append_only
  BEFORE UPDATE OR DELETE ON "HumanWorkUnitReviewDecision"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_decision_append_only();

-- INV-8 (suite) : les enregistrements de reprise sont append-only.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_resume_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'human work unit resume records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_resume_append_only
  BEFORE UPDATE OR DELETE ON "HumanWorkUnitResumeRecord"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_resume_append_only();

-- INV-7 : l'audit est append-only. Un journal modifiable n'est pas une preuve,
-- et ce qu'il enregistrait est irrécupérable. UPDATE refusé sans condition ;
-- DELETE seulement sous la GUC de rétention.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_transition_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'human work unit transitions are append-only; an editable audit trail is not evidence';
  END IF;
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('afterdesk.retention_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'human work unit transitions are append-only; deletion requires the retention purge';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_transition_append_only
  BEFORE UPDATE OR DELETE ON "HumanWorkUnitTransition"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_transition_append_only();

CREATE OR REPLACE FUNCTION afterdesk_human_unit_transition_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'human work unit transitions are append-only; TRUNCATE is refused';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_transition_no_truncate
  BEFORE TRUNCATE ON "HumanWorkUnitTransition"
  FOR EACH STATEMENT EXECUTE FUNCTION afterdesk_human_unit_transition_no_truncate();

-- INV-10 : un candidat est immuable SAUF pour un changement de statut à sens
-- unique. Réécrire un candidat détruit la preuve de ce qui a réellement été
-- soumis.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_candidate_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('afterdesk.retention_purge', true), '') <> 'on' THEN
      RAISE EXCEPTION 'human work unit candidates are append-only; deletion requires the retention purge';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."payload"        IS DISTINCT FROM OLD."payload"
     OR NEW."unitStateId"     IS DISTINCT FROM OLD."unitStateId"
     OR NEW."claimGeneration" IS DISTINCT FROM OLD."claimGeneration"
     OR NEW."revisionIndex"   IS DISTINCT FROM OLD."revisionIndex"
     OR NEW."submittedById"   IS DISTINCT FROM OLD."submittedById"
     OR NEW."submittedAt"     IS DISTINCT FROM OLD."submittedAt" THEN
    RAISE EXCEPTION
      'human work unit candidate % is append-only; only its status may change',
      OLD."id";
  END IF;

  -- Sens unique : un candidat tranché ne redevient jamais en attente.
  IF OLD."status" <> 'pending' AND NEW."status" = 'pending' THEN
    RAISE EXCEPTION
      'human work unit candidate % is append-only; a decided candidate cannot return to pending',
      OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_candidate_append_only
  BEFORE UPDATE OR DELETE ON "HumanWorkUnitCandidate"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_candidate_append_only();

-- INV-6 : les générations sont monotones. Une génération qui peut reculer
-- n'est pas un jeton de fencing : un acteur supplanté redeviendrait courant et
-- une soumission périmée serait acceptée.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_generations_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."claimGeneration" < OLD."claimGeneration" THEN
    RAISE EXCEPTION
      'human work unit claim generation is monotonic (% -> %)',
      OLD."claimGeneration", NEW."claimGeneration";
  END IF;
  IF NEW."resumeGeneration" < OLD."resumeGeneration" THEN
    RAISE EXCEPTION
      'human work unit resume generation is monotonic (% -> %)',
      OLD."resumeGeneration", NEW."resumeGeneration";
  END IF;
  IF NEW."transitionSeq" < OLD."transitionSeq" THEN
    RAISE EXCEPTION
      'human work unit transition sequence is monotonic (% -> %)',
      OLD."transitionSeq", NEW."transitionSeq";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_generations_monotonic
  BEFORE UPDATE ON "HumanWorkUnitRunState"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_generations_monotonic();

-- INV-16 : un état terminal ne rouvre jamais. Rouvrir `resumed`, `exhausted`
-- ou `withdrawn` rejouerait du travail d'aval ou ranimerait un mandat retiré.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_state_is_terminal_once()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."state" IN ('resumed', 'exhausted', 'withdrawn')
     AND NEW."state" IS DISTINCT FROM OLD."state" THEN
    RAISE EXCEPTION
      'human work unit state % is terminal and never reopens (attempted %)',
      OLD."state", NEW."state";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_state_is_terminal_once
  BEFORE UPDATE ON "HumanWorkUnitRunState"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_state_is_terminal_once();

-- INV-13 : le réclamant de l'unité EST le réclamant de la tâche. Une
-- divergence est un second engagement en tout sauf le nom, et le bénéficiaire
-- devient ambigu.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_claimant_matches_task()
RETURNS TRIGGER AS $$
DECLARE
  task_claimant TEXT;
BEGIN
  IF NEW."claimedById" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "claimedById" INTO task_claimant FROM "Task" WHERE "id" = NEW."taskId";
  IF task_claimant IS DISTINCT FROM NEW."claimedById" THEN
    RAISE EXCEPTION
      'human work unit claimant must match the task claimant (unit %, task %)',
      NEW."claimedById", coalesce(task_claimant, 'NULL');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_claimant_matches_task
  BEFORE INSERT OR UPDATE ON "HumanWorkUnitRunState"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_claimant_matches_task();

-- INV-17 : le décideur n'est pas le soumissionnaire. L'auto-acceptation
-- transforme un candidat en entrée de contrat sans porte indépendante — un
-- effondrement qu'aucun audit ultérieur ne répare.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_decider_is_not_submitter()
RETURNS TRIGGER AS $$
DECLARE
  submitter TEXT;
BEGIN
  SELECT "submittedById" INTO submitter
    FROM "HumanWorkUnitCandidate" WHERE "id" = NEW."candidateId";
  IF submitter IS NOT NULL AND submitter = NEW."decidedById" THEN
    RAISE EXCEPTION
      'the decider must not be the submitter of the candidate under review';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_decider_is_not_submitter
  BEFORE INSERT ON "HumanWorkUnitReviewDecision"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_decider_is_not_submitter();

-- INV-14 : un changement de réclamant ANTÉRIEUR clôture atomiquement. La garde
-- `OLD."claimedById" IS NOT NULL` exclut la réclamation initiale NULL →
-- travailleur, que l'application incrémente déjà : sans elle, la toute
-- première réclamation serait doublement incrémentée et instantanément
-- périmée. Le trigger et l'UPDATE de la tâche committent ensemble, donc un
-- détenteur périmé qui soumet après réassignation est refusé comme périmé
-- plutôt que fusionné ou accepté.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_fence_on_claim_change()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "HumanWorkUnitRunState"
     SET "claimGeneration" = "claimGeneration" + 1,
         "claimedById"     = NULL,
         "claimedAt"       = NULL,
         "updatedAt"       = CURRENT_TIMESTAMP
   WHERE "taskId" = NEW."id"
     AND "state" NOT IN ('resumed', 'exhausted', 'withdrawn');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_fence_on_claim_change
  AFTER UPDATE OF "claimedById" ON "Task"
  FOR EACH ROW
  WHEN (OLD."claimedById" IS NOT NULL
        AND OLD."claimedById" IS DISTINCT FROM NEW."claimedById")
  EXECUTE FUNCTION afterdesk_human_unit_fence_on_claim_change();

-- INV-12 : LE PAYOUT EST GELÉ DÈS L'ADMISSION. Le gel existant ne se déclenche
-- que si `claimedById` est non nul DES DEUX CÔTÉS, si bien qu'un cycle
-- libérer-puis-reprendre passe droit dans l'interstice. Une unité admise ferme
-- cet interstice : le travailleur a accepté un montant, et il ne bouge plus.
CREATE OR REPLACE FUNCTION afterdesk_admitted_payout_is_frozen()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."vaPayoutCents"    IS DISTINCT FROM OLD."vaPayoutCents"
      OR NEW."estimatedMinutes" IS DISTINCT FROM OLD."estimatedMinutes")
     AND EXISTS (SELECT 1 FROM "HumanWorkUnitRunState" s WHERE s."taskId" = OLD."id") THEN
    RAISE EXCEPTION
      'task % has an admitted human work unit; its accepted payout and minutes are frozen',
      OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_admitted_payout_is_frozen
  BEFORE UPDATE ON "Task"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_admitted_payout_is_frozen();

-- INV-15 : aucune réservation fournisseur au niveau du run pendant que
-- l'unité attend. C'est de l'ORDONNANCEMENT, pas de la comptabilité : une
-- dépense partie de la plateforme ne peut pas être défaite par une
-- vérification qui tourne après.
CREATE OR REPLACE FUNCTION afterdesk_human_unit_no_spend_while_waiting()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "HumanWorkUnitRunState" s
     WHERE s."runId" = NEW."runId"
       AND s."state" NOT IN ('resumed', 'exhausted', 'withdrawn')
  ) THEN
    RAISE EXCEPTION
      'run % has a human work unit still waiting; no provider reservation may be taken',
      NEW."runId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER afterdesk_human_unit_no_spend_while_waiting
  BEFORE INSERT ON "WorkflowBudgetHold"
  FOR EACH ROW EXECUTE FUNCTION afterdesk_human_unit_no_spend_while_waiting();

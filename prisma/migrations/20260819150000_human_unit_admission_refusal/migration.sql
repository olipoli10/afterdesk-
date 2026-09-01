-- T050 — durable, disjoint reason for a HumanWorkUnit admission refusal.
--
-- Additive and nullable: historical runs were never evaluated by this
-- admission gate, so backfilling a reason would invent provenance.
ALTER TABLE "TaskWorkflowRun"
  ADD COLUMN "humanUnitAdmissionRefusalCause" "HumanWorkUnitRefusalCause";

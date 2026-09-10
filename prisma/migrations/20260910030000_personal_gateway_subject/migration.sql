-- Add a distinct personal subject without registering a dispatchable gateway
-- operation or creating policies/routes. Legacy Task and Voice semantics stay.
ALTER TABLE "AiOperation" ADD COLUMN "personalAssistantOperationId" TEXT;
CREATE UNIQUE INDEX "AiOperation_personalAssistantOperationId_key"
  ON "AiOperation"("personalAssistantOperationId");
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_personalAssistantOperationId_fkey"
  FOREIGN KEY ("personalAssistantOperationId") REFERENCES "PersonalAssistantOperation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiOperation" ADD CONSTRAINT "ai_operation_personal_subject_ck" CHECK (
  (purpose = 'personal_intent_candidate_v1' AND "personalAssistantOperationId" IS NOT NULL
    AND "taskId" IS NULL AND "voiceIntakeSegmentId" IS NULL)
  OR (purpose <> 'personal_intent_candidate_v1' AND "personalAssistantOperationId" IS NULL)
);

-- Subject reassignment would invalidate existing operation fingerprints and
-- turn an old claim into authority for a different person's inbound message.
CREATE FUNCTION personal_gateway_reject_subject_rebinding() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF (OLD."personalAssistantOperationId" IS NOT NULL OR NEW."personalAssistantOperationId" IS NOT NULL)
    AND ROW(OLD."personalAssistantOperationId", OLD.purpose, OLD."operationKey")
      IS DISTINCT FROM ROW(NEW."personalAssistantOperationId", NEW.purpose, NEW."operationKey") THEN
    RAISE EXCEPTION 'personal gateway subject binding is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "personal_gateway_subject_immutable" BEFORE UPDATE ON "AiOperation"
  FOR EACH ROW EXECUTE FUNCTION personal_gateway_reject_subject_rebinding();

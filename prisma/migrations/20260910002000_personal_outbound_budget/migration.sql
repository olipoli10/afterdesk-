CREATE TABLE "PersonalAssistantBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ceilingCadMicros" BIGINT NOT NULL CHECK ("ceilingCadMicros" > 0),
  "reservedCadMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedCadMicros" >= 0),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalAssistantBudget_ceiling_check" CHECK ("reservedCadMicros" <= "ceilingCadMicros")
);
ALTER TABLE "PersonalAssistantOperation" ADD COLUMN "budgetId" TEXT;
ALTER TABLE "PersonalAssistantOperation" ADD COLUMN "reservedCadMicros" BIGINT CHECK ("reservedCadMicros" IS NULL OR "reservedCadMicros" > 0);
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_budget_fkey" FOREIGN KEY ("budgetId") REFERENCES "PersonalAssistantBudget"("id");
CREATE TABLE "PersonalAssistantDeliveryReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operationId" TEXT NOT NULL REFERENCES "PersonalAssistantOperation"("id") ON DELETE CASCADE,
  "providerSid" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PersonalAssistantDeliveryReceipt_operationId_createdAt_idx" ON "PersonalAssistantDeliveryReceipt"("operationId", "createdAt");
ALTER TABLE "ConstructionConnectorGrant" DROP CONSTRAINT "ConstructionConnectorGrant_capability_check";
ALTER TABLE "ConstructionConnectorGrant" ADD CONSTRAINT "ConstructionConnectorGrant_capability_check"
CHECK ("capability" IN ('calendar_read', 'calendar_write', 'sms_inbound', 'sms_outbound_prepare', 'voice_transcript_inbound', 'personal_sms_send', 'personal_voice_send'));
ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "PersonalAssistantOperation_kind_check";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_kind_check"
CHECK ("kind" IN ('personal_sms_inbound', 'google_oauth', 'calendar_write', 'sms_outbound', 'voice_outbound', 'sms_pairing'));

CREATE TABLE "ConstructionConnectorCredential" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionConnectorCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionConnectorCredential_account_fkey" FOREIGN KEY ("connectorAccountId", "workspaceId") REFERENCES "ConstructionConnectorAccount"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ConstructionConnectorCredential_account_revoked_idx"
ON "ConstructionConnectorCredential"("connectorAccountId", "revokedAt");

CREATE TABLE "PersonalAssistantOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('personal_sms_inbound', 'google_oauth', 'calendar_write', 'sms_outbound', 'voice_outbound')),
  "status" TEXT NOT NULL CHECK ("status" IN ('received', 'processing', 'completed', 'refused', 'uncertain', 'pending', 'launched', 'consuming', 'approved')),
  "idempotencyKey" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalAssistantOperation_account_fkey" FOREIGN KEY ("connectorAccountId", "workspaceId") REFERENCES "ConstructionConnectorAccount"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PersonalAssistantOperation_idempotencyKey_key" ON "PersonalAssistantOperation"("idempotencyKey");
CREATE INDEX "PersonalAssistantOperation_workspaceId_kind_status_idx" ON "PersonalAssistantOperation"("workspaceId", "kind", "status");

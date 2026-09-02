-- ENDVERA Construction Operating Assistant R24 — durable provider-neutral
-- messaging policy, selected MMS evidence links and immutable delivery proof.
-- Forward-only. No raw phone, provider token, webhook body or remote media URL.

CREATE TABLE "ConstructionMessagingPermission" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
  "suppressionStatus" TEXT NOT NULL DEFAULT 'allowed',
  "evidenceRef" TEXT,
  "sourceMessageId" TEXT,
  "actorUserId" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stateVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionMessagingPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionMessageMediaReference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionMessageMediaReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionMessageDeliveryEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "providerEventRef" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "statusRank" INTEGER NOT NULL,
  "proofLevel" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionMessageDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionMessagingTransition" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "versionBefore" INTEGER,
  "versionAfter" INTEGER NOT NULL,
  "beforeState" JSONB,
  "afterState" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionMessagingTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionMessagingPermission_workspaceId_contactId_purpose_key"
  ON "ConstructionMessagingPermission"("workspaceId", "contactId", "purpose");
CREATE INDEX "ConstructionMessagingPermission_workspaceId_suppressionStatus_idx"
  ON "ConstructionMessagingPermission"("workspaceId", "suppressionStatus");
CREATE INDEX "ConstructionMessagingPermission_contactId_purpose_idx"
  ON "ConstructionMessagingPermission"("contactId", "purpose");

CREATE UNIQUE INDEX "ConstructionMessageMediaReference_messageId_evidenceId_key"
  ON "ConstructionMessageMediaReference"("messageId", "evidenceId");
CREATE INDEX "ConstructionMessageMediaReference_workspaceId_projectId_createdAt_idx"
  ON "ConstructionMessageMediaReference"("workspaceId", "projectId", "createdAt");
CREATE INDEX "ConstructionMessageMediaReference_evidenceId_idx"
  ON "ConstructionMessageMediaReference"("evidenceId");

CREATE UNIQUE INDEX "ConstructionMessageDeliveryEvent_fingerprint_key"
  ON "ConstructionMessageDeliveryEvent"("fingerprint");
CREATE UNIQUE INDEX "ConstructionMessageDeliveryEvent_workspaceId_providerEventRef_key"
  ON "ConstructionMessageDeliveryEvent"("workspaceId", "providerEventRef");
CREATE INDEX "ConstructionMessageDeliveryEvent_workspaceId_operationId_statusRank_idx"
  ON "ConstructionMessageDeliveryEvent"("workspaceId", "operationId", "statusRank");
CREATE UNIQUE INDEX "ConstructionMessagingTransition_workspaceId_commandId_key"
  ON "ConstructionMessagingTransition"("workspaceId", "commandId");
CREATE INDEX "ConstructionMessagingTransition_workspaceId_contactId_createdAt_idx"
  ON "ConstructionMessagingTransition"("workspaceId", "contactId", "createdAt");

ALTER TABLE "ConstructionMessagingPermission"
  ADD CONSTRAINT "ConstructionMessagingPermission_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessagingPermission"
  ADD CONSTRAINT "ConstructionMessagingPermission_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessagingPermission"
  ADD CONSTRAINT "ConstructionMessagingPermission_sourceMessageId_fkey"
  FOREIGN KEY ("sourceMessageId") REFERENCES "ConstructionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConstructionMessageMediaReference"
  ADD CONSTRAINT "ConstructionMessageMediaReference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessageMediaReference"
  ADD CONSTRAINT "ConstructionMessageMediaReference_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessageMediaReference"
  ADD CONSTRAINT "ConstructionMessageMediaReference_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ConstructionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConstructionMessageDeliveryEvent"
  ADD CONSTRAINT "ConstructionMessageDeliveryEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessagingTransition"
  ADD CONSTRAINT "ConstructionMessagingTransition_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessagingTransition"
  ADD CONSTRAINT "ConstructionMessagingTransition_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConstructionMessagingPermission"
  ADD CONSTRAINT "ConstructionMessagingPermission_purpose_check"
  CHECK ("purpose" IN ('service', 'commercial'));
ALTER TABLE "ConstructionMessagingPermission"
  ADD CONSTRAINT "ConstructionMessagingPermission_consent_check"
  CHECK ("consentStatus" IN ('unknown', 'granted', 'withdrawn'));
ALTER TABLE "ConstructionMessagingPermission"
  ADD CONSTRAINT "ConstructionMessagingPermission_suppression_check"
  CHECK ("suppressionStatus" IN ('allowed', 'suppressed', 'review_required'));
ALTER TABLE "ConstructionMessageMediaReference"
  ADD CONSTRAINT "ConstructionMessageMediaReference_kind_check"
  CHECK ("kind" IN ('PHOTO', 'DOCUMENT', 'WRITTEN_APPROVAL'));
ALTER TABLE "ConstructionMessageDeliveryEvent"
  ADD CONSTRAINT "ConstructionMessageDeliveryEvent_status_check"
  CHECK ("status" IN ('PREPARED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'));
ALTER TABLE "ConstructionMessageDeliveryEvent"
  ADD CONSTRAINT "ConstructionMessageDeliveryEvent_proof_check"
  CHECK ("proofLevel" = 'SYNTHETIC_LOCAL');
ALTER TABLE "ConstructionMessageDeliveryEvent"
  ADD CONSTRAINT "ConstructionMessageDeliveryEvent_transport_check"
  CHECK ("externalTransportPerformed" = false);
ALTER TABLE "ConstructionMessagingTransition"
  ADD CONSTRAINT "ConstructionMessagingTransition_purpose_check"
  CHECK ("purpose" IN ('service', 'commercial'));

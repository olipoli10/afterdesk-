-- R26 provider-neutral project email inbox. Forward-only; provider access,
-- credentials, remote attachment fetch and external transport remain disabled.
CREATE TABLE "ConstructionEmailAccount" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "accountRef" TEXT NOT NULL, "mailboxScopeRef" TEXT NOT NULL,
  "capabilities" TEXT[], "status" TEXT NOT NULL DEFAULT 'PREPARED_DISABLED',
  "version" INTEGER NOT NULL DEFAULT 1, "cursorRef" TEXT,
  "cursorVersion" INTEGER NOT NULL DEFAULT 0,
  "credentialStored" BOOLEAN NOT NULL DEFAULT false,
  "externalTransportEnabled" BOOLEAN NOT NULL DEFAULT false,
  "preparedByUserId" TEXT NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionEmailAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ConstructionEmailEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "projectId" TEXT, "contactId" TEXT, "messageId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL, "providerMessageRef" TEXT NOT NULL, "threadRef" TEXT,
  "cursorRef" TEXT NOT NULL, "senderIdentityRef" TEXT NOT NULL,
  "recipientRefs" TEXT[], "subject" TEXT NOT NULL, "normalizedBody" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "verificationState" TEXT NOT NULL, "result" JSONB,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionEmailEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ConstructionEmailEvidenceLink" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "emailEventId" TEXT NOT NULL, "evidenceId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionEmailEvidenceLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ConstructionEmailDraft" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL, "contactId" TEXT NOT NULL, "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL, "toRef" TEXT NOT NULL, "ccRefs" TEXT[],
  "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "threadRef" TEXT,
  "selectedEvidenceIds" TEXT[], "version" INTEGER NOT NULL DEFAULT 1,
  "payloadHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PREPARED_UNSENT',
  "approvedByUserId" TEXT, "approvedAt" TIMESTAMP(3),
  "deliveryCount" INTEGER NOT NULL DEFAULT 0,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionEmailDraft_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ConstructionEmailDecision" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "stateBefore" TEXT, "stateAfter" TEXT NOT NULL,
  "result" JSONB NOT NULL, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionEmailDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConstructionEmailAccount_workspaceId_provider_accountRef_key" ON "ConstructionEmailAccount"("workspaceId","provider","accountRef");
CREATE INDEX "ConstructionEmailAccount_workspaceId_status_createdAt_idx" ON "ConstructionEmailAccount"("workspaceId","status","createdAt");
CREATE UNIQUE INDEX "ConstructionEmailEvent_messageId_key" ON "ConstructionEmailEvent"("messageId");
CREATE UNIQUE INDEX "ConstructionEmailEvent_workspaceId_eventId_key" ON "ConstructionEmailEvent"("workspaceId","eventId");
CREATE UNIQUE INDEX "ConstructionEmailEvent_accountId_providerMessageRef_key" ON "ConstructionEmailEvent"("accountId","providerMessageRef");
CREATE INDEX "ConstructionEmailEvent_workspaceId_status_occurredAt_idx" ON "ConstructionEmailEvent"("workspaceId","status","occurredAt");
CREATE INDEX "ConstructionEmailEvent_projectId_occurredAt_idx" ON "ConstructionEmailEvent"("projectId","occurredAt");
CREATE UNIQUE INDEX "ConstructionEmailEvidenceLink_emailEventId_evidenceId_key" ON "ConstructionEmailEvidenceLink"("emailEventId","evidenceId");
CREATE INDEX "ConstructionEmailEvidenceLink_workspaceId_projectId_createdAt_idx" ON "ConstructionEmailEvidenceLink"("workspaceId","projectId","createdAt");
CREATE UNIQUE INDEX "ConstructionEmailDraft_workspaceId_commandId_key" ON "ConstructionEmailDraft"("workspaceId","commandId");
CREATE INDEX "ConstructionEmailDraft_workspaceId_status_createdAt_idx" ON "ConstructionEmailDraft"("workspaceId","status","createdAt");
CREATE INDEX "ConstructionEmailDraft_projectId_status_idx" ON "ConstructionEmailDraft"("projectId","status");
CREATE UNIQUE INDEX "ConstructionEmailDecision_workspaceId_commandId_key" ON "ConstructionEmailDecision"("workspaceId","commandId");
CREATE INDEX "ConstructionEmailDecision_workspaceId_entityType_entityId_createdAt_idx" ON "ConstructionEmailDecision"("workspaceId","entityType","entityId","createdAt");
ALTER TABLE "ConstructionEmailAccount" ADD CONSTRAINT "ConstructionEmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailEvent" ADD CONSTRAINT "ConstructionEmailEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailEvent" ADD CONSTRAINT "ConstructionEmailEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConstructionEmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailEvent" ADD CONSTRAINT "ConstructionEmailEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailEvent" ADD CONSTRAINT "ConstructionEmailEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailEvidenceLink" ADD CONSTRAINT "ConstructionEmailEvidenceLink_emailEventId_fkey" FOREIGN KEY ("emailEventId") REFERENCES "ConstructionEmailEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailDraft" ADD CONSTRAINT "ConstructionEmailDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailDraft" ADD CONSTRAINT "ConstructionEmailDraft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConstructionEmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailDraft" ADD CONSTRAINT "ConstructionEmailDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailDraft" ADD CONSTRAINT "ConstructionEmailDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEmailAccount" ADD CONSTRAINT "ConstructionEmailAccount_provider_check" CHECK ("provider" IN ('GOOGLE_GMAIL','MICROSOFT_GRAPH'));
ALTER TABLE "ConstructionEmailAccount" ADD CONSTRAINT "ConstructionEmailAccount_status_check" CHECK ("status" IN ('PREPARED_DISABLED','SYNC_REQUIRED','REVOKED'));
ALTER TABLE "ConstructionEmailAccount" ADD CONSTRAINT "ConstructionEmailAccount_security_check" CHECK ("credentialStored" = false AND "externalTransportEnabled" = false);
ALTER TABLE "ConstructionEmailEvent" ADD CONSTRAINT "ConstructionEmailEvent_status_check" CHECK ("status" IN ('RECEIVED','RESOLVED','CLARIFICATION_REQUIRED','REFUSED','SYNC_REQUIRED'));
ALTER TABLE "ConstructionEmailEvent" ADD CONSTRAINT "ConstructionEmailEvent_transport_check" CHECK ("externalTransportPerformed" = false);
ALTER TABLE "ConstructionEmailDraft" ADD CONSTRAINT "ConstructionEmailDraft_status_check" CHECK ("status" IN ('PREPARED_UNSENT','APPROVED_UNSENT'));
ALTER TABLE "ConstructionEmailDraft" ADD CONSTRAINT "ConstructionEmailDraft_transport_check" CHECK ("externalTransportPerformed" = false AND "deliveryCount" = 0);
CREATE OR REPLACE FUNCTION "ConstructionEmailDecision_immutable_guard"() RETURNS TRIGGER AS $$ BEGIN IF TG_OP='UPDATE' OR (TG_OP='DELETE' AND pg_trigger_depth()=0) THEN RAISE EXCEPTION 'ConstructionEmailDecision is immutable'; END IF; RETURN OLD; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ConstructionEmailDecision_immutable" BEFORE UPDATE OR DELETE ON "ConstructionEmailDecision" FOR EACH ROW EXECUTE FUNCTION "ConstructionEmailDecision_immutable_guard"();

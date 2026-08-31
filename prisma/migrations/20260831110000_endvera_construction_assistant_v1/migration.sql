-- ENDVERA Construction Assistant V1: additive operational-memory foundation.
-- No existing table or state machine is altered.

CREATE TYPE "ConstructionWorkspaceStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ConstructionMembershipRole" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "ConstructionMembershipStatus" AS ENUM ('active', 'revoked');
CREATE TYPE "ConstructionProjectStatus" AS ENUM ('active', 'on_hold', 'completed', 'archived');
CREATE TYPE "ConstructionContactStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "ConstructionChannel" AS ENUM ('portal', 'sms', 'email');
CREATE TYPE "ConstructionMessageDirection" AS ENUM ('inbound', 'outbound');
CREATE TYPE "ConstructionMessageStatus" AS ENUM ('received', 'interpreted', 'needs_clarification', 'proposed', 'approved', 'simulated_delivered', 'refused', 'unavailable');
CREATE TYPE "ConstructionIntent" AS ENUM ('calendar_item_create', 'calendar_query', 'outbound_message_draft', 'clarification_required', 'unsupported');
CREATE TYPE "ConstructionVerificationState" AS ENUM ('proposed', 'verified', 'rejected');
CREATE TYPE "ConstructionActionType" AS ENUM ('reminder', 'follow_up', 'outbound_message');
CREATE TYPE "ConstructionActionStatus" AS ENUM ('proposed', 'approved', 'simulated_delivered', 'revoked');

CREATE TABLE "ConstructionWorkspace" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultTimezone" TEXT NOT NULL DEFAULT 'America/Toronto',
  "defaultLocale" TEXT NOT NULL DEFAULT 'fr-CA',
  "status" "ConstructionWorkspaceStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionWorkspaceMember" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ConstructionMembershipRole" NOT NULL DEFAULT 'member',
  "status" "ConstructionMembershipStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionWorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionCommunicationIdentity" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "contactId" TEXT,
  "channel" "ConstructionChannel" NOT NULL,
  "normalizedAddress" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "permissions" TEXT[] NOT NULL,
  "status" "ConstructionMembershipStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCommunicationIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionCommunicationIdentity_subject_check" CHECK ("userId" IS NOT NULL OR "contactId" IS NOT NULL)
);

CREATE TABLE "ConstructionProject" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "status" "ConstructionProjectStatus" NOT NULL DEFAULT 'active',
  "timezone" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "expectedEndAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionContact" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "displayName" TEXT NOT NULL,
  "companyName" TEXT,
  "role" TEXT,
  "normalizedPhone" TEXT,
  "normalizedEmail" TEXT,
  "preferredLanguage" TEXT NOT NULL DEFAULT 'fr',
  "status" "ConstructionContactStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "contactId" TEXT,
  "direction" "ConstructionMessageDirection" NOT NULL,
  "channel" "ConstructionChannel" NOT NULL,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "sender" TEXT,
  "recipients" TEXT[] NOT NULL,
  "originalBody" TEXT NOT NULL,
  "normalizedBody" TEXT NOT NULL,
  "status" "ConstructionMessageStatus" NOT NULL DEFAULT 'received',
  "receivedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionMessage_provider_pair_check" CHECK (("provider" IS NULL) = ("providerMessageId" IS NULL))
);

CREATE TABLE "ConstructionInterpretation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "intent" "ConstructionIntent" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "language" TEXT NOT NULL,
  "originalDatePhrase" TEXT,
  "structuredResult" JSONB NOT NULL,
  "clarification" JSONB,
  "interpreterVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionInterpretation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionInterpretation_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

CREATE TABLE "ConstructionCalendarItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "contactId" TEXT,
  "sourceMessageId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "confidence" DOUBLE PRECISION NOT NULL,
  "verificationState" "ConstructionVerificationState" NOT NULL DEFAULT 'proposed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCalendarItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionCalendarItem_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "ConstructionCalendarItem_time_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "ConstructionAction" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "contactId" TEXT,
  "sourceMessageId" TEXT NOT NULL,
  "type" "ConstructionActionType" NOT NULL,
  "status" "ConstructionActionStatus" NOT NULL DEFAULT 'proposed',
  "dueAt" TIMESTAMP(3),
  "riskClass" TEXT NOT NULL DEFAULT 'medium',
  "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "approvedVersion" INTEGER,
  "approvedPayloadHash" TEXT,
  "approvedAt" TIMESTAMP(3),
  "simulatedDeliveryCount" INTEGER NOT NULL DEFAULT 0,
  "simulatedDeliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionAction_version_check" CHECK ("version" > 0),
  CONSTRAINT "ConstructionAction_delivery_count_check" CHECK ("simulatedDeliveryCount" BETWEEN 0 AND 1),
  CONSTRAINT "ConstructionAction_approval_pair_check" CHECK (("approvedVersion" IS NULL) = ("approvedPayloadHash" IS NULL))
);

CREATE TABLE "ConstructionAuditEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reasonCode" TEXT,
  "metadata" JSONB,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConstructionWorkspace_ownerUserId_status_idx" ON "ConstructionWorkspace"("ownerUserId", "status");
CREATE UNIQUE INDEX "ConstructionWorkspaceMember_workspaceId_userId_key" ON "ConstructionWorkspaceMember"("workspaceId", "userId");
CREATE INDEX "ConstructionWorkspaceMember_userId_status_idx" ON "ConstructionWorkspaceMember"("userId", "status");
CREATE UNIQUE INDEX "ConstructionCommunicationIdentity_workspaceId_channel_normalizedAddress_key" ON "ConstructionCommunicationIdentity"("workspaceId", "channel", "normalizedAddress");
CREATE INDEX "ConstructionCommunicationIdentity_userId_status_idx" ON "ConstructionCommunicationIdentity"("userId", "status");
CREATE INDEX "ConstructionCommunicationIdentity_contactId_status_idx" ON "ConstructionCommunicationIdentity"("contactId", "status");
CREATE UNIQUE INDEX "ConstructionProject_workspaceId_code_key" ON "ConstructionProject"("workspaceId", "code");
CREATE INDEX "ConstructionProject_workspaceId_name_idx" ON "ConstructionProject"("workspaceId", "name");
CREATE INDEX "ConstructionProject_workspaceId_status_idx" ON "ConstructionProject"("workspaceId", "status");
CREATE INDEX "ConstructionContact_workspaceId_displayName_idx" ON "ConstructionContact"("workspaceId", "displayName");
CREATE INDEX "ConstructionContact_workspaceId_normalizedPhone_idx" ON "ConstructionContact"("workspaceId", "normalizedPhone");
CREATE INDEX "ConstructionContact_workspaceId_normalizedEmail_idx" ON "ConstructionContact"("workspaceId", "normalizedEmail");
CREATE UNIQUE INDEX "ConstructionMessage_workspaceId_idempotencyKey_key" ON "ConstructionMessage"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "ConstructionMessage_provider_providerMessageId_key" ON "ConstructionMessage"("provider", "providerMessageId");
CREATE INDEX "ConstructionMessage_workspaceId_createdAt_idx" ON "ConstructionMessage"("workspaceId", "createdAt");
CREATE INDEX "ConstructionMessage_workspaceId_status_idx" ON "ConstructionMessage"("workspaceId", "status");
CREATE UNIQUE INDEX "ConstructionInterpretation_messageId_key" ON "ConstructionInterpretation"("messageId");
CREATE INDEX "ConstructionInterpretation_workspaceId_intent_createdAt_idx" ON "ConstructionInterpretation"("workspaceId", "intent", "createdAt");
CREATE UNIQUE INDEX "ConstructionCalendarItem_sourceMessageId_key" ON "ConstructionCalendarItem"("sourceMessageId");
CREATE INDEX "ConstructionCalendarItem_workspaceId_startsAt_idx" ON "ConstructionCalendarItem"("workspaceId", "startsAt");
CREATE INDEX "ConstructionCalendarItem_projectId_startsAt_idx" ON "ConstructionCalendarItem"("projectId", "startsAt");
CREATE UNIQUE INDEX "ConstructionAction_sourceMessageId_key" ON "ConstructionAction"("sourceMessageId");
CREATE INDEX "ConstructionAction_workspaceId_status_dueAt_idx" ON "ConstructionAction"("workspaceId", "status", "dueAt");
CREATE INDEX "ConstructionAction_contactId_status_idx" ON "ConstructionAction"("contactId", "status");
CREATE UNIQUE INDEX "ConstructionAuditEvent_fingerprint_key" ON "ConstructionAuditEvent"("fingerprint");
CREATE INDEX "ConstructionAuditEvent_workspaceId_createdAt_idx" ON "ConstructionAuditEvent"("workspaceId", "createdAt");
CREATE INDEX "ConstructionAuditEvent_entityType_entityId_createdAt_idx" ON "ConstructionAuditEvent"("entityType", "entityId", "createdAt");

ALTER TABLE "ConstructionWorkspace" ADD CONSTRAINT "ConstructionWorkspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionWorkspaceMember" ADD CONSTRAINT "ConstructionWorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionWorkspaceMember" ADD CONSTRAINT "ConstructionWorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionProject" ADD CONSTRAINT "ConstructionProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionContact" ADD CONSTRAINT "ConstructionContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionContact" ADD CONSTRAINT "ConstructionContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommunicationIdentity" ADD CONSTRAINT "ConstructionCommunicationIdentity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommunicationIdentity" ADD CONSTRAINT "ConstructionCommunicationIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommunicationIdentity" ADD CONSTRAINT "ConstructionCommunicationIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessage" ADD CONSTRAINT "ConstructionMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessage" ADD CONSTRAINT "ConstructionMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessage" ADD CONSTRAINT "ConstructionMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionInterpretation" ADD CONSTRAINT "ConstructionInterpretation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionInterpretation" ADD CONSTRAINT "ConstructionInterpretation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConstructionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCalendarItem" ADD CONSTRAINT "ConstructionCalendarItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCalendarItem" ADD CONSTRAINT "ConstructionCalendarItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionCalendarItem" ADD CONSTRAINT "ConstructionCalendarItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionCalendarItem" ADD CONSTRAINT "ConstructionCalendarItem_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "ConstructionMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionAction" ADD CONSTRAINT "ConstructionAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAction" ADD CONSTRAINT "ConstructionAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionAction" ADD CONSTRAINT "ConstructionAction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionAction" ADD CONSTRAINT "ConstructionAction_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "ConstructionMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuditEvent" ADD CONSTRAINT "ConstructionAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuditEvent" ADD CONSTRAINT "ConstructionAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

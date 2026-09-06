CREATE TABLE "ConstructionSecretaryBroadcastDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED_UNSENT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "body" TEXT NOT NULL,
    "recipientSnapshot" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "preparedByUserId" TEXT NOT NULL,
    "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionSecretaryBroadcastDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionSecretaryBroadcastDraft_sourceMessageId_key"
ON "ConstructionSecretaryBroadcastDraft"("sourceMessageId");

CREATE UNIQUE INDEX "ConstructionSecretaryBroadcastDraft_workspaceId_requestId_key"
ON "ConstructionSecretaryBroadcastDraft"("workspaceId", "requestId");

CREATE INDEX "ConstructionSecretaryBroadcastDraft_workspaceId_status_preparedAt_idx"
ON "ConstructionSecretaryBroadcastDraft"("workspaceId", "status", "preparedAt");

CREATE INDEX "ConstructionSecretaryBroadcastDraft_preparedByUserId_preparedAt_idx"
ON "ConstructionSecretaryBroadcastDraft"("preparedByUserId", "preparedAt");

ALTER TABLE "ConstructionSecretaryBroadcastDraft"
ADD CONSTRAINT "ConstructionSecretaryBroadcastDraft_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConstructionSecretaryBroadcastDraft"
ADD CONSTRAINT "ConstructionSecretaryBroadcastDraft_sourceMessageId_fkey"
FOREIGN KEY ("sourceMessageId") REFERENCES "ConstructionMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConstructionSecretaryBroadcastDraft"
ADD CONSTRAINT "ConstructionSecretaryBroadcastDraft_preparedByUserId_fkey"
FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

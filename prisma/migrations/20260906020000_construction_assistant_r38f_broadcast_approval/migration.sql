ALTER TABLE "ConstructionSecretaryBroadcastDraft"
ADD COLUMN "approvalCommandId" TEXT,
ADD COLUMN "approvalCommandHash" TEXT,
ADD COLUMN "approvedVersion" INTEGER,
ADD COLUMN "approvedPayloadHash" TEXT,
ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ConstructionSecretaryBroadcastDraft_approvalCommandId_key"
ON "ConstructionSecretaryBroadcastDraft"("approvalCommandId");

CREATE INDEX "ConstructionSecretaryBroadcastDraft_approvedByUserId_approvedAt_idx"
ON "ConstructionSecretaryBroadcastDraft"("approvedByUserId", "approvedAt");

ALTER TABLE "ConstructionSecretaryBroadcastDraft"
ADD CONSTRAINT "ConstructionSecretaryBroadcastDraft_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

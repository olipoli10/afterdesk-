-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'VA', 'ADMIN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('submitted', 'pricing_review', 'quoted', 'awaiting_payment', 'declined', 'open', 'claimed', 'submitted_for_qc', 'qc_rejected', 'revision_requested', 'completed', 'disputed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "TaskTier" AS ENUM ('standard', 'high_value');

-- CreateEnum
CREATE TYPE "VaStatus" AS ENUM ('pending_test', 'pending_grading', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('input', 'deliverable');

-- CreateEnum
CREATE TYPE "QcStatus" AS ENUM ('pending', 'approved', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('pending_grading', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('va_payout', 'client_payment');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'wire', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'received', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('owed', 'released', 'paid', 'void', 'failed');

-- CreateEnum
CREATE TYPE "DisputeOutcome" AS ENUM ('pending', 'rejected', 'rework', 'upheld');

-- CreateEnum
CREATE TYPE "MoneyIntentKind" AS ENUM ('refund_client', 'release_payout', 'void_payout');

-- CreateEnum
CREATE TYPE "MoneyIntentStatus" AS ENUM ('queued', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('sale', 'refund', 'payout', 'fee', 'chargeback', 'chargeback_reversal', 'correction');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "VaStatus" NOT NULL DEFAULT 'pending_test',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "rejectedAt" TIMESTAMP(3),
    "cooldownOverride" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksAbandoned" INTEGER NOT NULL DEFAULT 0,
    "deadlinesMissed" INTEGER NOT NULL DEFAULT 0,
    "qcRejections" INTEGER NOT NULL DEFAULT 0,
    "scoreCache" DOUBLE PRECISION,
    "ratedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" TEXT,
    "tier" "TaskTier" NOT NULL DEFAULT 'standard',
    "status" "TaskStatus" NOT NULL DEFAULT 'submitted',
    "categoryId" TEXT,
    "estimatedMinutes" INTEGER,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "clientPriceCents" INTEGER,
    "vaPayoutCents" INTEGER,
    "aiLowCents" INTEGER,
    "aiHighCents" INTEGER,
    "aiReasoning" TEXT,
    "clientDeadlineUtc" TIMESTAMP(3),
    "vaDeadlineUtc" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3),
    "quoteExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revisionWindowEndsAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "expiredAt" TIMESTAMP(3),
    "paymentDueAt" TIMESTAMP(3),
    "firstCompletedAt" TIMESTAMP(3),
    "windowPausedAt" TIMESTAMP(3),
    "revisionRounds" INTEGER NOT NULL DEFAULT 0,
    "qcRounds" INTEGER NOT NULL DEFAULT 0,
    "filesVerified" BOOLEAN NOT NULL DEFAULT false,
    "filesPurgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "disputeCriteria" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "note" TEXT,
    "qcStatus" "QcStatus" NOT NULL DEFAULT 'pending',
    "qcComment" TEXT,
    "rating" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "submissionId" TEXT,
    "kind" "FileKind" NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAccessLog" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" "TaskStatus",
    "toStatus" "TaskStatus",
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestQuestion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSubmission" (
    "id" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "testVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'pending_grading',
    "adminComment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "TestSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "taskId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "taskId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT,
    "providerRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "provider" TEXT,
    "providerRef" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PayoutStatus" NOT NULL DEFAULT 'owed',
    "releasedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyIntent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "MoneyIntentKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "status" "MoneyIntentStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonDetail" TEXT NOT NULL,
    "adminSummaryForWorker" TEXT,
    "outcome" "DisputeOutcome" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "categoryId" TEXT,
    "categorySlug" TEXT,
    "categoryName" TEXT,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "correctsEntryId" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "publiclyVisible" BOOLEAN NOT NULL DEFAULT true,
    "prevHash" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dimension" TEXT,
    "unit" TEXT NOT NULL,
    "valueNumeric" DOUBLE PRECISION NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "currency" TEXT,
    "definitionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "VaProfile_userId_key" ON "VaProfile"("userId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_claimedById_idx" ON "Task"("claimedById");

-- CreateIndex
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCategory_slug_key" ON "TaskCategory"("slug");

-- CreateIndex
CREATE INDEX "Submission_qcStatus_idx" ON "Submission"("qcStatus");

-- CreateIndex
CREATE INDEX "Submission_vaId_idx" ON "Submission"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_taskId_attemptNo_key" ON "Submission"("taskId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");

-- CreateIndex
CREATE INDEX "File_taskId_idx" ON "File"("taskId");

-- CreateIndex
CREATE INDEX "File_uploaderId_idx" ON "File"("uploaderId");

-- CreateIndex
CREATE INDEX "FileAccessLog_fileId_idx" ON "FileAccessLog"("fileId");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "TestSubmission_status_idx" ON "TestSubmission"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_counterpartyId_idx" ON "PaymentEvent"("counterpartyId");

-- CreateIndex
CREATE INDEX "Payment_taskId_idx" ON "Payment"("taskId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_provider_providerRef_key" ON "Refund"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "Payout_vaId_status_idx" ON "Payout"("vaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_taskId_vaId_key" ON "Payout"("taskId", "vaId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyIntent_idempotencyKey_key" ON "MoneyIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MoneyIntent_status_createdAt_idx" ON "MoneyIntent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_taskId_idx" ON "Dispute"("taskId");

-- CreateIndex
CREATE INDEX "Dispute_outcome_idx" ON "Dispute"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_seq_key" ON "LedgerEntry"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_rowHash_key" ON "LedgerEntry"("rowHash");

-- CreateIndex
CREATE INDEX "LedgerEntry_occurredAt_idx" ON "LedgerEntry"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_sourceKind_sourceId_key" ON "LedgerEntry"("sourceKind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_prevHash_key" ON "LedgerEntry"("prevHash");

-- CreateIndex
CREATE INDEX "MetricSnapshot_key_windowEnd_idx" ON "MetricSnapshot"("key", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_key_dimension_windowEnd_key" ON "MetricSnapshot"("key", "dimension", "windowEnd");

-- CreateIndex
CREATE INDEX "AdminEvent_entity_entityId_idx" ON "AdminEvent"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AdminEvent_actorId_createdAt_idx" ON "AdminEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaProfile" ADD CONSTRAINT "VaProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAccessLog" ADD CONSTRAINT "FileAccessLog_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSubmission" ADD CONSTRAINT "TestSubmission_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyIntent" ADD CONSTRAINT "MoneyIntent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;


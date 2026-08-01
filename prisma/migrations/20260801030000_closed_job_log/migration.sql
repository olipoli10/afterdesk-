-- CreateEnum
CREATE TYPE "ClosedJobOutcome" AS ENUM ('won', 'lost');

-- CreateEnum
CREATE TYPE "LostReasonCategory" AS ENUM ('price_declined', 'deadline_at_risk', 'worker_unavailable', 'client_cancelled_no_reason', 'qc_failed_repeatedly', 'expired', 'other');

-- CreateTable
CREATE TABLE "ClosedJobLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "outcome" "ClosedJobOutcome" NOT NULL,
    "marginCents" INTEGER,
    "lostReasonCategory" "LostReasonCategory",
    "lostReasonDetail" TEXT,
    "revisionRequestedBeforeClose" BOOLEAN NOT NULL DEFAULT false,
    "qcRoundsAtClose" INTEGER NOT NULL DEFAULT 0,
    "finalRating" INTEGER,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosedJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClosedJobLog_taskId_key" ON "ClosedJobLog"("taskId");

-- CreateIndex
CREATE INDEX "ClosedJobLog_outcome_idx" ON "ClosedJobLog"("outcome");

-- CreateIndex
CREATE INDEX "ClosedJobLog_lostReasonCategory_idx" ON "ClosedJobLog"("lostReasonCategory");

-- AddForeignKey
ALTER TABLE "ClosedJobLog" ADD CONSTRAINT "ClosedJobLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


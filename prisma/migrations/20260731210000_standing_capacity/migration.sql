-- CreateEnum
CREATE TYPE "StandingCapacityStatus" AS ENUM ('active', 'paused', 'cancelled');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "standingCapacityAccountId" TEXT;

-- CreateTable
CREATE TABLE "StandingCapacityAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "StandingCapacityStatus" NOT NULL DEFAULT 'active',
    "tierHours" INTEGER NOT NULL,
    "weeklyClientPriceCents" INTEGER NOT NULL,
    "weeklyVaPayoutCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "minutesUsedThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingCapacityAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingCapacityAssignment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),

    CONSTRAINT "StandingCapacityAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountPreference" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "communicationStyle" TEXT,
    "deliverableFormat" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountContextNote" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountContextNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingCapacityPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL DEFAULT 'wire',
    "reference" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingCapacityPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingCapacityPayout" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT,
    "reference" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingCapacityPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StandingCapacityAccount_clientId_key" ON "StandingCapacityAccount"("clientId");

-- CreateIndex
CREATE INDEX "StandingCapacityAccount_status_idx" ON "StandingCapacityAccount"("status");

-- CreateIndex
CREATE INDEX "StandingCapacityAssignment_accountId_activeTo_idx" ON "StandingCapacityAssignment"("accountId", "activeTo");

-- CreateIndex
CREATE INDEX "StandingCapacityAssignment_workerId_activeTo_idx" ON "StandingCapacityAssignment"("workerId", "activeTo");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPreference_accountId_key" ON "AccountPreference"("accountId");

-- CreateIndex
CREATE INDEX "AccountContextNote_accountId_visible_createdAt_idx" ON "AccountContextNote"("accountId", "visible", "createdAt");

-- CreateIndex
CREATE INDEX "StandingCapacityPayment_accountId_periodStart_idx" ON "StandingCapacityPayment"("accountId", "periodStart");

-- CreateIndex
CREATE INDEX "StandingCapacityPayout_vaId_idx" ON "StandingCapacityPayout"("vaId");

-- CreateIndex
CREATE UNIQUE INDEX "StandingCapacityPayout_accountId_vaId_periodStart_key" ON "StandingCapacityPayout"("accountId", "vaId", "periodStart");

-- CreateIndex
CREATE INDEX "Task_standingCapacityAccountId_idx" ON "Task"("standingCapacityAccountId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_standingCapacityAccountId_fkey" FOREIGN KEY ("standingCapacityAccountId") REFERENCES "StandingCapacityAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingCapacityAccount" ADD CONSTRAINT "StandingCapacityAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingCapacityAssignment" ADD CONSTRAINT "StandingCapacityAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StandingCapacityAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingCapacityAssignment" ADD CONSTRAINT "StandingCapacityAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPreference" ADD CONSTRAINT "AccountPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StandingCapacityAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountContextNote" ADD CONSTRAINT "AccountContextNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StandingCapacityAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountContextNote" ADD CONSTRAINT "AccountContextNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingCapacityPayment" ADD CONSTRAINT "StandingCapacityPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StandingCapacityAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingCapacityPayout" ADD CONSTRAINT "StandingCapacityPayout_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StandingCapacityAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingCapacityPayout" ADD CONSTRAINT "StandingCapacityPayout_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "AssistantCategory" AS ENUM ('file_format', 'dedup_technique', 'deliverable_structure', 'research_method', 'writing_method', 'other');

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "category" "AssistantCategory",
    "clusterKey" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantPattern" (
    "clusterKey" TEXT NOT NULL,
    "category" "AssistantCategory",
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantPattern_pkey" PRIMARY KEY ("clusterKey")
);

-- CreateIndex
CREATE INDEX "AssistantMessage_vaId_createdAt_idx" ON "AssistantMessage"("vaId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_taskId_idx" ON "AssistantMessage"("taskId");

-- CreateIndex
CREATE INDEX "AssistantMessage_clusterKey_idx" ON "AssistantMessage"("clusterKey");

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


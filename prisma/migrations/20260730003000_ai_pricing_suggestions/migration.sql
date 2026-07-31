-- Pricing-reference embeddings need pgvector. Confirmed working on both
-- managed Postgres and the local PGlite dev server (0.8.1) before this
-- migration was written.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AiConfidence" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "aiSuggestedPriceCents" INTEGER,
  ADD COLUMN "aiSuggestedVaPayoutCents" INTEGER,
  ADD COLUMN "aiConfidence" "AiConfidence",
  ADD COLUMN "aiEstimatedMinutes" INTEGER,
  ADD COLUMN "aiSuggestedCategorySlug" TEXT,
  ADD COLUMN "aiComputedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TaskEmbedding" (
  "taskId" TEXT NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskEmbedding_pkey" PRIMARY KEY ("taskId")
);

-- AddForeignKey
ALTER TABLE "TaskEmbedding"
  ADD CONSTRAINT "TaskEmbedding_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Nearest-neighbor retrieval for pricing (src/lib/pricing-ai.ts) always
-- orders by cosine distance against a small, growing table — HNSW keeps
-- that query sub-linear as history grows instead of a full scan forever.
CREATE INDEX "TaskEmbedding_embedding_hnsw_idx"
  ON "TaskEmbedding" USING hnsw ("embedding" vector_cosine_ops);

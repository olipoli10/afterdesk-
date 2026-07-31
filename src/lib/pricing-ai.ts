import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { embed, embeddingsEnabled, toVectorLiteral } from "@/lib/embeddings";
import { aiEnabled } from "@/lib/ai";

/**
 * The pricing suggestion engine. Computes ONE thing — a proposal for the
 * admin to review — and never touches clientPriceCents/vaPayoutCents
 * directly; only approvePricing (src/server/actions/admin.ts) does that,
 * and only after a human clicks Approve/Adjust. See computeAiPricingSuggestion
 * for the full RULE 3 statement.
 */

const MAX_TOKENS = 8000;

/** How many nearest-neighbor reference tasks to show the model. Bounded so
 *  the prompt stays cheap and fast regardless of how large history gets —
 *  the vector search already did the hard work of picking the closest
 *  ones, so a small K here loses nothing a bigger K would have added. */
const REFERENCE_TASK_LIMIT = 12;

type ReferenceTask = {
  title: string;
  description: string;
  category_name: string | null;
  client_price_usd: number;
  va_payout_usd: number;
  estimated_minutes: number | null;
};

type ModelOutput = {
  suggested_price: number;
  price_range_low: number;
  price_range_high: number;
  reasoning: string;
  confidence_level: "high" | "medium" | "low";
  estimated_worker_time_minutes: number | null;
  suggested_va_payout: number;
  suggested_category_slug: string | null;
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    suggested_price: { type: "number" },
    price_range_low: { type: "number" },
    price_range_high: { type: "number" },
    reasoning: { type: "string" },
    confidence_level: { type: "string", enum: ["high", "medium", "low"] },
    estimated_worker_time_minutes: { type: ["number", "null"] },
    suggested_va_payout: { type: "number" },
    suggested_category_slug: { type: ["string", "null"] },
  },
  required: [
    "suggested_price",
    "price_range_low",
    "price_range_high",
    "reasoning",
    "confidence_level",
    "estimated_worker_time_minutes",
    "suggested_va_payout",
    "suggested_category_slug",
  ],
  additionalProperties: false,
} as const;

const FIXED_RULES = `
You are pricing for AfterDesk, a marketplace where a human operator reviews and approves every price before a client ever sees it — you are proposing a number, not setting one.

REASONING METHOD, IN ORDER:
1. Look at REFERENCE_TASKS below (already-approved similar tasks: title, description, category, final client price, final VA payout, estimated minutes). Find the ones that actually resemble this task in scope and volume — not just shared keywords.
2. If you found close matches, anchor suggested_price on their prices, adjusted for this task's actual volume/complexity difference. Say which ones you used and how you adjusted, in reasoning.
3. If you found NO close matches, say so explicitly in reasoning and price from first principles using the category reference notes and general judgment — and set confidence_level to "low" regardless of how sound your reasoning feels. Confidence measures PRECEDENT, not plausibility.
4. suggested_price (client) and suggested_va_payout (worker) are computed SEPARATELY. Never derive one from the other with a fixed formula (e.g. "payout = 30% of price") — price the client side on value/market rate, price the payout on fair compensation for the estimated work, independently.

CONFIDENCE RUBRIC:
- high: 3+ closely comparable reference tasks, consistent pricing among them
- medium: 1-2 comparable references, or several loose ones
- low: no meaningfully similar reference task exists

OUTPUT DISCIPLINE: suggested_price must be a single number, not a description of a range. price_range_low/price_range_high bound it. reasoning is 1-3 sentences, written for an admin to scan in a queue — name the specific reference tasks it leaned on when there are any. suggested_category_slug is your best guess at which listed category this task belongs to (or null if none fit) — the admin makes the final call, this is only a hint.`.trim();

function buildSystemPrompt(pricingPrompt: string): string {
  return `${pricingPrompt}\n\n${FIXED_RULES}`;
}

/**
 * THE HARD FLOOR, pulled out as its own pure function so it has its own
 * test (test/pricing-ai.test.ts) instead of living buried inside a
 * network-calling function no unit test can reach. Zero close precedent
 * means "low", full stop — never the model's own self-report alone. A
 * model can sound confident about a guess; this does not ask it whether
 * it should be. An invalid/missing model value also floors to "low" —
 * the safe direction to fail in, never "medium" or "high" by default.
 */
export function resolveConfidence(
  modelConfidence: unknown,
  referenceTaskCount: number
): "high" | "medium" | "low" {
  if (referenceTaskCount === 0) return "low";
  return modelConfidence === "high" || modelConfidence === "medium" || modelConfidence === "low"
    ? modelConfidence
    : "low";
}

function buildUserMessage(task: {
  title: string;
  description: string;
  quantity: string | null;
  clientDeadlineUtc: Date | null;
}, categories: { name: string; disputeCriteria: string | null }[], referenceTasks: ReferenceTask[]): string {
  const categoryLines = categories
    .map((c) => `- ${c.name}${c.disputeCriteria ? `: ${c.disputeCriteria}` : ""}`)
    .join("\n");
  return `NEW TASK
Title: ${task.title}
Description: ${task.description}
Quantity/volume: ${task.quantity || "not specified"}
Client deadline: ${task.clientDeadlineUtc ? task.clientDeadlineUtc.toISOString() : "not specified"}

ACTIVE CATEGORIES (name: what counts as delivered)
${categoryLines || "none configured"}

REFERENCE_TASKS (${referenceTasks.length} most similar already-approved tasks, closest first)
${JSON.stringify(referenceTasks, null, 2)}`;
}

/**
 * Nearest neighbors among tasks that have actually been priced — a task
 * without clientPriceCents/vaPayoutCents is not a real precedent yet, no
 * matter how similar its embedding is. Excludes the task being priced
 * itself (it may already have a row here if this is a recompute).
 */
async function findSimilarPricedTasks(
  taskId: string,
  vector: number[]
): Promise<ReferenceTask[]> {
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<
    {
      title: string;
      description: string;
      categoryName: string | null;
      clientPriceCents: number;
      vaPayoutCents: number;
      estimatedMinutes: number | null;
    }[]
  >`
    SELECT t."title", t."description", tc."name" as "categoryName",
           t."clientPriceCents", t."vaPayoutCents", t."estimatedMinutes"
    FROM "TaskEmbedding" te
    JOIN "Task" t ON t."id" = te."taskId"
    LEFT JOIN "TaskCategory" tc ON tc."id" = t."categoryId"
    WHERE te."taskId" != ${taskId}
      AND t."clientPriceCents" IS NOT NULL
      AND t."vaPayoutCents" IS NOT NULL
    ORDER BY te."embedding" <=> ${literal}::vector
    LIMIT ${REFERENCE_TASK_LIMIT}
  `;
  return rows.map((r) => ({
    title: r.title,
    description: r.description,
    category_name: r.categoryName,
    client_price_usd: Math.round(r.clientPriceCents / 100),
    va_payout_usd: Math.round(r.vaPayoutCents / 100),
    estimated_minutes: r.estimatedMinutes,
  }));
}

async function upsertEmbedding(taskId: string, vector: number[]): Promise<void> {
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    INSERT INTO "TaskEmbedding" ("taskId", "embedding")
    VALUES (${taskId}, ${literal}::vector)
    ON CONFLICT ("taskId") DO UPDATE SET "embedding" = EXCLUDED."embedding"
  `;
}

/**
 * Runs once, when a task is submitted (src/server/actions/client-tasks.ts) —
 * never lazily when the admin opens the pricing screen. The queue has to
 * sort by confidence before any admin has looked at a task, so the
 * suggestion must already exist by the time it's listed.
 *
 * RULE 3, restated for this feature specifically: this function only ever
 * writes to the aiXxx columns on Task. It has no path to clientPriceCents,
 * vaPayoutCents, or quotedAt — those are set exclusively by approvePricing
 * after a human clicks Approve or Adjust-and-approve. A suggestion sitting
 * unreviewed changes nothing a client or worker can see.
 *
 * Never throws in a way that blocks submission: if AI pricing is
 * unconfigured (no ANTHROPIC_API_KEY/VOYAGE_API_KEY) or the call fails for
 * any reason, the task simply enters the queue with no suggestion —
 * exactly today's behavior — and aiComputedAt stays null so the queue UI
 * can tell "not computed" apart from "computed, nothing found".
 */
export async function computeAiPricingSuggestion(taskId: string): Promise<void> {
  if (!aiEnabled || !embeddingsEnabled) return;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, description: true, quantity: true, clientDeadlineUtc: true },
    });
    if (!task) return;

    const settings = await getSettings();
    const [vector, categories] = await Promise.all([
      embed(`${task.title}\n\n${task.description}`, "query"),
      prisma.taskCategory.findMany({
        where: { active: true },
        select: { slug: true, name: true, disputeCriteria: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    // Stored BEFORE the model call: even if the Anthropic request fails,
    // this task's embedding is on record — the moment it's later approved,
    // it is immediately usable as a reference for the NEXT task, with no
    // backfill step needed.
    await upsertEmbedding(taskId, vector);

    const referenceTasks = await findSimilarPricedTasks(taskId, vector);

    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: settings.pricingModel,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system: [
        { type: "text", text: buildSystemPrompt(settings.pricingPrompt), cache_control: { type: "ephemeral" } },
      ],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        { role: "user", content: buildUserMessage(task, categories, referenceTasks) },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return;

    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) return;

    let parsed: Partial<ModelOutput>;
    try {
      parsed = JSON.parse(text) as Partial<ModelOutput>;
    } catch {
      return;
    }

    const confidence = resolveConfidence(parsed.confidence_level, referenceTasks.length);

    const toInt = (n: unknown): number | null =>
      typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        aiSuggestedPriceCents: toInt(parsed.suggested_price) !== null ? toInt(parsed.suggested_price)! * 100 : null,
        aiLowCents: toInt(parsed.price_range_low) !== null ? toInt(parsed.price_range_low)! * 100 : null,
        aiHighCents: toInt(parsed.price_range_high) !== null ? toInt(parsed.price_range_high)! * 100 : null,
        aiReasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 2000) : null,
        aiConfidence: confidence,
        aiEstimatedMinutes: toInt(parsed.estimated_worker_time_minutes),
        aiSuggestedVaPayoutCents:
          toInt(parsed.suggested_va_payout) !== null ? toInt(parsed.suggested_va_payout)! * 100 : null,
        aiSuggestedCategorySlug:
          typeof parsed.suggested_category_slug === "string" ? parsed.suggested_category_slug : null,
        aiComputedAt: new Date(),
      },
    });
  } catch (error) {
    // Logged, never rethrown — see the function comment: a pricing
    // suggestion failure must never be a task-submission failure.
    console.error("[pricing-ai] suggestion computation failed", { taskId, error });
  }
}

import { requireRole } from "@/lib/authz";
import { assistantPatterns, assistantCostSummary } from "@/lib/queries/assistant";
import { estimateCostUsd } from "@/lib/assistant-cost";
import { LocalTime } from "@/components/local-time";
import { AssistantPatternToggle } from "@/components/assistant-pattern-toggle";
import { Card, CardBody, EmptyState, PageTitle, Badge } from "@/components/ui";

export const metadata = {
  title: "Assistant",
  robots: { index: false, follow: false },
};

const CATEGORY_LABEL: Record<string, string> = {
  file_format: "File format",
  dedup_technique: "Dedup technique",
  deliverable_structure: "Deliverable structure",
  research_method: "Research method",
  writing_method: "Writing method",
  other: "Other",
};

export default async function AdminAssistantPage() {
  await requireRole("ADMIN");
  const [patterns, cost] = await Promise.all([assistantPatterns(), assistantCostSummary()]);

  const unresolved = patterns.filter((p) => !p.resolvedAt);
  const estCostToDate = estimateCostUsd({
    inputTokens: cost.totalInputTokens,
    outputTokens: cost.totalOutputTokens,
    cacheReadTokens: cost.totalCacheReadTokens,
  });

  const tiles = [
    { label: "Questions today", value: cost.callsToday },
    { label: "Questions this week", value: cost.callsThisWeek },
    { label: "Patterns unresolved", value: unresolved.length },
    { label: "Est. cost to date", value: `$${estCostToDate.toFixed(2)}` },
  ];

  return (
    <>
      <PageTitle
        title="Assistant"
        sub="Worker questions to the AI assistant, grouped by pattern — most frequent first. A repeated pattern is the strongest signal of a real documentation gap."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardBody className="!p-4">
              <p className="font-mono text-2xl font-medium tabular-nums tracking-tight text-[#14161A]">
                {t.value}
              </p>
              <p className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                {t.label}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        {patterns.length === 0 ? (
          <EmptyState
            title="No questions yet"
            body="Once workers start using the assistant on active tasks, repeated questions will group here."
          />
        ) : (
          <Card>
            <div className="divide-y divide-[#14161A]/[0.06]">
              {patterns.map((p) => (
                <div key={p.clusterKey} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#14161A]">
                      <span className="font-mono tabular-nums text-[#5B6069]">{p.count}×</span>{" "}
                      {p.exampleQuestion}
                    </p>
                    <p className="mt-0.5 text-xs text-[#5B6069]">
                      {p.category ? CATEGORY_LABEL[p.category] ?? p.category : "Uncategorized"} · last asked{" "}
                      <LocalTime iso={p.lastSeenAt} dateStyle="short" />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {p.resolvedAt ? (
                      <Badge className="border-[#166049]/30 bg-[#166049]/10 text-[#166049]">Resolved</Badge>
                    ) : null}
                    <AssistantPatternToggle clusterKey={p.clusterKey} resolved={Boolean(p.resolvedAt)} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

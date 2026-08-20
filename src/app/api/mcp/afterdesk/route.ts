import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/authz";
import {
  handleAfterDeskMcpRequest,
  type AfterDeskProjectStats,
  type McpRequest,
} from "@/server/afterdesk-core-gateway";
import { runAfterDeskCorePlan } from "@/server/afterdesk-core-ai";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;
const MCP_RATE = { window: 60, max: 60 } as const;

function hasValidBearer(value: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!value?.startsWith(prefix)) return false;
  const supplied = Buffer.from(value.slice(prefix.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function loadStats(): Promise<AfterDeskProjectStats> {
  const [taskCount, taskGroups, workflowRunCount, aiOperationCount] = await Promise.all([
    prisma.task.count(),
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.taskWorkflowRun.count(),
    prisma.aiOperation.count(),
  ]);

  return {
    taskCount,
    tasksByStatus: Object.fromEntries(taskGroups.map((row) => [row.status, row._count._all])),
    workflowRunCount,
    aiOperationCount,
  };
}

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

export async function POST(request: Request) {
  const token = process.env.AFTERDESK_MCP_TOKEN;
  // Never expose an accidentally unauthenticated internal gateway, including
  // in development. A missing token is a deployment/configuration error.
  if (!token) return NextResponse.json({ error: "Gateway unavailable." }, { status: 503 });
  if (!hasValidBearer(request.headers.get("authorization"), token)) return unauthorized();

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    return NextResponse.json({ error: "Request body too large." }, { status: 413 });
  }

  const rateKey = `mcp:afterdesk:${createHash("sha256").update(token).digest("hex")}`;
  if (!(await consumeRateLimit(rateKey, MCP_RATE))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    // Read the bytes ourselves instead of relying only on Content-Length:
    // chunked requests can omit that header and must still be bounded before
    // JSON parsing allocates memory.
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } }, { status: 400 });
  }

  const response = await handleAfterDeskMcpRequest(body as McpRequest, {
    loadStats,
    runPlan: (goal, context) => runAfterDeskCorePlan({ goal, context }),
  });
  if (!response) return new Response(null, { status: 202 });
  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

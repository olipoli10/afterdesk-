import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ member: vi.fn(), account: vi.fn(), existing: vi.fn(), review: vi.fn(), approval: vi.fn(), query: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { constructionWorkspaceMember: { findFirst: m.member }, constructionConnectorAccount: { findUniqueOrThrow: m.account },
  personalAssistantOperation: { findUnique: m.existing, create: m.create, updateMany: m.update }, personalSmsCorrelatedCalendarReview: { findUnique: m.review },
  personalSmsCorrelatedCalendarApproval: { findUnique: m.approval }, $queryRawUnsafe: m.query } }));
import { preparePersonalCalendar, personalCalendarActions, claimPersonalCalendarWriteInTransaction } from "@/server/personal-assistant/calendar-actions";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma-client";
const draft = { title: "Synthetic only", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T19:00:00.000Z", timezone: "America/Toronto" };
const input = { userId: "owner", workspaceId: "workspace", requestId: "10000000-0000-4000-8000-000000000001", draft };
const request = { ...draft, accountVersion: 1, requestId: input.requestId }, requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic", ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic", GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-01-01T00:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); m.member.mockResolvedValue({ id: "member" }); m.account.mockResolvedValue({ id: "calendar", stateVersion: 1, status: "connected", revokedAt: null, grantedScopes: ["https://www.googleapis.com/auth/calendar.events"] });
  m.existing.mockResolvedValue({ id: "operation", workspaceId: "workspace", createdByUserId: "owner", kind: "calendar_write", request, requestHash, status: "pending", correlatedTemporalReceiptId: null });
  m.review.mockResolvedValue(null); m.approval.mockResolvedValue(null); m.query.mockResolvedValue([]); });
describe("C2c explicit global approval exclusion — mocked consistency faults", () => {
  it("refuses approval-only foreign global row even when marker and reverse review are absent", async () => { m.approval.mockResolvedValue({ id: "foreign" });
    await expect(preparePersonalCalendar(input)).rejects.toThrow("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE"); expect(m.approval).toHaveBeenCalledWith({ where: { calendarOperationId: "operation" }, select: { id: true } }); expect(m.create).not.toHaveBeenCalled(); });
  it("preserves the ordinary exact replay when every correlated indicator is absent", async () => { expect(await preparePersonalCalendar(input)).toEqual({ operationId: "operation", requestHash, status: "pending" }); expect(m.create).not.toHaveBeenCalled(); });
  it("list excludes approval globally before LIMIT with no actor condition in the exclusion", async () => { expect(await personalCalendarActions("owner", "workspace")).toEqual({ operations: [] }); const sql = m.query.mock.calls[0][0] as string;
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" approved WHERE approved."calendarOperationId"=o.id)'); expect(sql.indexOf('"PersonalSmsCorrelatedCalendarApproval"')).toBeLessThan(sql.indexOf("LIMIT 30")); });
  it("legacy claim excludes global approval before any mutation", async () => { await expect(claimPersonalCalendarWriteInTransaction(prisma as unknown as Prisma.TransactionClient, { userId: "owner", workspaceId: "workspace", operationId: "operation", expectedRequestHash: requestHash }, env)).rejects.toThrow("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED");
    expect(m.query.mock.calls[0][0]).toContain('NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" approved WHERE approved."calendarOperationId"=o.id)'); expect(m.update).not.toHaveBeenCalled(); });
});

import { timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import type { TaskTier } from "@prisma/client";

export const runtime = "nodejs";

/**
 * ONE-TIME operator tool, not a product feature: fills the pool with 20
 * realistic-looking demo tasks so a fresh worker account sees a populated
 * "Available work" board instead of an empty one. Owned by a dedicated
 * showcase client (demo.showcase@afterdesk.co) so real client data is never
 * touched, and re-running replaces rather than doubles the set. Meant to be
 * deleted from the codebase once run — see prisma/seed-demo-showcase.ts for
 * the sibling script this mirrors for local/dev use.
 */

const SHOWCASE_CLIENT_EMAIL = "demo.showcase@afterdesk.co";

type Row = {
  slug: string;
  title: string;
  description: string;
  quantity: string | null;
  payout: number;
  dueInDays: number | null;
  tier?: TaskTier;
};

const ROWS: Row[] = [
  { slug: "document-production", title: "Design a 6-slide Instagram carousel for a product launch", description: "Brand kit and product photos attached. Six slides: hook, three feature slides, social proof, CTA. Match the brand kit's fonts and palette exactly — this posts as-is, no revisions round after delivery.", quantity: "6 slides", payout: 3200, dueInDays: 2 },
  { slug: "document-production", title: "Build 15 Instagram Story templates in Canva", description: "Reusable templates for weekly promos: countdown, quote, before/after, poll. Brand kit attached. Deliver as an editable Canva template link plus PNG exports.", quantity: "15 templates", payout: 4100, dueInDays: 3 },
  { slug: "document-production", title: "Resize one campaign design into 8 ad platform formats", description: "Source design attached. Need Instagram feed, Instagram story, Facebook feed, LinkedIn, and 4 Google display sizes. Keep the layout legible at each size — this isn't a stretch job.", quantity: "8 sizes", payout: 2600, dueInDays: 1 },
  { slug: "document-production", title: "Design a one-page rate card for a photography studio", description: "Copy and pricing tiers attached. Clean, print-ready, matches the studio's existing logo and two brand colors. Deliver as PDF and editable source.", quantity: null, payout: 2100, dueInDays: 3 },
  { slug: "writing", title: "Write 30 Instagram captions from a content calendar", description: "Topics and post type listed in the calendar. Brand voice guide attached — casual, no corporate language, one emoji max per caption. Include 5 relevant hashtags per post.", quantity: "30 captions", payout: 3600, dueInDays: 4 },
  { slug: "writing", title: "Draft a week of LinkedIn posts for a B2B founder", description: "Five posts, topics given. First-person voice, no buzzwords, one clear point per post. 150 words max each.", quantity: "5 posts", payout: 2400, dueInDays: 3 },
  { slug: "writing", title: "Write product captions for 20 Etsy listings", description: "Photos and specs attached per item. Warm, specific, no filler adjectives — buyers should know exactly what they're getting.", quantity: "20 listings", payout: 2900, dueInDays: 4 },
  { slug: "admin-coordination", title: "Build and schedule a month of social posts in Buffer", description: "Content and captions already written (attached). Schedule across Instagram and Facebook at the posting times in the brief, spaced per the calendar.", quantity: "22 posts", payout: 2000, dueInDays: 5 },
  { slug: "admin-coordination", title: "Set up a content calendar template in Notion", description: "Fields needed are listed in the brief: platform, status, draft link, publish date, owner. Populate the first month from the attached spreadsheet.", quantity: null, payout: 1700, dueInDays: 3 },
  { slug: "list-building", title: "Find 100 micro-influencers in the home fitness niche", description: "10k–50k followers, active in the last month, US or Canada based. Need handle, follower count, engagement rate estimate, and a public contact method.", quantity: "100 profiles", payout: 4800, dueInDays: 5 },
  { slug: "list-building", title: "Build a list of 60 local coffee shops for a wholesale pitch", description: "Toronto and surrounding area, independent (not chains). Need name, address, a general contact email, and whether they currently list a house-blend supplier.", quantity: "60 shops", payout: 2300, dueInDays: 4 },
  { slug: "research", title: "Compare hashtag performance across 4 competitor accounts", description: "Four named Instagram accounts. Pull their 20 most-used hashtags over the last month and rough engagement per hashtag where visible. One summary sheet.", quantity: "4 accounts", payout: 3100, dueInDays: 3 },
  { slug: "research", title: "Research trending audio for short-form video this month", description: "Platform is Instagram Reels + TikTok. Need 15 currently-trending sounds relevant to a home-decor brand, with a link and rough usage-volume signal for each.", quantity: "15 sounds", payout: 2200, dueInDays: 2 },
  { slug: "data-entry", title: "Log 200 influencer outreach replies into the tracker sheet", description: "Screenshots of DMs and emails attached. Per reply: contact name, interested / not interested / no response yet, and a one-line note. Template columns given.", quantity: "200 replies", payout: 2700, dueInDays: 4 },
  { slug: "data-entry", title: "Enter 90 giveaway entries into the spreadsheet", description: "Entries came in as Instagram comments (screenshots attached). Handle, entry method, and eligibility check against the three rules listed.", quantity: "90 entries", payout: 1900, dueInDays: 2 },
  { slug: "data-cleanup", title: "Deduplicate a 1,500-follower email opt-in list", description: "Exported from three different landing pages, heavy overlap. Merge on email, keep the earliest opt-in date, remove anything that bounced per the attached bounce report.", quantity: "1,500 rows", payout: 2500, dueInDays: 3 },
  { slug: "analysis", title: "Summarize a quarter of Instagram Insights into one report", description: "Screenshots/export attached. Reach, engagement rate, follower growth, and top 5 posts by save rate. One page, charts over prose.", quantity: null, payout: 3300, dueInDays: 4 },
  { slug: "analysis", title: "Break down ad spend vs. conversions across 3 campaigns", description: "Platform exports attached (Meta Ads). Cost per result and ROAS per campaign, plus a one-line note on which is worth scaling.", quantity: "3 campaigns", payout: 3800, dueInDays: 3 },
  { slug: "document-production", title: "Turn a podcast episode into a 10-tile quote carousel", description: "Transcript attached. Pull the 10 strongest standalone quotes, lay them into the brand's carousel template (attached), consistent type hierarchy throughout.", quantity: "10 tiles", payout: 2800, dueInDays: 2 },
  { slug: "writing", title: "Write email newsletter copy from a rough outline", description: "Bullet outline attached, one send. Friendly, concise, one clear CTA button. Subject line + 3 alt subject lines for A/B testing.", quantity: null, payout: 2000, dueInDays: 2 },
];

function hasValidBearer(value: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!value?.startsWith(prefix)) return false;
  const supplied = Buffer.from(value.slice(prefix.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function ensureShowcaseClient(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: SHOWCASE_CLIENT_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const user = await prisma.user.create({
    data: {
      email: SHOWCASE_CLIENT_EMAIL,
      name: "AfterDesk Showcase",
      role: "CLIENT",
      emailVerified: true,
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(randomBytes(18).toString("base64url")),
    },
  });
  return user.id;
}

export async function POST(request: Request) {
  const secret = process.env.SEED_SHOWCASE_SECRET;
  if (!secret || !hasValidBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const clientId = await ensureShowcaseClient();

  const categories = await prisma.taskCategory.findMany({ select: { id: true, slug: true } });
  const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const missing = [...new Set(ROWS.map((r) => r.slug))].filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing categories: ${missing.join(", ")}` }, { status: 500 });
  }

  const cleared = await prisma.task.deleteMany({
    where: { clientId, status: "open", claimedById: null },
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (const row of ROWS) {
    await prisma.task.create({
      data: {
        clientId,
        title: row.title,
        description: row.description,
        quantity: row.quantity,
        status: "open",
        tier: row.tier ?? "standard",
        categoryId: bySlug.get(row.slug)!,
        vaPayoutCents: row.payout,
        clientPriceCents: Math.round(row.payout / 0.6),
        vaDeadlineUtc: row.dueInDays ? new Date(now + row.dueInDays * day) : null,
        quotedAt: new Date(now - 2 * day),
        acceptedAt: new Date(now - day),
      },
    });
  }

  return NextResponse.json({ cleared: cleared.count, created: ROWS.length });
}

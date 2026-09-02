import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  accountingAccountCommandSchema,
  approveAccountingDraftCommandSchema,
  prepareAccountingDraftCommandSchema,
} from "@/lib/construction-operating-assistant-r27/contracts";
import {
  accountingCockpitForUser,
  approveAccountingDraft,
  prepareAccountingDraft,
  processAccountingAccountCommand,
} from "@/server/construction-operating-assistant-r27/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const responseHeaders = {"Cache-Control":"private, no-store"} as const;

async function authenticate() {
  const user = await getSessionUser();
  if (!user) return {response:NextResponse.json({error:"Not signed in."},{status:401,headers:responseHeaders})} as const;
  if (user.role !== "CLIENT" || !user.emailVerified) return {response:NextResponse.json({error:"Not found."},{status:404,headers:responseHeaders})} as const;
  return {user} as const;
}

export async function GET(request: Request) {
  const authenticated = await authenticate();
  if ("response" in authenticated) return authenticated.response;
  if (!await consumeRateLimit(`construction-mobile-accounting-read:${authenticated.user.id}`,{window:60,max:60})) {
    return NextResponse.json({error:"Too many requests."},{status:429,headers:responseHeaders});
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) return NextResponse.json({error:"Invalid accounting query."},{status:400,headers:responseHeaders});
  try {
    return NextResponse.json(await accountingCockpitForUser({userId:authenticated.user.id,workspaceId}),{headers:responseHeaders});
  } catch {
    return NextResponse.json({error:"Not found."},{status:404,headers:responseHeaders});
  }
}

export async function POST(request: Request) {
  const authenticated = await authenticate();
  if ("response" in authenticated) return authenticated.response;
  if (!await consumeRateLimit(`construction-mobile-accounting-write:${authenticated.user.id}`,{window:60,max:20})) {
    return NextResponse.json({error:"Too many requests."},{status:429,headers:responseHeaders});
  }
  const body = await request.json().catch(()=>null);
  try {
    let result:unknown;
    if (accountingAccountCommandSchema.safeParse(body).success) {
      result = await processAccountingAccountCommand({userId:authenticated.user.id,command:body});
    } else if (prepareAccountingDraftCommandSchema.safeParse(body).success) {
      result = await prepareAccountingDraft({userId:authenticated.user.id,command:body});
    } else if (approveAccountingDraftCommandSchema.safeParse(body).success) {
      result = await approveAccountingDraft({userId:authenticated.user.id,command:body});
    } else {
      return NextResponse.json({error:"Invalid accounting command."},{status:400,headers:responseHeaders});
    }
    return NextResponse.json(result,{status:(result as {replayed?:boolean}).replayed?200:201,headers:responseHeaders});
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/CONFLICT|MISMATCH|ALREADY|STALE|NOT_ACTIVE|NOT_OPEN|CAPABILITY/u.test(code)) {
      return NextResponse.json({error:code},{status:409,headers:responseHeaders});
    }
    return NextResponse.json({error:"Not found."},{status:404,headers:responseHeaders});
  }
}

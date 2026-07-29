import { NextResponse, type NextRequest } from "next/server";

/**
 * One job: stamp the requested pathname onto the request so server components
 * can build the post-login deep link (`/login?next=…`) deterministically.
 * Next.js exposes no other reliable way to read the path on a cold load.
 * safeNextPath() in src/lib/authz.ts consumes and re-validates this header —
 * it never trusts it blindly.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/client/:path*", "/va/:path*", "/admin/:path*"],
};

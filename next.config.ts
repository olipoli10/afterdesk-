import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' stays because dropping it needs a per-request nonce
  // threaded through src/proxy.ts and the root layout (Next's own hydration
  // scripts must carry it too) — a bigger change than this header. It is not
  // this app's XSS defense: nothing renders untrusted input via
  // dangerouslySetInnerHTML (the only uses are static application/ld+json,
  // which browsers never execute as script), so React/JSX's default escaping
  // is what actually stops injected script here. CSP is defense-in-depth on
  // top of that, covering exfiltration/framing/mixed-content.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The mutating UIs (accept price, approve pricing, cancel) are a
          // single click behind a valid session — never allow framing.
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Only meaningful over HTTPS (prod); harmless on localhost.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // This app never needs these browser capabilities.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

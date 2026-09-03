import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import readiness from "../release/endvera-construction-v1/web-production-readiness.json";
import environment from "../release/endvera-construction-v1/environment-contract-v2.json";
import { validateWebProductionReadiness } from "../scripts/validate-endvera-web-readiness.mjs";
import { GET } from "../src/app/api/health/route";

describe("R36H public Web production preparation", () => {
  it("covers every public, legal, support, auth and health route with an existing file", () => {
    const report = validateWebProductionReadiness({ readiness, environment });
    expect(report.status).toBe("READY_FOR_DEPLOYMENT_AUTHORITY");
    expect(report.routesChecked).toBe(readiness.routes.length);
    for (const route of readiness.routes) {
      expect(path.isAbsolute(route.sourcePath)).toBe(false);
      expect(() => readFileSync(route.sourcePath)).not.toThrow();
    }
  });

  it("exposes only a minimal value-free liveness response", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "ENDVERA_WEB", status: "alive" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps environment configuration names-only and server secrets private", () => {
    expect(environment.artifactValuePolicy).toBe("NAMES_AND_REQUIREMENT_STATES_ONLY");
    expect(environment.secretValuesSerializable).toBe(false);
    expect(environment.variables.map((item) => item.name)).toEqual([
      "DATABASE_URL",
      "DIRECT_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "APP_URL",
      "NEXT_PUBLIC_SITE_URL",
      "EXPO_PUBLIC_ENDVERA_API_URL",
      "CRON_SECRET",
      "FILE_SCAN_MODE",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "CLOUDMERSIVE_API_KEY",
      "CLOUDMERSIVE_API_URL",
      "ANTHROPIC_API_KEY",
      "AI_MODEL",
      "VOYAGE_API_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET"
    ]);
    expect(JSON.stringify(environment)).not.toMatch(/postgres(?:ql)?:\/\/|sk_(?:live|test)_|BEGIN PRIVATE KEY/iu);
  });

  it("retains exact deployment and capability blockers without readiness inflation", () => {
    expect(readiness).toMatchObject({
      readiness: "READY_FOR_DEPLOYMENT_AUTHORITY",
      publicOriginSelected: false,
      deployed: false,
      published: false,
      providerObserved: false,
      externalEffectCount: 0,
    });
    expect(readiness.deploymentBlockers.map((item) => item.code)).toEqual([
      "PUBLIC_PRODUCTION_ORIGIN",
      "PRODUCTION_DATABASE",
      "AUTH_SECRET_CUSTODY",
      "OBJECT_STORAGE",
      "PRODUCTION_FILE_SCANNER",
      "DNS_AND_TLS",
    ]);
  });

  it("refuses missing routes, serialized values and inflated external claims", () => {
    expect(() => validateWebProductionReadiness({
      readiness: { ...readiness, deployed: true },
      environment,
    })).toThrow("WEB_READINESS_CLAIM_INFLATION_REFUSED");

    expect(() => validateWebProductionReadiness({
      readiness: {
        ...readiness,
        routes: readiness.routes.map((route, index) => index === 0 ? { ...route, sourcePath: "src/app/missing/page.tsx" } : route),
      },
      environment,
    })).toThrow("WEB_READINESS_ROUTE_MISSING");

    expect(() => validateWebProductionReadiness({
      readiness,
      environment: { ...environment, values: { BETTER_AUTH_SECRET: "forbidden" } },
    })).toThrow("WEB_READINESS_VALUE_MATERIAL_REFUSED");
  });

  it("uses installed Next.js production boundaries and no deployment command", () => {
    const source = readFileSync("scripts/validate-endvera-web-readiness.mjs", "utf8");
    expect(source).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync/iu);
    expect(source).not.toMatch(/vercel\s+(?:deploy|--prod)|eas\s+(?:build|submit)|https?:\/\//iu);
    const nextConfig = readFileSync("next.config.ts", "utf8");
    expect(nextConfig).toContain('poweredByHeader: false');
    expect(nextConfig).toContain('X-Content-Type-Options');
    expect(nextConfig).toContain('frame-ancestors \'none\'');
  });
});

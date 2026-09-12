import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { assertPersonalModelIngressWindow, inspectPersonalModelIngressConfiguration } from "@/server/model-gateway/personal-intent/operator-ingress-contract";
import { inspectPersonalModelSetupManifest } from "@/server/model-gateway/personal-intent/operator-setup";
import { validatePersonalModelOperatorArtifact } from "@/server/model-gateway/personal-intent/operator-preparation";

const WORKSPACE_ID = "cmtrm2ljb0003i5ucritxdsy4";
const OWNER_USER_ID = "cmtrm2l2t0000i5ucbyzqyf0z";
const AUTHORITY_ID = "ENDVERA-PERSONAL-20260910-100CAD";
const FROM_VERSION = 2;
const TO_VERSION = 3;
const fail = (): never => { throw new Error("PERSONAL_MODEL_ROUTE_ROTATION_REFUSED"); };
const sha = (value: string) => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;

async function readConfiguration(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const copy = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk), "utf8");
    bytes += copy.byteLength;
    if (bytes > 32_768) fail();
    chunks.push(copy);
  }
  const joined = Buffer.concat(chunks);
  try {
    const value = joined.toString("utf8");
    if (!Buffer.from(value).equals(joined)) fail();
    return value;
  } finally {
    joined.fill(0);
    chunks.forEach(chunk => chunk.fill(0));
  }
}

async function main() {
  const encoded = await readConfiguration();
  const ingress = inspectPersonalModelIngressConfiguration(encoded);
  assertPersonalModelIngressWindow(encoded, Date.now());
  const mapped = inspectPersonalModelSetupManifest(JSON.parse(ingress.configuration.manifestUtf8));
  const answer = mapped.answer ?? fail();
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  if (ingress.configuration.mode !== "ENABLED" || ingress.configuration.expectedSourceHead !== head
    || mapped.manifest.workspaceId !== WORKSPACE_ID || mapped.manifest.ownerUserId !== OWNER_USER_ID
    || mapped.manifest.authorityId !== AUTHORITY_ID || Date.parse(mapped.manifest.pilotExpiresAt) <= Date.now()
    || mapped.route.version !== TO_VERSION || mapped.policy.version !== TO_VERSION || answer.route.version !== TO_VERSION || answer.policy.version !== TO_VERSION
    || mapped.route.endpointKey !== "azure" || answer.route.endpointKey !== "azure"
    || mapped.route.modelKey !== "openai/gpt-5.6-luna" || answer.route.modelKey !== "openrouter/auto"
    || mapped.policy.routeOrder[0]?.version !== TO_VERSION || answer.policy.routeOrder[0]?.version !== TO_VERSION
    || validatePersonalModelOperatorArtifact(mapped.manifest.artifact, new Date()).status !== "PREPARED_NOT_PUBLISHED") fail();

  const receipt = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15000ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5000ms'");
    for (const key of ["personal-answer-openrouter-v1", "personal-answer-v1", "personal-intent-openrouter-candidate-v1", "personal-intent-v1"].sort()) {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS acquired", `personal-model-route-rotation:${key}`);
    }

    const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT w.id FROM "ConstructionWorkspace" w
      JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
      JOIN "User" u ON u.id=m."userId"
      JOIN "ConstructionConnectorAccount" a ON a."workspaceId"=w.id AND a.provider='openrouter' AND a.status='connected' AND a."revokedAt" IS NULL
      JOIN "ConstructionConnectorCredential" c ON c.id=a."credentialRef" AND c."workspaceId"=w.id AND c."revokedAt" IS NULL
      JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id AND g.capability='personal_model_inference' AND g.status='active' AND g."revokedAt" IS NULL
      WHERE w.id=$1 AND w.status='active' AND w."ownerUserId"=$2 AND m.role='owner' AND m.status='active'
        AND u.role='CLIENT' AND u."emailVerified"=true
        AND g."grantedScopes" @> ARRAY['personal_data:inference','authority:ENDVERA-PERSONAL-20260910-100CAD']::text[]
      FOR SHARE OF w,m,u,a,c,g`, WORKSPACE_ID, OWNER_USER_ID);
    if (owner.length !== 1 || owner[0]?.id !== WORKSPACE_ID) fail();

    const priorRoutes = await tx.modelGatewayRouteProfile.findMany({ where: {
      OR: [
        { routeKey: "personal-intent-openrouter-candidate-v1", version: FROM_VERSION },
        { routeKey: "personal-answer-openrouter-v1", version: FROM_VERSION },
      ],
    } });
    const priorPolicies = await tx.modelGatewayPolicyVersion.findMany({ where: {
      OR: [
        { policyKey: "personal-intent-v1", version: FROM_VERSION },
        { policyKey: "personal-answer-v1", version: FROM_VERSION },
      ],
    } });
    if (priorRoutes.length !== 2 || priorPolicies.length !== 2
      || priorRoutes.some(row => row.status !== "published" || row.retiredAt || row.endpointKey !== "azure")
      || priorPolicies.some(row => row.status !== "published" || row.retiredAt)) fail();

    const routeCollision = await tx.modelGatewayRouteProfile.findFirst({ where: { OR: [
      { id: mapped.route.id }, { routeKey: mapped.route.routeKey, version: TO_VERSION }, { canonicalHash: mapped.route.canonicalHash },
      { id: answer.route.id }, { routeKey: answer.route.routeKey, version: TO_VERSION }, { canonicalHash: answer.route.canonicalHash },
    ] }, select: { id: true } });
    const policyCollision = await tx.modelGatewayPolicyVersion.findFirst({ where: { OR: [
      { id: mapped.policy.id }, { policyKey: mapped.policy.policyKey, version: TO_VERSION }, { canonicalHash: mapped.policy.canonicalHash },
      { id: answer.policy.id }, { policyKey: answer.policy.policyKey, version: TO_VERSION }, { canonicalHash: answer.policy.canonicalHash },
    ] }, select: { id: true } });
    if (routeCollision || policyCollision) fail();

    const nowRows = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
    const now = nowRows[0]?.now;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail();
    assertPersonalModelIngressWindow(encoded, now.getTime());
    if (validatePersonalModelOperatorArtifact(mapped.manifest.artifact, now).status !== "PREPARED_NOT_PUBLISHED") fail();
    await tx.modelGatewayRouteProfile.create({ data: { ...mapped.route,
      pricingEvidence: mapped.route.pricingEvidence as Prisma.InputJsonObject,
      privacyEvidence: mapped.route.privacyEvidence as Prisma.InputJsonObject,
      status: "published", publishedAt: now } });
    await tx.modelGatewayPolicyVersion.create({ data: { ...mapped.policy, status: "published", publishedAt: now } });
    await tx.modelGatewayRouteProfile.create({ data: { ...answer.route,
      pricingEvidence: answer.route.pricingEvidence as Prisma.InputJsonObject,
      privacyEvidence: answer.route.privacyEvidence as Prisma.InputJsonObject,
      status: "published", publishedAt: now } });
    await tx.modelGatewayPolicyVersion.create({ data: { ...answer.policy, status: "published", publishedAt: now } });

    const metadata = { authorityId: AUTHORITY_ID, fromVersion: FROM_VERSION, toVersion: TO_VERSION, fromEndpoint: "azure", toEndpoint: "azure",
      intentRouteId: mapped.route.id, intentPolicyId: mapped.policy.id, answerRouteId: answer.route.id, answerPolicyId: answer.policy.id,
      configurationFingerprint: ingress.configurationSha256, rotatedAt: now.toISOString() };
    await tx.constructionAuditEvent.create({ data: {
      id: `personal-model-route-rotation-${ingress.configuration.setupRef}`,
      workspaceId: WORKSPACE_ID, actorUserId: OWNER_USER_ID, entityType: "personal_model_route_rotation",
      entityId: ingress.configuration.setupRef, action: "PUBLISH_AZURE_ZDR_ROUTE_V3", reasonCode: null,
      metadata, fingerprint: sha(JSON.stringify(metadata)), createdAt: now,
    } });

    const stored = await tx.modelGatewayRouteProfile.count({ where: { version: TO_VERSION, endpointKey: "azure", OR: [
      { id: mapped.route.id, canonicalHash: mapped.route.canonicalHash },
      { id: answer.route.id, canonicalHash: answer.route.canonicalHash },
    ] } });
    if (stored !== 2) fail();
    return { status: "PERSONAL_MODEL_AZURE_ZDR_ROUTE_V3_PUBLISHED", setupRef: ingress.configuration.setupRef,
      intentPolicyVersionId: mapped.policy.id, answerPolicyVersionId: answer.policy.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });

  process.stdout.write(JSON.stringify(receipt));
}

main().catch(() => { process.stderr.write("PERSONAL_MODEL_ROUTE_ROTATION_REFUSED\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

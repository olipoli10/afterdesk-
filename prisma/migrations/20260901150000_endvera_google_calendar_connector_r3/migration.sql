-- ENDVERA Construction Operating Assistant R3 — connector authority and
-- Google Calendar preparation. Forward-only and additive. No credential,
-- OAuth token, sync token, external write, or provider call is introduced.

CREATE TABLE "ConstructionConnectorAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "requestedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "externalAccountKeyHash" TEXT,
    "credentialRef" TEXT,
    "syncCursorRef" TEXT,
    "calendarRef" TEXT NOT NULL DEFAULT 'primary',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "connectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionConnectorAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionConnectorAccount_provider_check" CHECK ("provider" IN ('google_calendar')),
    CONSTRAINT "ConstructionConnectorAccount_status_check" CHECK ("status" IN ('prepared', 'connected', 'revoked', 'error')),
    CONSTRAINT "ConstructionConnectorAccount_state_version_check" CHECK ("stateVersion" > 0),
    CONSTRAINT "ConstructionConnectorAccount_calendar_ref_check" CHECK ("calendarRef" = 'primary'),
    CONSTRAINT "ConstructionConnectorAccount_connected_refs_check" CHECK (
      "status" <> 'connected' OR ("credentialRef" IS NOT NULL AND "externalAccountKeyHash" IS NOT NULL)
    ),
    CONSTRAINT "ConstructionConnectorAccount_revoked_clear_check" CHECK (
      "status" <> 'revoked' OR (
        "credentialRef" IS NULL AND "syncCursorRef" IS NULL AND
        "externalAccountKeyHash" IS NULL AND cardinality("grantedScopes") = 0
      )
    )
);

CREATE TABLE "ConstructionConnectorGrant" (
    "id" TEXT NOT NULL,
    "connectorAccountId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionConnectorGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionConnectorGrant_capability_check" CHECK ("capability" IN ('calendar_read', 'calendar_write')),
    CONSTRAINT "ConstructionConnectorGrant_status_check" CHECK ("status" IN ('requested', 'active', 'revoked')),
    CONSTRAINT "ConstructionConnectorGrant_state_version_check" CHECK ("stateVersion" > 0),
    CONSTRAINT "ConstructionConnectorGrant_active_check" CHECK (
      "status" <> 'active' OR ("grantedAt" IS NOT NULL AND cardinality("grantedScopes") > 0)
    ),
    CONSTRAINT "ConstructionConnectorGrant_revoked_check" CHECK (
      "status" <> 'revoked' OR ("revokedAt" IS NOT NULL AND cardinality("grantedScopes") = 0)
    )
);

CREATE TABLE "ConstructionConnectorOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectorAccountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "idempotencyKey" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB,
    "resultHash" TEXT,
    "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionConnectorOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionConnectorOperation_kind_check" CHECK ("kind" IN (
      'authorization_prepare', 'local_revoke', 'calendar_insert', 'calendar_patch', 'full_sync', 'incremental_sync'
    )),
    CONSTRAINT "ConstructionConnectorOperation_status_check" CHECK ("status" IN ('prepared', 'applied', 'refused')),
    CONSTRAINT "ConstructionConnectorOperation_no_transport_check" CHECK ("externalTransportPerformed" = false),
    CONSTRAINT "ConstructionConnectorOperation_result_hash_check" CHECK (
      ("result" IS NULL AND "resultHash" IS NULL) OR ("result" IS NOT NULL AND "resultHash" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ConstructionConnectorAccount_workspaceId_provider_key"
  ON "ConstructionConnectorAccount"("workspaceId", "provider");
CREATE UNIQUE INDEX "ConstructionConnectorAccount_id_workspaceId_key"
  ON "ConstructionConnectorAccount"("id", "workspaceId");
CREATE INDEX "ConstructionConnectorAccount_workspaceId_status_idx"
  ON "ConstructionConnectorAccount"("workspaceId", "status");

CREATE UNIQUE INDEX "ConstructionConnectorGrant_connectorAccountId_capability_key"
  ON "ConstructionConnectorGrant"("connectorAccountId", "capability");
CREATE INDEX "ConstructionConnectorGrant_connectorAccountId_status_idx"
  ON "ConstructionConnectorGrant"("connectorAccountId", "status");

CREATE UNIQUE INDEX "ConstructionConnectorOperation_workspaceId_idempotencyKey_key"
  ON "ConstructionConnectorOperation"("workspaceId", "idempotencyKey");
CREATE INDEX "ConstructionConnectorOperation_connectorAccountId_status_createdAt_idx"
  ON "ConstructionConnectorOperation"("connectorAccountId", "status", "createdAt");
CREATE INDEX "ConstructionConnectorOperation_workspaceId_kind_status_idx"
  ON "ConstructionConnectorOperation"("workspaceId", "kind", "status");

ALTER TABLE "ConstructionConnectorAccount"
  ADD CONSTRAINT "ConstructionConnectorAccount_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConstructionConnectorGrant"
  ADD CONSTRAINT "ConstructionConnectorGrant_connectorAccountId_fkey"
  FOREIGN KEY ("connectorAccountId") REFERENCES "ConstructionConnectorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConstructionConnectorOperation"
  ADD CONSTRAINT "ConstructionConnectorOperation_connectorAccountId_workspaceId_fkey"
  FOREIGN KEY ("connectorAccountId", "workspaceId") REFERENCES "ConstructionConnectorAccount"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

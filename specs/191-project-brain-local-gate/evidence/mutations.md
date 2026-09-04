# R36Z Mutation Evidence

All 18 mutations were killed, restored byte-exactly and followed by a green targeted rerun.

| Mutation | Exact guard | Before/after SHA-256 | Result |
|---|---|---|---|
| intake-source-or-brief-is-omitted | `R36Z_CONTRACT_GUARD:intakeSourceAndBriefRequired` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| r36w-unconfirmed-candidate-becomes-truth | `R36Z_CONTRACT_GUARD:unconfirmedCandidateNeverTruth` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| contradiction-member-or-history-is-erased | `R36Z_CONTRACT_GUARD:contradictionHistoryAppendOnly` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| contradiction-fixture-is-vacuous-auto-detected-or-loses-exact-provenance | `R36Z_CONTRACT_GUARD:contradictionFixtureExplicitExactProvenance` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| unresolved-contradiction-can-seal | `R36Z_CONTRACT_GUARD:unresolvedContradictionCannotSeal` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| assistant-reads-draft-or-stale-memory | `R36Z_CONTRACT_GUARD:assistantCurrentConfirmedOnly` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| citation-chain-is-missing-or-mismatched | `R36Z_CONTRACT_GUARD:citationChainRequired` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| prepared-action-hides-recipient-channel-or-body | `R36Z_CONTRACT_GUARD:preparedPayloadVisible` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| prepared-action-approves-or-delivers | `R36Z_CONTRACT_GUARD:preparedActionNoApprovalDelivery` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| restart-reuses-same-process-state | `R36Z_CONTRACT_GUARD:freshProcessRestartRequired` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| replay-or-concurrency-duplicates-effect | `R36Z_CONTRACT_GUARD:replayConcurrencyIdempotent` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| cross-tenant-project-or-role-discloses-content | `R36Z_CONTRACT_GUARD:tenantProjectRoleNonDisclosure` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| mobile-flow-requires-technical-id | `R36Z_CONTRACT_GUARD:mobileNoTechnicalIds` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| provider-credential-network-or-semantic-binary-path-is-reachable | `R36Z_CONTRACT_GUARD:zeroProviderCredentialNetworkSemanticBinary` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| external-transport-write-or-spend-is-nonzero | `R36Z_CONTRACT_GUARD:zeroExternalTransportWriteSpend` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| missing-skipped-or-unknown-assertion-can-pass | `R36Z_CONTRACT_GUARD:missingSkippedUnknownFails` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| test-writes-final-report-or-fragment-allowlist-is-bypassed | `R36Z_CONTRACT_GUARD:validatorOwnsFinalReport` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |
| cleanup-target-is-not-owned | `R36Z_CONTRACT_GUARD:cleanupOwnershipRequired` | `0e94852f3c9dd25ef3001c2e4d129550d32b86f6484471ae8200af3f87d615ce` | KILLED / RESTORED |

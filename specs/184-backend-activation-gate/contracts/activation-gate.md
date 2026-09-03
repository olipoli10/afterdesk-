# Activation Gate Contract

The gate accepts an environment-like key/value map. A capability is enabled only when:

1. `ENDVERA_EXTERNAL_TRANSPORT_ENABLED=ENABLED`;
2. `ENDVERA_EXTERNAL_AUTHORITY_REF` is non-empty;
3. `ENDVERA_EXTERNAL_OWNER_REF` is non-empty;
4. the capability-specific `ENDVERA_*_ENABLED=ENABLED` token is exact;
5. every named configuration value required by the capability is non-empty.

The returned decision contains only requirement codes.


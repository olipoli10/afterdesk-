/**
 * POLICY VERSIONS — the three axes Phase 1C keeps deliberately independent.
 *
 * NO `server-only` IMPORT, NO DEPENDENCIES, on purpose (the
 * primitive-vocabulary.ts precedent): these constants are read by pure
 * statistics code, by server modules, and by tests alike, and a version
 * string must never drag a server module into a client bundle.
 *
 * The separation these constants exist to enforce:
 *
 *  - the EXECUTION workflow key describes what the machine and the human
 *    actually do. Changing a primitive fragments history — correctly, the
 *    work changed;
 *  - the PRICING policy describes how we priced it. Changing the margin or
 *    the cost catalog must NOT fragment operational history: a token costs
 *    what it costs regardless of our margin target. Only estimate-vs-actual
 *    variances are stratified by this version, because the estimate is the
 *    thing the policy produced;
 *  - the QUALITY policy describes how errors are counted at QC. Changing
 *    the rubric strata QC metrics without touching cost or reliability.
 *
 * Bump rules: PRICING_POLICY_VERSION changes whenever COST_CATALOG numbers
 * or the pricing formulas change observable output. QUALITY_POLICY_VERSION
 * changes whenever the QC rubric adds/removes/redefines an error category.
 * EXECUTION_KEY_VERSION changes only when the key FORMAT itself changes
 * (dimensions added or reordered), never for content reasons.
 */

/** Version of the COST_CATALOG numbers. Re-exported by cost-catalog.ts. */
export const COST_CATALOG_VERSION = "cc1";

/** Pricing formulas + catalog, as one policy identity. */
export const PRICING_POLICY_VERSION = `pricing_v1+${COST_CATALOG_VERSION}`;

/** The QC rubric TaskQualityReview counts errors against. */
export const QUALITY_POLICY_VERSION = "qc_v1";

/** Format version of the execution workflow key. */
export const EXECUTION_KEY_VERSION = 1;

import { describe, expect, it } from 'vitest';
import { buildPilotTrialAddedStateQuery, inspectSuppliedPilotTrialAddedState } from '../specs/210-personal-live-activation/deployment/pilot-trial-added-state.mjs';

const query = buildPilotTrialAddedStateQuery();
const proofs = ['PersonalCalendarSmsConfirmationNonce', 'PersonalCalendarSmsConfirmation', 'PersonalSmsTemporalClarification',
  'PersonalSmsTemporalClarificationReply', 'PersonalSmsConversationExpectation', 'PersonalSmsCorrelatedCalendarReview', 'PersonalSmsCorrelatedCalendarApproval'];
const rules = [
  { table: 'AiOperation', columns: ['personalAssistantOperationId'] },
  { table: 'PersonalAssistantOperation', columns: ['sourcePersonalOperationId', 'modelGatewayOperationId', 'correlatedTemporalReceiptId'] },
  { table: 'VoiceIntakeSession', columns: ['requestedByUserId', 'workspaceId', 'projectId', 'intakeId', 'projectBrainSourceId',
    'requestCommandId', 'sourceBinding', 'sourceBindingHash', 'segmentManifest', 'segmentManifestHash'] },
];
function fixture() {
  return { version: query.version, manifestSha256: query.manifestSha256,
    context: { database: 'neondb', role: 'neondb_owner', serverVersionNum: 180006, readOnly: 'on', isolation: 'repeatable read', timeZone: 'UTC' },
    proofTables: proofs.map(table => ({ table, rowCountAtMostOne: '0' })),
    legacyTables: rules.map(({ table }) => ({ table, rowCount: '1', invalidRows: '0', truncated: false })) };
}

describe('peer added-state aggregate boundaries — supplied counts, no SQL execution', () => {
  it('counts simultaneous proof and legacy violations without cancelling either family', () => {
    const value = fixture(); value.proofTables.forEach(row => { row.rowCountAtMostOne = '1'; });
    value.legacyTables.forEach(row => { row.rowCount = '500000'; row.invalidRows = '500000'; });
    const result = inspectSuppliedPilotTrialAddedState(value);
    expect(result).toMatchObject({ status: 'SUPPLIED_ADDED_STATE_VIOLATIONS', nonEmptyProofTables: 7,
      legacyRowCount: '1500000', invalidLegacyRows: '1500000', proofTablesEmpty: false,
      proofCountsAreCappedAtOne: true, schemaGuardsVerified: false, databaseRead: false, executionAuthorized: false });
  });
  it('refuses a truncated snapshot even when another family already proves a violation', () => {
    const value = fixture(); value.proofTables[0].rowCountAtMostOne = '1'; value.legacyTables[2].truncated = true;
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow('PILOT_TRIAL_ADDED_STATE_REFUSED');
  });
  it('keeps partial vacuity explicit alongside a nonempty proof violation', () => {
    const value = fixture(); value.legacyTables[0].rowCount = '0'; value.legacyTables[2].rowCount = '0';
    value.proofTables[4].rowCountAtMostOne = '1'; value.legacyTables.reverse();
    expect(inspectSuppliedPilotTrialAddedState(value)).toMatchObject({ status: 'SUPPLIED_ADDED_STATE_VIOLATIONS',
      vacuousLegacyTables: ['AiOperation', 'VoiceIntakeSession'], allLegacyTablesNonEmpty: false,
      legacyRowCount: '1', invalidLegacyRows: '0', nonEmptyProofTables: 1, oldDataPreservationVerified: false });
  });
  it.each(rules)('isolates the exact boolean checks for $table in its own capped SQL branch', rule => {
    // This is a static check of this fixed query, not a general SQL parser or a native proof.
    const branches = query.sql.match(/SELECT '[^']+'::text AS "table",count\(\*\)::text AS "rowCount",[\s\S]*?LIMIT 500001\) AS bounded/g) ?? [];
    expect(branches).toHaveLength(3);
    const branch = branches.find((text: string) => text.startsWith(`SELECT '${rule.table}'`));
    expect(branch).toBeDefined();
    expect([...branch!.matchAll(/t\."([^"]+)" IS NOT NULL/g)].map(match => match[1])).toEqual(rule.columns);
    expect(branch).toContain(`FROM ONLY public."${rule.table}" AS t LIMIT 500001`);
    expect(branch!.includes('t."subjectKind" IS DISTINCT FROM \'voice_intake\'')).toBe(rule.table === 'VoiceIntakeSession');
    expect(branch).not.toMatch(/SELECT \*|to_jsonb|jsonb_agg|COALESCE/);
  });
});

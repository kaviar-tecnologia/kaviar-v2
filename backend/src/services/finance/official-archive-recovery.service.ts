/**
 * PR #410: read-only operational inventory for archived-document reservations.
 * Never reads S3 keys/bytes, modifies a reservation, or certifies provider origin.
 * Time threshold is a triage prompt, not evidence that S3 upload failed.
 */
import { prisma } from '../../lib/prisma';
import { monthWindow } from './monthly-close-preview.service';
import { OfficialArchiveError, requireOfficialArchiveConfig } from './official-statement-archive.service';

export type RecoveryRow = {
  id: string;
  account_id: string;
  provider: string;
  status: string;
  source_verification: string;
  recorded_at: Date;
  stored_at: Date | null;
};
type RecoveryAction =
  | 'RESERVATION_RECENT_CHECK_LATER'
  | 'CHECK_S3_OBJECT_AND_AUDIT_MANUALLY'
  | 'REVIEW_RECORD_CLOCK_SKEW'
  | 'STORAGE_BYTES_CONFIRMED_ORIGIN_UNVERIFIED';

export function assembleArchiveRecovery(
  rows: RecoveryRow[], entity: string, year: number, month: number,
  now: Date, thresholdMinutes = 15,
) {
  const competence = monthWindow(year, month).competence;
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(thresholdMinutes) ||
      thresholdMinutes < 1 || thresholdMinutes > 1440)
    throw new OfficialArchiveError(400, 'ARCHIVE_RECOVERY_WINDOW_INVALID');
  const entries = rows.map(row => {
    // Unexpected states must fail closed; never silently report a record as safe.
    if (!['RESERVED', 'STORED_UNVERIFIED'].includes(row.status) ||
        !['SUMUP', 'ASAAS'].includes(row.provider) ||
        row.source_verification !== 'UNVERIFIED' ||
        !(row.recorded_at instanceof Date) ||
        (row.status === 'STORED_UNVERIFIED' && !(row.stored_at instanceof Date)) ||
        (row.status === 'RESERVED' && row.stored_at !== null))
      throw new OfficialArchiveError(409, 'ARCHIVE_UNEXPECTED_TRUST_STATE');
    const ageMinutes = Math.floor((now.getTime() - row.recorded_at.getTime()) / 60_000);
    let action: RecoveryAction;
    if (!Number.isFinite(ageMinutes) || ageMinutes < 0)
      action = 'REVIEW_RECORD_CLOCK_SKEW';
    else if (row.status === 'STORED_UNVERIFIED')
      action = 'STORAGE_BYTES_CONFIRMED_ORIGIN_UNVERIFIED';
    else if (ageMinutes >= thresholdMinutes)
      action = 'CHECK_S3_OBJECT_AND_AUDIT_MANUALLY';
    else
      action = 'RESERVATION_RECENT_CHECK_LATER';
    return {
      id: row.id, accountId: row.account_id, provider: row.provider,
      competence, status: row.status, recordedAt: row.recorded_at,
      storedAt: row.stored_at, ageMinutes, action,
      // Positive storage result DOES NOT certify issued-by-provider provenance.
      officialSourceVerified: false, zeroRevenueVerified: false,
      reconciliationVerified: false, finalClosing: false,
    };
  });
  const counts = {
    total: entries.length,
    reserved: entries.filter(e => e.status === 'RESERVED').length,
    requiresManualObjectCheck: entries.filter(
      e => e.action === 'CHECK_S3_OBJECT_AND_AUDIT_MANUALLY',
    ).length,
    clockSkew: entries.filter(e => e.action === 'REVIEW_RECORD_CLOCK_SKEW').length,
    storedOriginUnverified: entries.filter(
      e => e.action === 'STORAGE_BYTES_CONFIRMED_ORIGIN_UNVERIFIED',
    ).length,
  };
  return {
    mode: 'READ_ONLY_ARCHIVE_RECOVERY' as const,
    legalEntityId: entity, competence, thresholdMinutes, counts, entries,
    manualActionsOnly: true, automaticRetry: false, automaticDelete: false,
    s3InspectedByThisEndpoint: false, officialStatementsVerified: false,
    accountantAttestationVerified: false, zeroRevenueVerified: false,
    readyForFinalClosing: false, finalClosing: false,
    reviewReasons: [
      'OFFICIAL_SUMUP_SOURCE_UNVERIFIED', 'OFFICIAL_ASAAS_SOURCE_UNVERIFIED',
      'ACCOUNTANT_ATTESTATION_NOT_VERIFIED',
      ...(counts.reserved ? ['ARCHIVE_RESERVATIONS_REQUIRE_REVIEW'] : []),
    ],
  };
}

export async function loadArchiveRecovery(
  entity: string, year: number, month: number, now = new Date(),
) {
  // Gate and dedicated vault configuration are checked BEFORE database access.
  requireOfficialArchiveConfig();
  monthWindow(year, month);
  const legal = await prisma.legal_entities.findFirst({
    where: { id: entity, is_active: true }, select: { id: true },
  });
  if (!legal) throw new OfficialArchiveError(404, 'LEGAL_ENTITY_NOT_FOUND');
  const rows = await prisma.finance_official_statement_archives.findMany({
    where: { legal_entity_id: entity, year, month },
    select: {
      id: true, account_id: true, provider: true, status: true,
      source_verification: true, recorded_at: true, stored_at: true,
    },
    orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }], take: 101,
  });
  // Do not return an incomplete checklist suggesting all evidence was inspected.
  if (rows.length > 100) throw new OfficialArchiveError(409, 'ARCHIVE_RECOVERY_PAGINATION_REQUIRED');
  return assembleArchiveRecovery(rows, entity, year, month, now);
}

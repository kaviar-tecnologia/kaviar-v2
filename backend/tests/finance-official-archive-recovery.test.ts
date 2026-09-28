import { describe,expect,it } from 'vitest';
import { assembleArchiveRecovery, type RecoveryRow } from '../src/services/finance/official-archive-recovery.service';
import { OfficialArchiveError } from '../src/services/finance/official-statement-archive.service';

const now = new Date('2026-09-27T12:00:00.000Z');
const row=(id:string,status:string,minutes:number,provider='SUMUP'):RecoveryRow=>({
  id, account_id:'synthetic-account',provider,status,source_verification:'UNVERIFIED',
  recorded_at:new Date(now.getTime()-minutes*60000),
  stored_at:status==='RESERVED'?null:new Date(now.getTime()-1000),
  storage_version_id:status==='STORED_PENDING_SCAN'?'fictional-version-1':null,
  malware_scan_status:'PENDING',
});
const report=(rows:RecoveryRow[])=>assembleArchiveRecovery(rows,'synthetic-entity',2026,8,now);

describe('PR410 manual archive recovery report is read-only and never certifies origin',()=>{
  it('separates fresh/stale reservations and stored-but-unverified entries',()=>{
    const out=report([row('fresh','RESERVED',14),row('stale','RESERVED',15),
      row('old','STORED_UNVERIFIED',180,'ASAAS')]);
    expect(out.entries.map(x=>x.action)).toEqual([
      'RESERVATION_RECENT_CHECK_LATER',
      'CHECK_S3_OBJECT_AND_AUDIT_MANUALLY',
      'STORAGE_BYTES_CONFIRMED_ORIGIN_UNVERIFIED',
    ]);
    expect(out.counts).toMatchObject({
      total:3,reserved:2,requiresManualObjectCheck:1,storedOriginUnverified:1,
    });
    expect(out).toMatchObject({
      mode:'READ_ONLY_ARCHIVE_RECOVERY',manualActionsOnly:true,
      automaticRetry:false,automaticDelete:false,s3InspectedByThisEndpoint:false,
      officialStatementsVerified:false,accountantAttestationVerified:false,
      zeroRevenueVerified:false,readyForFinalClosing:false,finalClosing:false,
    });
    expect(out.reviewReasons).toContain('ARCHIVE_RESERVATIONS_REQUIRE_REVIEW');
    expect(JSON.stringify(out)).not.toContain('storage_key');
  });
  it('distinguishes pending scans and rejected results without certifying them',()=>{
    const pending=row('pending','STORED_PENDING_SCAN',25);
    const rejected={...row('rejected','STORED_PENDING_SCAN',50),malware_scan_status:'THREATS_FOUND'};
    const out=report([pending,rejected]);
    expect(out.entries.map(x=>x.action)).toEqual([
      'AWAIT_GUARDDUTY_RESULT','REVIEW_UNCLEAN_OR_FAILED_SCAN',
    ]);
    expect(out.counts).toMatchObject({awaitingScan:1,scanNeedsReview:1});
    expect(out.finalClosing).toBe(false);
    expect(()=>report([{...pending,storage_version_id:null}])).toThrow(OfficialArchiveError);
  });
  it('does not confuse no archive rows with verified zero activity',()=>{
    const out=report([]);
    expect(out.counts.total).toBe(0);
    expect(out.reviewReasons).toEqual([
      'OFFICIAL_SUMUP_SOURCE_UNVERIFIED','OFFICIAL_ASAAS_SOURCE_UNVERIFIED',
      'ACCOUNTANT_ATTESTATION_NOT_VERIFIED',
    ]);
    expect(out.zeroRevenueVerified).toBe(false);
  });
  it('flags future-recorded clock skew for manual review',()=>{
    expect(report([row('future','RESERVED',-4)]).entries[0].action)
      .toBe('REVIEW_RECORD_CLOCK_SKEW');
  });
  it('rejects unexpected trust state rather than presenting it as safe',()=>{
    for(const invalid of [
      {...row('x','CLOSED',60)},
      {...row('x','STORED_UNVERIFIED',60),source_verification:'VERIFIED'},
      {...row('x','RESERVED',60),source_verification:'VERIFIED'},
    ]) expect(()=>report([invalid])).toThrow(OfficialArchiveError);
    expect(()=>assembleArchiveRecovery([], 'id', 2026, 8, now, 0)).toThrow();
  });
});

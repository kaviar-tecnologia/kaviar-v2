import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  decodeSyntheticEvidence, EvidenceError,
} from '../src/services/finance/statement-evidence.service';

describe('PR408 synthetic documentary contracts', () => {
  it('uses the exact uploaded bytes to calculate the digest', () => {
    const csv = 'event_id,occurred_on,event_type,direction,amount_cents,currency,external_reference\n';
    const input = Buffer.from(csv).toString('base64');
    const receipt = decodeSyntheticEvidence(input);
    expect(receipt.csv).toBe(csv);
    expect(receipt.byteCount).toBe(Buffer.byteLength(csv));
    expect(receipt.contentSha256).toBe(createHash('sha256').update(Buffer.from(csv)).digest('hex'));
    expect(decodeSyntheticEvidence(Buffer.from(csv + ' ').toString('base64')).contentSha256)
      .not.toBe(receipt.contentSha256);
  });
  it('rejects malformed base64 instead of silently accepting truncated content', () => {
    for (const bad of ['%%%%%%%', 'YWJj=', ' YWJjZA==', 'YWJjZA==\n']) {
      expect(() => decodeSyntheticEvidence(bad)).toThrow(EvidenceError);
    }
  });
  it('rejects non-UTF8 bytes instead of inserting a lossy manifest', () => {
    expect(() => decodeSyntheticEvidence(Buffer.from([0xff, 0xfe, 0xfd, 0xfa]).toString('base64')))
      .toThrow(EvidenceError);
  });
  it('rejects over-limit input', () => {
    expect(() => decodeSyntheticEvidence(Buffer.alloc(65_537, 65).toString('base64')))
      .toThrow(EvidenceError);
  });
});

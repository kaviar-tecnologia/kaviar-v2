import { describe, expect, it, vi } from 'vitest';
import { inspectArchiveBytes, requireOfficialArchiveConfig, OfficialArchiveError } from '../src/services/finance/official-statement-archive.service';
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
describe('PR409 private archive policy, not official source certification', () => {
  it('sniffs PDF bytes instead of trusting extension', () => {
    expect(inspectArchiveBytes('source.pdf',pdf)).toMatchObject({
      extension:'pdf',contentType:'application/pdf',byteCount:pdf.length,
    });
    expect(inspectArchiveBytes('source.pdf',pdf).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => inspectArchiveBytes('source.csv',pdf)).toThrow(OfficialArchiveError);
    expect(() => inspectArchiveBytes('../source.pdf',pdf)).toThrow(OfficialArchiveError);
  });
  it('rejects invalid PDF, invalid UTF8, unsupported extensions and oversized data', () => {
    expect(() => inspectArchiveBytes('a.pdf',Buffer.from('not a PDF body'))).toThrow();
    expect(() => inspectArchiveBytes('a.csv',Buffer.from([0xff,0xfe,0xfd,0xfa,0xfb,0xfc]))).toThrow();
    expect(() => inspectArchiveBytes('a.html',Buffer.from('col1,col2\none,two\n'))).toThrow();
    expect(() => inspectArchiveBytes('a.csv',Buffer.alloc(5*1024*1024+1))).toThrow();
  });
  it('accepts an unparsed CSV without pretending to verify provider format', () => {
    expect(inspectArchiveBytes('source.csv',Buffer.from('name,value\nx,1\n')))
      .toMatchObject({extension:'csv',contentType:'text/csv'});
  });
  it('fails closed when disabled or dedicated private KMS storage is missing', () => {
    vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','false');
    expect(() => requireOfficialArchiveConfig()).toThrowError('OFFICIAL_ARCHIVE_DISABLED');
    vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','true');
    vi.stubEnv('FINANCE_EVIDENCE_BUCKET','kaviar-uploads-847895361928');
    vi.stubEnv('FINANCE_EVIDENCE_KMS_KEY_ARN','');
    expect(() => requireOfficialArchiveConfig()).toThrowError('OFFICIAL_ARCHIVE_PRIVATE_STORAGE_NOT_CONFIGURED');
    vi.unstubAllEnvs();
  });
});

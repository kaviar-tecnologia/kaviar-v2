/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
import api from '../api';
import {
  OFFICIAL_ARCHIVE_BASE, checkOfficialArchiveMalware, getOfficialArchiveRecovery,
  isOfficialArchiveApproved, listOfficialArchives, officialArchiveErrorMessage,
  officialArchiveStatus, uploadOfficialArchive,
} from '../services/financeOfficialArchiveService';

const params = {
  legal_entity_id: '11111111-1111-4111-8111-111111111111',
  year: 2026, month: 9,
};
const read = (name) => readFileSync(resolve(__dirname, name), 'utf8');
const page = read('../pages/admin/FinanceOfficialArchivesPage.jsx');
const routes = read('../components/admin/AdminApp.jsx');
const hub = read('../pages/admin/FinanceiroPage.jsx');

afterEach(() => vi.clearAllMocks());

describe('official archive API contract', () => {
  it('queries metadata and read-only recovery scoped to one legal entity and competence', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [] } });
    await listOfficialArchives(params);
    await getOfficialArchiveRecovery(params);
    expect(api.get).toHaveBeenNthCalledWith(1,
      OFFICIAL_ARCHIVE_BASE + '?legal_entity_id=' + params.legal_entity_id + '&year=2026&month=9',
      { timeout: 30000 });
    expect(api.get).toHaveBeenNthCalledWith(2,
      OFFICIAL_ARCHIVE_BASE + '/recovery?legal_entity_id=' + params.legal_entity_id + '&year=2026&month=9',
      { timeout: 30000 });
  });

  it('sends one multipart file and exactly six API fields, with no ledger operation', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { id: 'synthetic' } } });
    const file = new File(['type,value\nTEST,0\n'], 'fictional.csv', { type: 'text/csv' });
    const result = await uploadOfficialArchive({
      ...params, account_id: '22222222-2222-4222-8222-222222222222',
      provider: 'SUMUP', declared_source_channel: 'PROVIDER_PORTAL_DECLARED', file,
    });
    expect(result.success).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe(OFFICIAL_ARCHIVE_BASE);
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()].sort()).toEqual([
      'account_id', 'declared_source_channel', 'file', 'legal_entity_id', 'month', 'provider', 'year',
    ]);
    expect(body.get('file').name).toBe('fictional.csv');
    expect(body.get('year')).toBe('2026');
    expect(body.get('month')).toBe('9');
    expect(body.get('declared_source_channel')).toBe('PROVIDER_PORTAL_DECLARED');
    expect(config.headers['Content-Type']).toBeUndefined();
    expect(config.timeout).toBe(45000);
  });

  it('checks GuardDuty only by archive ID; never passes bucket, object key or version from the browser', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: {} } });
    await checkOfficialArchiveMalware('33333333-3333-4333-8333-333333333333');
    expect(api.post).toHaveBeenCalledWith(
      OFFICIAL_ARCHIVE_BASE + '/33333333-3333-4333-8333-333333333333/check-malware',
      {}, { timeout: 45000 });
  });

  it('does not treat historical integrity or a clean tag alone as new malware approval', () => {
    const clean = {
      status: 'STORED_UNVERIFIED', malwareScanStatus: 'NO_THREATS_FOUND',
      malwareScanApproved: true, storageIntegrityVerified: true,
    };
    expect(isOfficialArchiveApproved(clean)).toBe(true);
    expect(officialArchiveStatus(clean)).toMatchObject({ tone: 'success' });
    for (const row of [
      { ...clean, malwareScanApproved: false },
      { ...clean, malwareScanStatus: 'PENDING' },
      { ...clean, storageIntegrityVerified: false },
      { ...clean, status: 'STORED_PENDING_SCAN' },
    ]) {
      expect(isOfficialArchiveApproved(row)).toBe(false);
      expect(officialArchiveStatus(row).tone).not.toBe('success');
    }
    expect(officialArchiveStatus({ status: 'STORED_PENDING_SCAN', malwareScanStatus: 'THREATS_FOUND' }).tone).toBe('error');
    expect(officialArchiveStatus({ status: 'RESERVED', malwareScanStatus: 'PENDING' }).tone).toBe('warning');
  });

  it('presents safe actionable errors without raw server details', () => {
    expect(officialArchiveErrorMessage({ response: { status: 503, data: { error: 'ARCHIVE_STORAGE_UNCONFIRMED' } } }))
      .toContain('Consulte as pendências');
    expect(officialArchiveErrorMessage({ response: { status: 403, data: { error: 'SUPER_ADMIN_REQUIRED' } } }))
      .toContain('Superadministrador');
    expect(officialArchiveErrorMessage({ message: 'private server stack trace' }))
      .toBe('Não foi possível concluir a operação.');
  });
});

describe('premium official archive workspace safety', () => {
  it('registers the route with SUPER_ADMIN protection and the scoped hub link', () => {
    expect(routes).toContain('import FinanceOfficialArchivesPage');
    expect(routes).toMatch(/path="\/financeiro\/extratos-oficiais"[\s\S]*?<ProtectedAdminRoute requireSuperAdmin>/);
    expect(hub).toContain("...(isSuperAdmin ? [{ label: 'Extratos oficiais'");
    expect(routes).toContain("to: '/admin/financeiro/extratos-oficiais'");
  });

  it('contains uploader, manual scan and honest empty states without unsafe actions', () => {
    expect(page).toContain('uploadOfficialArchive');
    expect(page).toContain('checkOfficialArchiveMalware');
    expect(page).toContain('getOfficialArchiveRecovery');
    expect(page).toContain('listOfficialArchives');
    expect(page).toContain('Nenhum documento listado');
    expect(page).toContain('faturamento zero');
    expect(page).toContain('Somente consulta');
    expect(page).toContain('Esta operação');
    expect(page).not.toContain('createFinanceTransaction');
    expect(page).not.toContain('postFinanceTransaction');
    expect(page).not.toContain('window.open(');
    expect(page).not.toContain('getSignedUrl');
  });
});

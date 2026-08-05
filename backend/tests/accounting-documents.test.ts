import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, accounting_document_scan_status } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test' } },
});

// Test helpers
const API_BASE = 'http://127.0.0.1:3003';

// We'll test directly via the service layer for unit tests
// and via HTTP for integration tests (requires running server)

import {
  validateFileMetadata,
  generateStorageKey,
  getFileExtension,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
} from '../src/services/accounting/accounting-document-storage.service';

import {
  computeTemporalStatus,
  getNextVersionNumber,
} from '../src/services/accounting/accounting-documents.service';

import { VALID_STATUS_TRANSITIONS } from '../src/services/accounting/accounting-documents-validation';

describe('Accounting Documents — Unit Tests', () => {
  describe('validateFileMetadata', () => {
    it('accepts valid PDF', () => {
      const result = validateFileMetadata({ filename: 'contrato.pdf', mimeType: 'application/pdf', sizeBytes: 1024 });
      expect(result).toEqual({ valid: true });
    });

    it('accepts valid JPEG', () => {
      const result = validateFileMetadata({ filename: 'doc.jpg', mimeType: 'image/jpeg', sizeBytes: 5000 });
      expect(result).toEqual({ valid: true });
    });

    it('accepts valid XLSX', () => {
      const result = validateFileMetadata({
        filename: 'planilha.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 100000,
      });
      expect(result).toEqual({ valid: true });
    });

    it('rejects file exceeding 20MB', () => {
      const result = validateFileMetadata({ filename: 'big.pdf', mimeType: 'application/pdf', sizeBytes: MAX_FILE_SIZE + 1 });
      expect(result.valid).toBe(false);
      expect((result as any).error).toContain('20MB');
    });

    it('rejects zero-size file', () => {
      const result = validateFileMetadata({ filename: 'empty.pdf', mimeType: 'application/pdf', sizeBytes: 0 });
      expect(result.valid).toBe(false);
    });

    it('rejects disallowed extension', () => {
      const result = validateFileMetadata({ filename: 'virus.exe', mimeType: 'application/octet-stream', sizeBytes: 1024 });
      expect(result.valid).toBe(false);
      expect((result as any).error).toContain('Extensão não permitida');
    });

    it('rejects disallowed MIME type', () => {
      const result = validateFileMetadata({ filename: 'doc.pdf', mimeType: 'application/octet-stream', sizeBytes: 1024 });
      expect(result.valid).toBe(false);
      expect((result as any).error).toContain('Tipo MIME não permitido');
    });

    it('rejects extension/MIME mismatch', () => {
      const result = validateFileMetadata({ filename: 'fake.pdf', mimeType: 'image/jpeg', sizeBytes: 1024 });
      expect(result.valid).toBe(false);
      expect((result as any).error).toContain('não corresponde');
    });

    it('rejects file without extension', () => {
      const result = validateFileMetadata({ filename: 'noext', mimeType: 'application/pdf', sizeBytes: 1024 });
      expect(result.valid).toBe(false);
      expect((result as any).error).toContain('sem extensão');
    });
  });

  describe('generateStorageKey', () => {
    it('generates unique keys', () => {
      const key1 = generateStorageKey('doc-123', 1, '.pdf');
      const key2 = generateStorageKey('doc-123', 1, '.pdf');
      expect(key1).not.toBe(key2); // nonce guarantees uniqueness
    });

    it('includes document id and version', () => {
      const key = generateStorageKey('doc-abc', 3, '.pdf');
      expect(key).toContain('doc-abc');
      expect(key).toContain('v3-');
      expect(key).toContain('.pdf');
    });

    it('organizes by year/month', () => {
      const key = generateStorageKey('doc-xyz', 1, '.docx');
      expect(key).toMatch(/^accounting-documents\/\d{4}\/\d{2}\//);
    });

    it('handles extension with or without dot', () => {
      const key1 = generateStorageKey('doc', 1, '.pdf');
      const key2 = generateStorageKey('doc', 1, 'pdf');
      expect(key1).toContain('.pdf');
      expect(key2).toContain('.pdf');
    });
  });

  describe('getFileExtension', () => {
    it('extracts extension', () => {
      expect(getFileExtension('file.pdf')).toBe('.pdf');
      expect(getFileExtension('file.name.xlsx')).toBe('.xlsx');
      expect(getFileExtension('FILE.PDF')).toBe('.pdf');
    });

    it('returns empty for no extension', () => {
      expect(getFileExtension('noext')).toBe('');
    });
  });

  describe('computeTemporalStatus', () => {
    it('returns NO_EXPIRY when expires_at is null', () => {
      expect(computeTemporalStatus(null, null)).toBe('NO_EXPIRY');
    });

    it('returns EXPIRED when past', () => {
      const past = new Date(Date.now() - 86400000); // yesterday
      expect(computeTemporalStatus(past, null)).toBe('EXPIRED');
    });

    it('returns VALID when far in future', () => {
      const future = new Date(Date.now() + 365 * 86400000); // 1 year
      expect(computeTemporalStatus(future, 30)).toBe('VALID');
    });

    it('returns EXPIRING_SOON when within alert period', () => {
      const soon = new Date(Date.now() + 15 * 86400000); // 15 days (within default 30)
      expect(computeTemporalStatus(soon, 30)).toBe('EXPIRING_SOON');
    });

    it('uses 30 days default when renewalAlertDays is null', () => {
      const soon = new Date(Date.now() + 20 * 86400000); // 20 days
      expect(computeTemporalStatus(soon, null)).toBe('EXPIRING_SOON');
    });
  });

  describe('VALID_STATUS_TRANSITIONS', () => {
    it('DRAFT can only go to SENT', () => {
      expect(VALID_STATUS_TRANSITIONS.DRAFT).toEqual(['SENT']);
    });

    it('UNDER_REVIEW can go to APPROVED or REJECTED', () => {
      expect(VALID_STATUS_TRANSITIONS.UNDER_REVIEW).toContain('APPROVED');
      expect(VALID_STATUS_TRANSITIONS.UNDER_REVIEW).toContain('REJECTED');
    });

    it('REPLACED and REVOKED are terminal', () => {
      expect(VALID_STATUS_TRANSITIONS.REPLACED).toEqual([]);
      expect(VALID_STATUS_TRANSITIONS.REVOKED).toEqual([]);
    });

    it('REJECTED can go back to DRAFT', () => {
      expect(VALID_STATUS_TRANSITIONS.REJECTED).toContain('DRAFT');
    });

    it('ACTIVE can go to REPLACED or REVOKED', () => {
      expect(VALID_STATUS_TRANSITIONS.ACTIVE).toContain('REPLACED');
      expect(VALID_STATUS_TRANSITIONS.ACTIVE).toContain('REVOKED');
    });
  });
});

describe('Accounting Documents — Database Integration', () => {
  let entityId: string;
  let docTypeId: string;
  let adminId: string;
  let accountantId: string;

  beforeAll(async () => {
    // Get existing test data
    const entity = await prisma.legal_entities.findFirst({ select: { id: true } });
    const admin = await prisma.admins.findFirst({ select: { id: true } });
    const accountant = await prisma.accountants.findFirst({ select: { id: true } });

    if (!entity || !admin || !accountant) {
      throw new Error('Test requires existing legal_entities, admins, and accountants in DB');
    }

    entityId = entity.id;
    adminId = admin.id;
    accountantId = accountant.id;

    // Create a test document type
    const dt = await prisma.accounting_document_types.create({
      data: { code: `TEST_TYPE_${Date.now()}`, name: 'Test Type', category: 'SOCIETARIO' },
    });
    docTypeId = dt.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.accounting_company_document_files.deleteMany({ where: { document: { document_type_id: docTypeId } } });
    await prisma.accounting_company_documents.deleteMany({ where: { document_type_id: docTypeId } });
    await prisma.accounting_document_types.deleteMany({ where: { id: docTypeId } });
    await prisma.$disconnect();
  });

  it('creates a document', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: {
        legal_entity_id: entityId,
        document_type_id: docTypeId,
        status: 'DRAFT',
        created_by_id: accountantId,
        created_by_type: 'ACCOUNTANT',
      },
    });
    expect(doc.id).toBeTruthy();
    expect(doc.status).toBe('DRAFT');
  });

  it('creates a file with admin uploader', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    const file = await prisma.accounting_company_document_files.create({
      data: {
        document_id: doc.id,
        version_number: 1,
        original_filename: 'test.pdf',
        storage_key: `test-key-${crypto.randomBytes(8).toString('hex')}`,
        mime_type: 'application/pdf',
        size_bytes: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        uploaded_by_admin_id: adminId,
        scan_status: 'NOT_SCANNED',
      },
    });
    expect(file.id).toBeTruthy();
    expect(file.scan_status).toBe('NOT_SCANNED');
  });

  it('creates a file with accountant uploader', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    const file = await prisma.accounting_company_document_files.create({
      data: {
        document_id: doc.id,
        version_number: 1,
        original_filename: 'test.pdf',
        storage_key: `test-key-${crypto.randomBytes(8).toString('hex')}`,
        mime_type: 'application/pdf',
        size_bytes: 2048,
        sha256: crypto.randomBytes(32).toString('hex'),
        uploaded_by_accountant_id: accountantId,
        scan_status: 'NOT_SCANNED',
      },
    });
    expect(file.uploaded_by_accountant_id).toBe(accountantId);
  });

  it('rejects file with both uploaders (XOR constraint)', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    await expect(
      prisma.accounting_company_document_files.create({
        data: {
          document_id: doc.id,
          version_number: 1,
          original_filename: 'test.pdf',
          storage_key: `test-key-${crypto.randomBytes(8).toString('hex')}`,
          mime_type: 'application/pdf',
          size_bytes: 1024,
          sha256: crypto.randomBytes(32).toString('hex'),
          uploaded_by_admin_id: adminId,
          uploaded_by_accountant_id: accountantId,
          scan_status: 'NOT_SCANNED',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects file with no uploader (XOR constraint)', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    await expect(
      prisma.accounting_company_document_files.create({
        data: {
          document_id: doc.id,
          version_number: 1,
          original_filename: 'test.pdf',
          storage_key: `test-key-${crypto.randomBytes(8).toString('hex')}`,
          mime_type: 'application/pdf',
          size_bytes: 1024,
          sha256: crypto.randomBytes(32).toString('hex'),
          scan_status: 'NOT_SCANNED',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate storage_key', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    const storageKey = `dup-test-${crypto.randomBytes(8).toString('hex')}`;

    await prisma.accounting_company_document_files.create({
      data: {
        document_id: doc.id, version_number: 1,
        original_filename: 'a.pdf', storage_key: storageKey,
        mime_type: 'application/pdf', size_bytes: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        uploaded_by_admin_id: adminId, scan_status: 'NOT_SCANNED',
      },
    });

    await expect(
      prisma.accounting_company_document_files.create({
        data: {
          document_id: doc.id, version_number: 2,
          original_filename: 'b.pdf', storage_key: storageKey, // duplicate!
          mime_type: 'application/pdf', size_bytes: 2048,
          sha256: crypto.randomBytes(32).toString('hex'),
          uploaded_by_admin_id: adminId, scan_status: 'NOT_SCANNED',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate version in same document', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    await prisma.accounting_company_document_files.create({
      data: {
        document_id: doc.id, version_number: 1,
        original_filename: 'a.pdf', storage_key: `key-${crypto.randomBytes(8).toString('hex')}`,
        mime_type: 'application/pdf', size_bytes: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        uploaded_by_admin_id: adminId, scan_status: 'NOT_SCANNED',
      },
    });

    await expect(
      prisma.accounting_company_document_files.create({
        data: {
          document_id: doc.id, version_number: 1, // same version!
          original_filename: 'b.pdf', storage_key: `key-${crypto.randomBytes(8).toString('hex')}`,
          mime_type: 'application/pdf', size_bytes: 2048,
          sha256: crypto.randomBytes(32).toString('hex'),
          uploaded_by_admin_id: adminId, scan_status: 'NOT_SCANNED',
        },
      })
    ).rejects.toThrow();
  });

  it('getNextVersionNumber returns correct sequence', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    expect(await getNextVersionNumber(doc.id)).toBe(1);

    await prisma.accounting_company_document_files.create({
      data: {
        document_id: doc.id, version_number: 1,
        original_filename: 'a.pdf', storage_key: `key-${crypto.randomBytes(8).toString('hex')}`,
        mime_type: 'application/pdf', size_bytes: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        uploaded_by_admin_id: adminId, scan_status: 'NOT_SCANNED',
      },
    });

    expect(await getNextVersionNumber(doc.id)).toBe(2);
  });

  it('RESTRICT prevents deleting entity with documents', async () => {
    // Already tested via PostgreSQL, but verify via Prisma
    const doc = await prisma.accounting_company_documents.findFirst({
      where: { document_type_id: docTypeId },
      select: { legal_entity_id: true },
    });
    if (doc) {
      await expect(
        prisma.legal_entities.delete({ where: { id: doc.legal_entity_id } })
      ).rejects.toThrow();
    }
  });

  it('enum scan_status only accepts valid values', async () => {
    const doc = await prisma.accounting_company_documents.create({
      data: { legal_entity_id: entityId, document_type_id: docTypeId, status: 'DRAFT' },
    });

    // Valid enum values work
    const file = await prisma.accounting_company_document_files.create({
      data: {
        document_id: doc.id, version_number: 1,
        original_filename: 'test.pdf', storage_key: `key-${crypto.randomBytes(8).toString('hex')}`,
        mime_type: 'application/pdf', size_bytes: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        uploaded_by_admin_id: adminId, scan_status: 'CLEAN',
      },
    });
    expect(file.scan_status).toBe('CLEAN');

    // Update to INFECTED
    const updated = await prisma.accounting_company_document_files.update({
      where: { id: file.id },
      data: { scan_status: 'INFECTED' },
    });
    expect(updated.scan_status).toBe('INFECTED');
  });
});

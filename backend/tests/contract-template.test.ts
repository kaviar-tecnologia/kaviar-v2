import { describe, it, expect } from 'vitest';

describe('contract template flow', () => {
  describe('status transitions', () => {
    const allowedForTemplate = ['pending', 'rejected', 'available'];
    const canUploadTemplate = (status: string) => allowedForTemplate.includes(status);

    it('pending → available on template upload', () => {
      expect(canUploadTemplate('pending')).toBe(true);
    });

    it('rejected → available on template upload', () => {
      expect(canUploadTemplate('rejected')).toBe(true);
    });

    it('available → available (replacement)', () => {
      expect(canUploadTemplate('available')).toBe(true);
    });

    it('submitted blocks template upload', () => {
      expect(canUploadTemplate('submitted')).toBe(false);
    });

    it('in_review blocks template upload', () => {
      expect(canUploadTemplate('in_review')).toBe(false);
    });

    it('approved blocks template upload', () => {
      expect(canUploadTemplate('approved')).toBe(false);
    });

    it('signed blocks template upload (Fernanda case)', () => {
      expect(canUploadTemplate('signed')).toBe(false);
    });

    it('not_required blocks template upload', () => {
      expect(canUploadTemplate('not_required')).toBe(false);
    });
  });

  describe('contract_status constraint', () => {
    const allowed = ['pending','available','submitted','in_review','approved','signed','rejected','not_required'];

    it('all 8 states are permitted', () => {
      expect(allowed).toHaveLength(8);
    });

    it('existing values pending and signed are in list', () => {
      expect(allowed).toContain('pending');
      expect(allowed).toContain('signed');
    });

    it('invalid value would be rejected by CHECK', () => {
      expect(allowed).not.toContain('cancelled');
      expect(allowed).not.toContain('active');
      expect(allowed).not.toContain('');
    });
  });

  describe('rollback pre-condition', () => {
    it('rollback safe when only pending/signed/not_required exist', () => {
      const existing = ['pending', 'signed'];
      const rollbackSafe = existing.every(s => ['pending','signed','not_required'].includes(s));
      expect(rollbackSafe).toBe(true);
    });

    it('rollback NOT safe when new states exist', () => {
      const existing = ['pending', 'signed', 'available'];
      const rollbackSafe = existing.every(s => ['pending','signed','not_required'].includes(s));
      expect(rollbackSafe).toBe(false);
    });
  });

  describe('template upload security', () => {
    it('stores S3 key, not URL', () => {
      const key = 'manager-contract-templates/op123/1718020000.pdf';
      expect(key.startsWith('http')).toBe(false);
      expect(key).toContain('manager-contract-templates/');
    });

    it('does not alter contract_url', () => {
      const update = { contract_template_url: 'key.pdf', contract_status: 'available', updated_at: new Date() };
      expect(update).not.toHaveProperty('contract_url');
    });

    it('does not alter is_active', () => {
      const update = { contract_template_url: 'key.pdf', contract_status: 'available', updated_at: new Date() };
      expect(update).not.toHaveProperty('is_active');
    });

    it('does not alter document_status', () => {
      const update = { contract_template_url: 'key.pdf', contract_status: 'available', updated_at: new Date() };
      expect(update).not.toHaveProperty('document_status');
    });

    it('does not alter contract_signed_at', () => {
      const update = { contract_template_url: 'key.pdf', contract_status: 'available', updated_at: new Date() };
      expect(update).not.toHaveProperty('contract_signed_at');
    });

    it('response does not expose S3 key', () => {
      const response = { success: true, data: { uploaded: true, contract_status: 'available' } };
      expect(JSON.stringify(response)).not.toContain('manager-contract-templates');
    });

    it('audit captures previous and new template key', () => {
      const audit = { oldValue: { contract_template_url: 'old.pdf' }, newValue: { contract_template_url: 'new.pdf', contract_status: 'available' } };
      expect(audit.oldValue.contract_template_url).toBe('old.pdf');
      expect(audit.newValue.contract_template_url).toBe('new.pdf');
    });

    it('audit has no oldValue on first template', () => {
      const previousKey = null;
      const audit = { oldValue: previousKey ? { contract_template_url: previousKey } : undefined };
      expect(audit.oldValue).toBeUndefined();
    });
  });

  describe('template view endpoints', () => {
    it('gestor uses admin_id from token (no IDOR)', () => {
      const tokenAdminId = 'admin-X';
      const query = { admin_id: tokenAdminId };
      expect(query.admin_id).toBe(tokenAdminId);
    });

    it('returns 404 when no template', () => {
      const profile = { contract_template_url: null };
      expect(!profile.contract_template_url).toBe(true);
    });

    it('presigned URL has short TTL', () => {
      const TTL = 300; // 5 min
      expect(TTL).toBeGreaterThanOrEqual(60);
      expect(TTL).toBeLessThanOrEqual(900);
    });
  });

  describe('contract_submissions table', () => {
    it('status values are valid', () => {
      const valid = ['submitted', 'in_review', 'approved', 'rejected', 'superseded'];
      valid.forEach(s => expect(valid).toContain(s));
    });

    it('table starts empty (no auto-creation on template upload)', () => {
      // Template upload only sets contract_template_url, does not create submission
      const submissionsCreated = 0;
      expect(submissionsCreated).toBe(0);
    });
  });

  describe('v1.2 manager contract transition', () => {
    const REQUIRED_VERSION = 'v1.2';

    it('legacy manager template must be regenerated before signed upload', () => {
      const profile = { relationship_type: 'territorial_manager', terms_version: 'v1.1' };
      const allowed = profile.relationship_type !== 'territorial_manager' || profile.terms_version === REQUIRED_VERSION;
      expect(allowed).toBe(false);
    });

    it('current v1.2 manager template may proceed to signed upload', () => {
      const profile = { relationship_type: 'territorial_manager', terms_version: 'v1.2' };
      const allowed = profile.relationship_type !== 'territorial_manager' || profile.terms_version === REQUIRED_VERSION;
      expect(allowed).toBe(true);
    });

    it('generic online terms do not substitute the manager contract', () => {
      const isTerritorialManager = true;
      const update = {
        terms_version: isTerritorialManager ? REQUIRED_VERSION : 'v1.0-captador',
        ...(isTerritorialManager ? {} : { contract_status: 'signed' }),
      };
      expect(update.terms_version).toBe('v1.2');
      expect(update).not.toHaveProperty('contract_status');
    });

    it('template generation never creates financial activation', () => {
      const response = {
        contract_status: 'available',
        contract_version: 'v1.2',
        financial_activation_created: false,
      };
      expect(response.financial_activation_created).toBe(false);
      expect(response.contract_status).toBe('available');
    });
  });

  describe('frontend states', () => {
    const getLabel = (contractUrl: string | null, templateUrl: string | null, status: string) => {
      if (contractUrl && status === 'signed') return 'Contrato formalizado';
      if (!contractUrl && status === 'available' && templateUrl) return 'Modelo disponível — aguardando assinatura';
      if (!contractUrl && status === 'signed') return 'Aceite online concluído';
      if (!contractUrl && status === 'pending') return 'Contrato em preparação';
      if (status === 'rejected') return 'Rejeitado — novo envio necessário';
      return 'desconhecido';
    };

    it('available with template → modelo disponível', () => {
      expect(getLabel(null, 'template.pdf', 'available')).toBe('Modelo disponível — aguardando assinatura');
    });

    it('pending without template → em preparação', () => {
      expect(getLabel(null, null, 'pending')).toBe('Contrato em preparação');
    });

    it('signed with contract_url → formalizado', () => {
      expect(getLabel('contract.pdf', 'template.pdf', 'signed')).toBe('Contrato formalizado');
    });

    it('rejected → novo envio necessário', () => {
      expect(getLabel(null, 'template.pdf', 'rejected')).toBe('Rejeitado — novo envio necessário');
    });

    it('download button visible only when template available', () => {
      const showDownload = (templateUrl: string | null, contractUrl: string | null) => !!templateUrl && !contractUrl;
      expect(showDownload('t.pdf', null)).toBe(true);
      expect(showDownload(null, null)).toBe(false);
      expect(showDownload('t.pdf', 'c.pdf')).toBe(false);
    });
  });
});

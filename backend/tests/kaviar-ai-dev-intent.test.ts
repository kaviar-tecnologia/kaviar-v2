import { describe, expect, it } from 'vitest';
import { detectDevelopmentIntent } from '../src/services/ai/kaviar-ai.dev-intent';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

describe('Development Intent Classification & Safety', () => {
  describe('Technical requests detection', () => {
    it('detects technical bug fixes', () => {
      const res = detectDevelopmentIntent('corrigir bug no backend');
      expect(res.isDevIntent).toBe(true);
      expect(res.category).toBe('BUG_FIX');
    });

    it('detects feature requests', () => {
      const res1 = detectDevelopmentIntent('implementar uma feature');
      expect(res1.isDevIntent).toBe(true);
      expect(res1.category).toBe('FEATURE');

      const res2 = detectDevelopmentIntent('criar um endpoint para listagem de motoristas');
      expect(res2.isDevIntent).toBe(true);
      expect(res2.category).toBe('FEATURE');
    });

    it('detects refactoring requests', () => {
      const res = detectDevelopmentIntent('refatorar este serviço de autenticação');
      expect(res.isDevIntent).toBe(true);
      expect(res.category).toBe('REFACTOR');
    });

    it('detects explicit code changes', () => {
      const res1 = detectDevelopmentIntent('alterar o código do frontend');
      expect(res1.isDevIntent).toBe(true);
      expect(res1.category).toBe('CODE_CHANGE');

      const res2 = detectDevelopmentIntent('ajustar o componente React no dashboard');
      expect(res2.isDevIntent).toBe(true);
      expect(res2.category).toBe('CODE_CHANGE');

      const res3 = detectDevelopmentIntent('adicionar um teste unitário para o serviço de frete');
      expect(res3.isDevIntent).toBe(true);
      expect(res3.category).toBe('CODE_CHANGE');
    });

    it('handles uppercase, lowercase, and missing accents correctly (case/accent insensitive)', () => {
      const res1 = detectDevelopmentIntent('CORRIGIR BUG NO BACKEND');
      expect(res1.isDevIntent).toBe(true);
      expect(res1.category).toBe('BUG_FIX');

      const res2 = detectDevelopmentIntent('ALTERAR O CODIGO DO FRONTEND');
      expect(res2.isDevIntent).toBe(true);
      expect(res2.category).toBe('CODE_CHANGE');

      const res3 = detectDevelopmentIntent('REFATORAR ESTE SERVICO');
      expect(res3.isDevIntent).toBe(true);
      expect(res3.category).toBe('REFACTOR');
    });
  });

  describe('Administrative / Operational false positive filtering', () => {
    it('ignores administrative driver registration edit', () => {
      const res = detectDevelopmentIntent('corrigir o cadastro do motorista');
      expect(res.isDevIntent).toBe(false);
    });

    it('ignores operational manager contact edit', () => {
      const res = detectDevelopmentIntent('alterar telefone do gestor');
      expect(res.isDevIntent).toBe(false);
    });

    it('ignores territory creation request', () => {
      const res = detectDevelopmentIntent('criar um território');
      expect(res.isDevIntent).toBe(false);
    });

    it('ignores financial transaction adjustment', () => {
      const res = detectDevelopmentIntent('ajustar um lançamento financeiro');
      expect(res.isDevIntent).toBe(false);
    });

    it('ignores document check request', () => {
      const res = detectDevelopmentIntent('verificar documentos pendentes');
      expect(res.isDevIntent).toBe(false);
    });
  });

  describe('Proposal Security Locks', () => {
    it('always enforces human confirmation and strict security flags', () => {
      const res = detectDevelopmentIntent('corrigir bug no backend');
      expect(res.isDevIntent).toBe(true);
      expect(res.proposal).toBeDefined();

      const proposal = res.proposal!;
      expect(proposal.status).toBe('AWAITING_CONFIRMATION');
      expect(proposal.requiresHumanConfirmation).toBe(true);
      expect(proposal.canMerge).toBe(false);
      expect(proposal.canDeployProduction).toBe(false);
      expect(proposal.canAccessProductionDatabase).toBe(false);
      expect(proposal.jobId).toBeUndefined();
    });
  });

  describe('Service Layer Role & Authorization Integration (askKaviarAi)', () => {
    it('returns development proposal for SUPER_ADMIN when dev intent is detected', async () => {
      const response = await askKaviarAi({
        userId: 'admin-1',
        question: 'corrigir bug no backend',
        role: 'SUPER_ADMIN',
      });

      expect(response.developmentProposal).toBeDefined();
      expect(response.toolsUsed).toEqual([]);
      expect(response.developmentProposal?.status).toBe('AWAITING_CONFIRMATION');
      expect(response.developmentProposal?.requiresHumanConfirmation).toBe(true);
      expect(response.developmentProposal?.canMerge).toBe(false);
      expect(response.developmentProposal?.canDeployProduction).toBe(false);
      expect(response.developmentProposal?.canAccessProductionDatabase).toBe(false);
    });

    it('denies execution and does NOT return a proposal for unauthorized roles (e.g., FINANCE)', async () => {
      const response = await askKaviarAi({
        userId: 'finance-1',
        question: 'corrigir bug no backend',
        role: 'FINANCE',
      });

      expect(response.developmentProposal).toBeUndefined();
      expect(response.answer).toContain('Acesso negado');
      expect(response.toolsUsed).toEqual([]);
    });
  });
});

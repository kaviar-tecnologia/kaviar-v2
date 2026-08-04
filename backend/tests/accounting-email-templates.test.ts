import { describe, it, expect } from 'vitest';
import {
  buildInviteEmail,
  buildReinviteEmail,
  buildPasswordResetEmail,
} from '../src/services/accounting/accounting-email-templates';

describe('accounting-email-templates', () => {
  const inviteParams = {
    nome: 'Maria Silva',
    activationUrl: 'https://admin.kaviar.com.br/contador/ativar#token=abc123xyz',
    adminName: 'João Admin',
    expiresInHours: 48,
  };

  const reinviteParams = {
    nome: 'Maria Silva',
    activationUrl: 'https://admin.kaviar.com.br/contador/ativar#token=def456uvw',
    expiresInHours: 48,
  };

  const resetParams = {
    nome: 'Maria Silva',
    resetUrl: 'https://admin.kaviar.com.br/contador/recuperar#token=rst789ghi',
    expiresInMinutes: 30,
  };

  describe('buildInviteEmail', () => {
    it('should contain button with correct URL', () => {
      const { html } = buildInviteEmail(inviteParams);
      expect(html).toContain(`href="${inviteParams.activationUrl}"`);
    });

    it('should contain accountant name', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      expect(html).toContain('Maria Silva');
      expect(text).toContain('Maria Silva');
    });

    it('should contain admin name', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      expect(html).toContain('João Admin');
      expect(text).toContain('João Admin');
    });

    it('should contain validity period', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      expect(html).toContain('48 horas');
      expect(text).toContain('48 horas');
    });

    it('should NOT contain CPF', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      expect(html).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      expect(html.toLowerCase()).not.toContain('cpf');
      expect(text.toLowerCase()).not.toContain('cpf');
    });

    it('should NOT contain "senha" word', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      expect(html.toLowerCase()).not.toContain('senha');
      expect(text.toLowerCase()).not.toContain('senha');
    });

    it('should NOT contain token separate from link', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      // The token should only appear as part of the URL, never standalone
      const urlPattern = /https:\/\/admin\.kaviar\.com\.br\/contador\/ativar#token=abc123xyz/g;
      // Remove all URLs and check if token still appears
      const htmlWithoutUrls = html.replace(urlPattern, '');
      const textWithoutUrls = text.replace(urlPattern, '');
      expect(htmlWithoutUrls).not.toContain('abc123xyz');
      expect(textWithoutUrls).not.toContain('abc123xyz');
    });

    it('should have valid HTML structure', () => {
      const { html } = buildInviteEmail(inviteParams);
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('text should not contain HTML tags', () => {
      const { text } = buildInviteEmail(inviteParams);
      expect(text).not.toMatch(/<[a-z][^>]*>/i);
    });

    it('should have KAVIAR branding', () => {
      const { html } = buildInviteEmail(inviteParams);
      expect(html).toContain('KAVIAR');
      expect(html).toContain('#B8942E');
    });

    it('should contain ignore notice', () => {
      const { html, text } = buildInviteEmail(inviteParams);
      expect(html).toContain('ignore este email');
      expect(text).toContain('ignore este email');
    });

    it('should contain footer branding', () => {
      const { html } = buildInviteEmail(inviteParams);
      expect(html).toContain('KAVIAR Tecnologia e Serviços Digitais');
    });
  });

  describe('buildReinviteEmail', () => {
    it('should mention link anterior invalidado', () => {
      const { html, text } = buildReinviteEmail(reinviteParams);
      expect(html).toContain('link anterior');
      expect(html).toContain('invalidado');
      expect(text).toContain('link anterior');
      expect(text).toContain('invalidado');
    });

    it('should contain button with URL', () => {
      const { html } = buildReinviteEmail(reinviteParams);
      expect(html).toContain(`href="${reinviteParams.activationUrl}"`);
    });

    it('should contain accountant name', () => {
      const { html, text } = buildReinviteEmail(reinviteParams);
      expect(html).toContain('Maria Silva');
      expect(text).toContain('Maria Silva');
    });

    it('should have valid HTML structure', () => {
      const { html } = buildReinviteEmail(reinviteParams);
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('text should not contain HTML tags', () => {
      const { text } = buildReinviteEmail(reinviteParams);
      expect(text).not.toMatch(/<[a-z][^>]*>/i);
    });

    it('should NOT contain CPF', () => {
      const { html, text } = buildReinviteEmail(reinviteParams);
      expect(html.toLowerCase()).not.toContain('cpf');
      expect(text.toLowerCase()).not.toContain('cpf');
    });

    it('should NOT contain "senha" word', () => {
      const { html, text } = buildReinviteEmail(reinviteParams);
      expect(html.toLowerCase()).not.toContain('senha');
      expect(text.toLowerCase()).not.toContain('senha');
    });

    it('should have KAVIAR branding', () => {
      const { html } = buildReinviteEmail(reinviteParams);
      expect(html).toContain('KAVIAR');
      expect(html).toContain('#B8942E');
    });
  });

  describe('buildPasswordResetEmail', () => {
    it('should mention 30 minutos', () => {
      const { html, text } = buildPasswordResetEmail(resetParams);
      expect(html).toContain('30 minutos');
      expect(text).toContain('30 minutos');
    });

    it('should contain button with reset URL', () => {
      const { html } = buildPasswordResetEmail(resetParams);
      expect(html).toContain(`href="${resetParams.resetUrl}"`);
    });

    it('should contain accountant name', () => {
      const { html, text } = buildPasswordResetEmail(resetParams);
      expect(html).toContain('Maria Silva');
      expect(text).toContain('Maria Silva');
    });

    it('should have valid HTML structure', () => {
      const { html } = buildPasswordResetEmail(resetParams);
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('text should not contain HTML tags', () => {
      const { text } = buildPasswordResetEmail(resetParams);
      expect(text).not.toMatch(/<[a-z][^>]*>/i);
    });

    it('should NOT contain CPF', () => {
      const { html, text } = buildPasswordResetEmail(resetParams);
      expect(html.toLowerCase()).not.toContain('cpf');
      expect(text.toLowerCase()).not.toContain('cpf');
    });

    it('should have KAVIAR branding', () => {
      const { html } = buildPasswordResetEmail(resetParams);
      expect(html).toContain('KAVIAR');
      expect(html).toContain('#B8942E');
    });

    it('should contain ignore notice', () => {
      const { html, text } = buildPasswordResetEmail(resetParams);
      expect(html.toLowerCase()).toContain('não solicitou');
      expect(text.toLowerCase()).toContain('não solicitou');
    });

    it('should NOT contain token separate from link', () => {
      const { html, text } = buildPasswordResetEmail(resetParams);
      const urlPattern = /https:\/\/admin\.kaviar\.com\.br\/contador\/recuperar#token=rst789ghi/;
      const htmlWithoutUrls = html.replace(new RegExp(urlPattern, 'g'), '');
      const textWithoutUrls = text.replace(urlPattern, '');
      expect(htmlWithoutUrls).not.toContain('rst789ghi');
      expect(textWithoutUrls).not.toContain('rst789ghi');
    });

    it('should contain footer branding', () => {
      const { html, text } = buildPasswordResetEmail(resetParams);
      expect(html).toContain('KAVIAR Tecnologia e Serviços Digitais');
      expect(text).toContain('KAVIAR Tecnologia e Serviços Digitais');
    });
  });
});

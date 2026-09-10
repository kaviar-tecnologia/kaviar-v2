import { describe, expect, it } from 'vitest';
import {
  normalizeOptionalArPlacePhone,
  normalizeOptionalInstagramProfileUrl,
  normalizeOptionalWebsiteUrl,
} from '../src/services/ar-places/ar-place-contact-normalization';

describe('ar place contact normalization', () => {
  it('normaliza celular BR sem +55', () => {
    expect(normalizeOptionalArPlacePhone('(21) 99999-9999')).toBe('+5521999999999');
  });

  it('normaliza fixo BR válido', () => {
    expect(normalizeOptionalArPlacePhone('21 3333-4444')).toBe('+552133334444');
  });

  it('preserva E.164 internacional explícito', () => {
    expect(normalizeOptionalArPlacePhone('+1 (415) 555-0101')).toBe('+14155550101');
  });

  it('rejeita número inválido', () => {
    expect(() => normalizeOptionalArPlacePhone('12345')).toThrow(
      'Telefone/WhatsApp inválido. Use E.164 com +DDI ou um número brasileiro com DDD válido.',
    );
  });

  it('blank vira null', () => {
    expect(normalizeOptionalArPlacePhone('   ')).toBeNull();
    expect(normalizeOptionalWebsiteUrl('   ')).toBeNull();
    expect(normalizeOptionalInstagramProfileUrl('   ')).toBeNull();
  });

  it('aceita website http e https válidos', () => {
    expect(normalizeOptionalWebsiteUrl('http://example.com/cardapio')).toBe('http://example.com/cardapio');
    expect(normalizeOptionalWebsiteUrl('https://example.com')).toBe('https://example.com/');
  });

  it('rejeita website com protocolo inválido', () => {
    expect(() => normalizeOptionalWebsiteUrl('ftp://example.com')).toThrow(
      'Site inválido. Use apenas URLs http ou https.',
    );
  });

  it('aceita perfil válido do Instagram', () => {
    expect(normalizeOptionalInstagramProfileUrl('https://instagram.com/bar.do_halfe')).toBe(
      'https://www.instagram.com/bar.do_halfe/',
    );
  });

  it('rejeita URLs não relacionadas a perfil do Instagram', () => {
    expect(() => normalizeOptionalInstagramProfileUrl('https://www.instagram.com/p/abc123/')).toThrow(
      'Instagram inválido. Informe apenas a URL do perfil.',
    );
    expect(() => normalizeOptionalInstagramProfileUrl('https://www.instagram.com/reel/abc123/')).toThrow(
      'Instagram inválido. Informe apenas a URL do perfil.',
    );
    expect(() => normalizeOptionalInstagramProfileUrl('https://www.instagram.com/stories/foo/1/')).toThrow(
      'Instagram inválido. Informe apenas a URL do perfil.',
    );
    expect(() => normalizeOptionalInstagramProfileUrl('https://www.instagram.com/explore/')).toThrow(
      'Instagram inválido. Informe apenas a URL do perfil.',
    );
  });
});

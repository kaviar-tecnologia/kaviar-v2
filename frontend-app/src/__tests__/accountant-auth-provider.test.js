import { describe, it, expect } from 'vitest';
import { sanitizeAccountantReturnTo } from '../src/utils/sanitizeReturnTo';

describe('sanitizeAccountantReturnTo', () => {
  it('accepts /contador', () => expect(sanitizeAccountantReturnTo('/contador')).toBe('/contador'));
  it('accepts /contador/perfil', () => expect(sanitizeAccountantReturnTo('/contador/perfil')).toBe('/contador/perfil'));
  it('accepts /contador/documentos', () => expect(sanitizeAccountantReturnTo('/contador/documentos')).toBe('/contador/documentos'));
  it('rejects absolute URL', () => expect(sanitizeAccountantReturnTo('https://evil.com')).toBe('/contador'));
  it('rejects protocol-relative', () => expect(sanitizeAccountantReturnTo('//evil.com')).toBe('/contador'));
  it('rejects backslash', () => expect(sanitizeAccountantReturnTo('\\evil.com')).toBe('/contador'));
  it('rejects /admin', () => expect(sanitizeAccountantReturnTo('/admin')).toBe('/contador'));
  it('rejects /admin/financeiro', () => expect(sanitizeAccountantReturnTo('/admin/financeiro')).toBe('/contador'));
  it('rejects javascript:', () => expect(sanitizeAccountantReturnTo('javascript:alert(1)')).toBe('/contador'));
  it('rejects encoded //', () => expect(sanitizeAccountantReturnTo('%2F%2Fevil.com')).toBe('/contador'));
  it('rejects null', () => expect(sanitizeAccountantReturnTo(null)).toBe('/contador'));
  it('rejects empty', () => expect(sanitizeAccountantReturnTo('')).toBe('/contador'));
  it('rejects root /', () => expect(sanitizeAccountantReturnTo('/')).toBe('/contador'));
  it('rejects data:', () => expect(sanitizeAccountantReturnTo('data:text/html,<h1>x</h1>')).toBe('/contador'));
});

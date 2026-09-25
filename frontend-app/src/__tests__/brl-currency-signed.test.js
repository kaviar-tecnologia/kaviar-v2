import { describe, expect, it } from 'vitest';
import { formatCentsStringToBRL } from '../utils/brlCurrency';

describe('BRL formatter — signed financial results', () => {
  it('formats negative cents without losing the financial result', () => {
    expect(formatCentsStringToBRL('-312340')).toBe('R$ -3.123,40');
  });

  it('keeps positive and zero values unchanged', () => {
    expect(formatCentsStringToBRL('312340')).toBe('R$ 3.123,40');
    expect(formatCentsStringToBRL('0')).toBe('R$ 0,00');
  });

  it('does not render a negative zero', () => {
    expect(formatCentsStringToBRL('-0')).toBe('R$ 0,00');
  });

  it('rejects malformed signed money strings', () => {
    expect(formatCentsStringToBRL('--100')).toBe('—');
    expect(formatCentsStringToBRL('-10.00')).toBe('—');
  });
});

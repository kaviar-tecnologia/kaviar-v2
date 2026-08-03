/**
 * BRL Currency Utilities — String/BigInt only, no float arithmetic
 *
 * parseBRLToCentsString("150,00") → "15000"
 * formatCentsStringToBRL("15000") → "R$ 150,00"
 */

/**
 * Parse a BRL-formatted value to cents string.
 * Accepts: "150,00", "1.234,56", "0,01", "15000,00"
 * Rejects: zero, negative, letters, >2 decimal places, empty
 */
export function parseBRLToCentsString(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Remove thousand separators (dots), keep comma as decimal
  const withoutThousands = trimmed.replace(/\./g, '');

  // Split on comma
  const parts = withoutThousands.split(',');
  if (parts.length > 2) return null;

  const intPart = parts[0];
  const fracPart = parts.length === 2 ? parts[1] : '';

  // Validate: only digits in each part
  if (!/^\d+$/.test(intPart)) return null;
  if (fracPart && !/^\d{1,2}$/.test(fracPart)) return null;

  // Pad fractional to exactly 2 digits
  const paddedFrac = fracPart.padEnd(2, '0');

  // Combine: intPart + paddedFrac = cents
  const centsStr = intPart + paddedFrac;

  // Remove leading zeros
  const normalized = centsStr.replace(/^0+/, '') || '0';

  // Reject zero
  if (normalized === '0') return null;

  // Validate within BigInt range (safety)
  try {
    const n = BigInt(normalized);
    if (n <= BigInt(0)) return null;
    if (n > BigInt('9223372036854775807')) return null;
  } catch {
    return null;
  }

  return normalized;
}

/**
 * Format a cents string to BRL display.
 * "15000" → "R$ 150,00"
 * "1" → "R$ 0,01"
 * Uses only string operations.
 */
export function formatCentsStringToBRL(cents: string | null | undefined): string {
  if (cents == null || cents === '') return '—';
  const str = String(cents).trim();
  if (!/^\d+$/.test(str)) return '—';

  // Pad to at least 3 chars (so we always have int + 2 frac)
  const padded = str.padStart(3, '0');
  const intPart = padded.slice(0, -2) || '0';
  const fracPart = padded.slice(-2);

  // Remove leading zeros from intPart but keep at least one
  const cleanInt = intPart.replace(/^0+/, '') || '0';

  // Add thousands separator
  const withSep = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `R$ ${withSep},${fracPart}`;
}

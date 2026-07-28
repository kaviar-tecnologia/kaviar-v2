/**
 * Extracts the program year from a Date using America/Sao_Paulo timezone.
 *
 * Critical for year-boundary correctness:
 * - 2027-01-01T01:30:00Z → 31/12/2026 22:30 BRT → programYear 2026
 * - 2027-01-01T03:30:00Z → 01/01/2027 00:30 BRT → programYear 2027
 */
export function getProgramYearBrazil(date: Date): number {
  // Format the date in America/Sao_Paulo timezone and extract the year
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  });
  return parseInt(formatter.format(date), 10);
}

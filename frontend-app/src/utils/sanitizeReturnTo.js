/**
 * Sanitize returnTo parameter to prevent open redirect attacks.
 * Only allows paths starting with /contador.
 */
export function sanitizeAccountantReturnTo(value) {
  if (!value || typeof value !== 'string') return '/contador';
  
  const trimmed = value.trim();
  
  // Reject absolute URLs, protocols, double slashes, backslashes
  if (
    trimmed.includes('://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('%2F%2F') ||
    trimmed.includes('%2f%2f') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:') ||
    !trimmed.startsWith('/contador')
  ) {
    return '/contador';
  }
  
  // Reject paths to /admin
  if (trimmed.startsWith('/admin')) return '/contador';
  
  // Must start with /contador
  if (!trimmed.startsWith('/contador')) return '/contador';
  
  return trimmed;
}

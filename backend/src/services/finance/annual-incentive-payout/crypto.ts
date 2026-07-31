/**
 * Cryptographic utilities for payout destination data.
 *
 * - Encrypt: AES-256-GCM with random IV per ciphertext (recoverable value)
 * - Hash: HMAC-SHA-256 with independent key (deterministic comparison)
 * - Mask: CPF → ***.***.***-XX
 *
 * Key management:
 * - ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY — 64-char hex (256 bits) for AES-256-GCM
 * - ANNUAL_INCENTIVE_PAYOUT_HASH_KEY — 64-char hex (256 bits) for HMAC-SHA-256
 * - ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION — integer version (stored with ciphertext)
 *
 * NEVER log plaintext PIX key or full CPF.
 * NEVER generate keys at runtime.
 * NEVER use hardcoded secrets.
 * NEVER reuse DATABASE_URL, JWT secret, or SumUp API key.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

// ─── Key Access ──────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error(
      'ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY must be a 64-char hex string (256 bits). ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex.slice(0, 64), 'hex');
}

function getHmacKey(): Buffer {
  const keyHex = process.env.ANNUAL_INCENTIVE_PAYOUT_HASH_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error(
      'ANNUAL_INCENTIVE_PAYOUT_HASH_KEY must be a 64-char hex string (256 bits). ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex.slice(0, 64), 'hex');
}

function getKeyVersion(): string {
  const version = process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION;
  if (!version || !/^\d+$/.test(version)) {
    throw new Error(
      'ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION must be a positive integer string (e.g. "1")'
    );
  }
  return version;
}

// ─── Encryption (AES-256-GCM) ────────────────────────────────────────────────

/**
 * Encrypts a plaintext value using AES-256-GCM.
 * Output format: v<version>:<base64(IV + ciphertext + authTag)>
 */
export function encryptPayoutSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const version = getKeyVersion();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: IV (12) + ciphertext (variable) + authTag (16)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return `v${version}:${combined.toString('base64')}`;
}

/**
 * Decrypts a value encrypted by encryptPayoutSecret.
 * Accepts format: v<version>:<base64> or raw base64 (legacy)
 */
export function decryptPayoutSecret(ciphertext: string): string {
  const key = getEncryptionKey();

  let payload: string;
  if (ciphertext.startsWith('v') && ciphertext.includes(':')) {
    // Versioned format: v1:<base64>
    payload = ciphertext.split(':').slice(1).join(':');
  } else {
    // Legacy unversioned format
    payload = ciphertext;
  }

  const combined = Buffer.from(payload, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('PAYOUT_DECRYPT_INVALID_FORMAT: ciphertext too short');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// ─── HMAC (deterministic comparison) ─────────────────────────────────────────

/**
 * HMAC-SHA-256 for deterministic comparison without decryption.
 * Uses independent HASH_KEY (not the encryption key).
 * Domain-prefixed to prevent cross-purpose collisions.
 */
export function hmacPayoutValue(value: string): string {
  const key = getHmacKey();
  return createHmac('sha256', key)
    .update('kaviar:payout_destination:')
    .update(value)
    .digest('hex');
}

/**
 * @deprecated Use hmacPayoutValue instead. Kept for backward compatibility alias.
 */
export const hashPayoutValue = hmacPayoutValue;

// ─── Masking ─────────────────────────────────────────────────────────────────

/**
 * Masks a CPF for safe display: ***.***.***-XX
 */
export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.***.*${digits[8]}${digits[9]}-${digits[9]}${digits[10]}`;
}

// ─── CPF Utilities ───────────────────────────────────────────────────────────

/**
 * Normalizes a CPF: removes all non-digit characters.
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Validates CPF format (11 digits, not all same, valid check digits).
 */
export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;

  return true;
}

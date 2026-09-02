import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;

// Top 20 most common passwords (expandable later)
const COMMON_PASSWORDS = [
  'password123456789',
  '123456789012345',
  'qwertyuiopasdfg',
  'admin123456789a',
  'letmein123456789',
  'welcome123456789',
  'monkey1234567890',
  'dragon1234567890',
  'master1234567890',
  'login12345678901',
  'princess12345678',
  'abc123456789012',
  'password12345678',
  'shadow1234567890',
  'sunshine12345678',
  'trustno123456789',
  'iloveyou12345678',
  'batman1234567890',
  'access1234567890',
  'hello12345678901',
];

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string, email?: string, cpf?: string | null): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    errors.push('Senha é obrigatória');
    return { valid: false, errors };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres`);
  }

  // Block if equals email
  if (email && password.toLowerCase() === email.toLowerCase()) {
    errors.push('Senha não pode ser igual ao email');
  }

  // Block if equals CPF (digits only)
  if (cpf) {
    const cpfDigits = cpf.replace(/\D/g, '');
    if (password === cpfDigits || password === cpf) {
      errors.push('Senha não pode ser igual ao CPF');
    }
  }

  // Block common passwords
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    errors.push('Senha muito comum. Escolha uma senha mais segura');
  }

  return { valid: errors.length === 0, errors };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

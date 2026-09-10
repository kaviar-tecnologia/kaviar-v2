const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const BRAZILIAN_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46',
  '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64',
  '65', '66', '67',
  '68', '69',
  '71', '73', '74', '75', '77',
  '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);
const RESERVED_INSTAGRAM_PATHS = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'accounts',
  'about',
  'developer',
  'directory',
]);

function trimToNull(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizePhoneLikeInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Telefone/WhatsApp inválido');
  }
  const plusCount = (trimmed.match(/\+/g) || []).length;
  if (plusCount > 1 || (plusCount === 1 && !trimmed.startsWith('+'))) {
    throw new Error('Telefone/WhatsApp inválido. Use apenas um + no início quando informar DDI.');
  }
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  if (!cleaned) {
    throw new Error('Telefone/WhatsApp inválido');
  }
  return cleaned;
}

function normalizeBrazilianNationalNumber(digits: string) {
  if (!(digits.length === 10 || digits.length === 11)) {
    throw new Error(
      'Telefone/WhatsApp inválido. Use E.164 com +DDI ou um número brasileiro com DDD válido.',
    );
  }

  const ddd = digits.slice(0, 2);
  if (!BRAZILIAN_DDDS.has(ddd)) {
    throw new Error(
      'Telefone/WhatsApp inválido. DDD brasileiro não reconhecido; para números internacionais informe +DDI.',
    );
  }

  const subscriber = digits.slice(2);
  if (subscriber.length === 9) {
    if (!subscriber.startsWith('9')) {
      throw new Error(
        'Celular brasileiro inválido. Para números nacionais use DDD + número móvel iniciado por 9.',
      );
    }
    return `+55${digits}`;
  }

  if (!/^[2-5]\d{7}$/.test(subscriber)) {
    throw new Error(
      'Telefone fixo brasileiro inválido. Para números nacionais use DDD + número fixo plausível.',
    );
  }

  return `+55${digits}`;
}

function normalizeUrl(value: string, fieldLabel: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldLabel} inválido. Informe uma URL absoluta.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldLabel} inválido. Use apenas URLs http ou https.`);
  }

  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}

export function normalizeOptionalArPlacePhone(value: string | null | undefined) {
  const trimmed = trimToNull(value);
  if (trimmed === null) return null;

  const cleaned = sanitizePhoneLikeInput(trimmed);
  if (cleaned.startsWith('+')) {
    if (!E164_REGEX.test(cleaned)) {
      throw new Error(
        'Telefone/WhatsApp inválido. Quando informar DDI, use o formato +<digits> com 8 a 15 dígitos.',
      );
    }
    return cleaned;
  }

  return normalizeBrazilianNationalNumber(cleaned);
}

export function normalizeOptionalWebsiteUrl(value: string | null | undefined) {
  const trimmed = trimToNull(value);
  if (trimmed === null) return null;
  return normalizeUrl(trimmed, 'Site');
}

export function normalizeOptionalInstagramProfileUrl(value: string | null | undefined) {
  const trimmed = trimToNull(value);
  if (trimmed === null) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Instagram inválido. Informe uma URL absoluta HTTPS de perfil.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Instagram inválido. Use uma URL HTTPS de perfil.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') {
    throw new Error('Instagram inválido. Use apenas URLs de perfil do Instagram.');
  }

  const rawSegments = parsed.pathname.split('/').filter(Boolean);
  if (rawSegments.length !== 1) {
    throw new Error('Instagram inválido. Informe apenas a URL do perfil.');
  }

  const handle = rawSegments[0];
  if (RESERVED_INSTAGRAM_PATHS.has(handle.toLowerCase())) {
    throw new Error('Instagram inválido. Informe apenas a URL do perfil.');
  }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    throw new Error('Instagram inválido. O perfil informado não é válido.');
  }

  return `https://www.instagram.com/${handle}/`;
}

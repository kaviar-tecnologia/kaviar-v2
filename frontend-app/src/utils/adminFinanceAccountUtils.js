export const ACCOUNT_TYPE_OPTIONS = [
  'BANK',
  'CASH',
  'PIX_WALLET',
  'RECEIVABLE',
  'PAYABLE',
  'TAX',
  'CLEARING',
  'THIRD_PARTY',
  'INTERNAL',
  'ESCROW',
];

export const ACCOUNT_TYPE_LABELS = {
  BANK: 'BANK',
  CASH: 'CASH',
  PIX_WALLET: 'PIX_WALLET',
  RECEIVABLE: 'RECEIVABLE',
  PAYABLE: 'PAYABLE',
  TAX: 'TAX',
  CLEARING: 'CLEARING',
  THIRD_PARTY: 'THIRD_PARTY',
  INTERNAL: 'INTERNAL',
  ESCROW: 'Conta de garantia (escrow)',
};

export const getAccountTypeLabel = (value) => ACCOUNT_TYPE_LABELS[value] || value;

export const ACCOUNT_STRUCTURAL_FIELDS = [
  'code',
  'type',
  'currency',
  'opening_balance_cents',
  'opening_balance_date',
  'legal_entity_id',
];

export const ACCOUNT_FUNCTIONAL_FIELDS = [
  'name',
  'institution_name',
  'bank_code',
  'allows_negative_balance',
  'is_cash_equivalent',
  'is_active',
  'notes',
];

export const BANK_CODE_MAX_LENGTH = 20;

const moneyInvalidTokens = ['NaN', 'Infinity'];

const defaultFormValues = {
  code: '',
  name: '',
  type: 'BANK',
  legal_entity_id: '',
  currency: 'BRL',
  institution_name: '',
  bank_code: '',
  opening_balance_input: '',
  opening_balance_date: '',
  notes: '',
  allows_negative_balance: false,
  is_cash_equivalent: false,
  is_active: true,
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const toUpperTrimmed = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const toNullableTrimmedString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const stripLeadingZeros = (digits) => {
  const normalized = digits.replace(/^0+(?=\d)/, '');
  return normalized || '0';
};

const normalizeSignedIntegerString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;

  const negative = trimmed.startsWith('-');
  const digits = stripLeadingZeros(negative ? trimmed.slice(1) : trimmed);
  if (digits === '0') return '0';
  return negative ? `-${digits}` : digits;
};

const parseMoneyInput = (value) => {
  if (value === null || value === undefined) {
    return { isValid: true, isEmpty: true, normalized: '', centsString: null, isNegative: false };
  }

  const raw = String(value).trim();
  if (!raw) {
    return { isValid: true, isEmpty: true, normalized: '', centsString: null, isNegative: false };
  }

  if (/\s/.test(raw)) {
    return { isValid: false, reason: 'Formato monetário inválido.' };
  }

  if (moneyInvalidTokens.some((token) => raw.toLowerCase() === token.toLowerCase())) {
    return { isValid: false, reason: 'Formato monetário inválido.' };
  }

  if (raw.includes('+') || raw.includes('e') || raw.includes('E') || raw.includes('--')) {
    return { isValid: false, reason: 'Formato monetário inválido.' };
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  if (!unsigned || unsigned.includes('-')) {
    return { isValid: false, reason: 'Formato monetário inválido.' };
  }

  let integerDigits = '';
  let decimalDigits = '';

  if (unsigned.includes('.') && unsigned.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(unsigned)) {
      return { isValid: false, reason: 'Formato monetário inválido.' };
    }

    const [integerPart, decimalPart = ''] = unsigned.split(',');
    integerDigits = integerPart.replace(/\./g, '');
    decimalDigits = decimalPart;
  } else if (unsigned.includes(',')) {
    if (!/^\d+(,\d{1,2})?$/.test(unsigned)) {
      return { isValid: false, reason: 'Formato monetário inválido.' };
    }

    const [integerPart, decimalPart = ''] = unsigned.split(',');
    integerDigits = integerPart;
    decimalDigits = decimalPart;
  } else if (unsigned.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(unsigned)) {
      return { isValid: false, reason: 'Formato monetário inválido.' };
    }

    integerDigits = unsigned.replace(/\./g, '');
  } else {
    if (!/^\d+$/.test(unsigned)) {
      return { isValid: false, reason: 'Formato monetário inválido.' };
    }

    integerDigits = unsigned;
  }

  if (decimalDigits.length > 2) {
    return { isValid: false, reason: 'Formato monetário inválido.' };
  }

  const normalizedInteger = stripLeadingZeros(integerDigits);
  const paddedDecimals = (decimalDigits || '').padEnd(2, '0');
  const absoluteCents = stripLeadingZeros(`${normalizedInteger}${paddedDecimals || '00'}`);
  const centsString = absoluteCents === '0' ? '0' : negative ? `-${absoluteCents}` : absoluteCents;
  const normalized = `${negative && absoluteCents !== '0' ? '-' : ''}${normalizedInteger}${decimalDigits ? `,${decimalDigits}` : ''}`;

  return {
    isValid: true,
    isEmpty: false,
    normalized,
    centsString,
    isNegative: centsString.startsWith('-'),
  };
};

const formatThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const sanitizeCreatePayload = (payload) => {
  const nextPayload = { ...payload };

  ['institution_name', 'bank_code', 'opening_balance_date', 'notes'].forEach((key) => {
    if (nextPayload[key] === null || nextPayload[key] === undefined || nextPayload[key] === '') {
      delete nextPayload[key];
    }
  });

  if (nextPayload.opening_balance_cents === null || nextPayload.opening_balance_cents === undefined) {
    delete nextPayload.opening_balance_cents;
  }

  Object.keys(nextPayload).forEach((key) => {
    if (nextPayload[key] === undefined) {
      delete nextPayload[key];
    }
  });

  return nextPayload;
};

export const normalizeMoneyInput = (value) => {
  const parsed = parseMoneyInput(value);
  if (!parsed.isValid) return null;
  return parsed.normalized;
};

export const convertReaisInputToCentsString = (value) => {
  const parsed = parseMoneyInput(value);
  if (!parsed.isValid || parsed.isEmpty) return null;
  return parsed.centsString;
};

export const formatCentsStringToDisplayReais = (value) => {
  if (value === null || value === undefined || value === '') return '';

  const normalized = normalizeSignedIntegerString(String(value));
  if (!normalized) return '';

  const negative = normalized.startsWith('-');
  const absoluteDigits = negative ? normalized.slice(1) : normalized;
  const padded = absoluteDigits.padStart(3, '0');
  const integerDigits = stripLeadingZeros(padded.slice(0, -2));
  const decimalDigits = padded.slice(-2);
  const formattedInteger = formatThousands(integerDigits);

  if (absoluteDigits === '0') return '0,00';
  return `${negative ? '-' : ''}${formattedInteger},${decimalDigits}`;
};

export const isNegativeCentsString = (value) => {
  const normalized = normalizeSignedIntegerString(String(value || ''));
  return Boolean(normalized && normalized.startsWith('-'));
};

export const isValidIsoDateInput = (value) => {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const [yearRaw, monthRaw, dayRaw] = trimmed.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;

  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (leapYear) monthLengths[1] = 29;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= monthLengths[month - 1];
};

export const normalizeIsoDateValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isValidIsoDateInput(trimmed)) return trimmed;

  const dateOnlyCandidate = trimmed.slice(0, 10);
  return isValidIsoDateInput(dateOnlyCandidate) ? dateOnlyCandidate : null;
};

const toComparableAccountState = (accountOrValues = {}) => {
  const openingBalanceSource = hasOwn(accountOrValues, 'opening_balance_input')
    ? accountOrValues.opening_balance_input
    : formatCentsStringToDisplayReais(accountOrValues.opening_balance_cents);
  const openingBalanceParsed = parseMoneyInput(openingBalanceSource);

  return {
    code: toUpperTrimmed(accountOrValues.code),
    name: typeof accountOrValues.name === 'string' ? accountOrValues.name.trim() : '',
    type: accountOrValues.type || 'BANK',
    legal_entity_id: toNullableTrimmedString(accountOrValues.legal_entity_id),
    currency: toUpperTrimmed(accountOrValues.currency || 'BRL'),
    institution_name: toNullableTrimmedString(accountOrValues.institution_name),
    bank_code: toNullableTrimmedString(accountOrValues.bank_code),
    opening_balance_cents: openingBalanceParsed.isValid ? openingBalanceParsed.centsString : null,
    opening_balance_date: normalizeIsoDateValue(accountOrValues.opening_balance_date),
    notes: toNullableTrimmedString(accountOrValues.notes),
    allows_negative_balance: Boolean(accountOrValues.allows_negative_balance),
    is_cash_equivalent: Boolean(accountOrValues.is_cash_equivalent),
    is_active: Boolean(accountOrValues.is_active),
  };
};

export const getAccountFormValues = (account = null) => {
  if (!account) return { ...defaultFormValues };

  return {
    code: account.code || '',
    name: account.name || '',
    type: account.type || 'BANK',
    legal_entity_id: account.legal_entity_id || '',
    currency: account.currency || 'BRL',
    institution_name: account.institution_name || '',
    bank_code: account.bank_code || '',
    opening_balance_input: formatCentsStringToDisplayReais(account.opening_balance_cents),
    opening_balance_date: normalizeIsoDateValue(account.opening_balance_date) || '',
    notes: account.notes || '',
    allows_negative_balance: Boolean(account.allows_negative_balance),
    is_cash_equivalent: Boolean(account.is_cash_equivalent),
    is_active: Boolean(account.is_active),
  };
};

export const validateAccountFormValues = (formValues, { mode = 'create', canEditStructuralFields = true } = {}) => {
  const fieldErrors = {};
  const parsedOpeningBalance = parseMoneyInput(formValues.opening_balance_input);
  const bankCode = toNullableTrimmedString(formValues.bank_code);

  if (!toUpperTrimmed(formValues.code)) {
    fieldErrors.code = 'Informe o código da conta.';
  } else if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(toUpperTrimmed(formValues.code))) {
    fieldErrors.code = 'Use apenas letras, números, ponto, underline ou hífen.';
  }

  if (!(typeof formValues.name === 'string' && formValues.name.trim())) {
    fieldErrors.name = 'Informe o nome da conta.';
  }

  if (!ACCOUNT_TYPE_OPTIONS.includes(formValues.type)) {
    fieldErrors.type = 'Selecione um tipo de conta válido.';
  }

  if (!formValues.legal_entity_id) {
    fieldErrors.legal_entity_id = 'Selecione a empresa/filial titular da conta.';
  }

  if (!/^[A-Z]{3}$/.test(toUpperTrimmed(formValues.currency))) {
    fieldErrors.currency = 'Informe uma moeda com 3 letras.';
  }

  if (bankCode && bankCode.length > BANK_CODE_MAX_LENGTH) {
    fieldErrors.bank_code = `Use no máximo ${BANK_CODE_MAX_LENGTH} caracteres.`;
  }

  if (!parsedOpeningBalance.isValid) {
    fieldErrors.opening_balance_input = 'Informe um saldo inicial válido.';
  }

  if (mode === 'edit' && canEditStructuralFields && String(formValues.opening_balance_input || '').trim() === '') {
    fieldErrors.opening_balance_input = 'Informe um saldo inicial válido.';
  }

  if (
    parsedOpeningBalance.isValid &&
    parsedOpeningBalance.centsString &&
    parsedOpeningBalance.centsString.startsWith('-') &&
    !formValues.allows_negative_balance
  ) {
    fieldErrors.opening_balance_input = 'Saldo negativo exige a opção "Permite saldo negativo".';
    fieldErrors.allows_negative_balance = 'Ative a permissão para manter saldo inicial negativo.';
  }

  if (!isValidIsoDateInput(formValues.opening_balance_date)) {
    fieldErrors.opening_balance_date = 'Informe uma data válida em YYYY-MM-DD.';
  }

  if (!canEditStructuralFields && mode === 'edit') {
    ACCOUNT_STRUCTURAL_FIELDS.forEach((field) => {
      if (field in fieldErrors) delete fieldErrors[field];
    });
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
};

export const buildCreateAccountPayload = (formValues) => {
  const parsedOpeningBalance = parseMoneyInput(formValues.opening_balance_input);

  const payload = {
    code: toUpperTrimmed(formValues.code),
    name: formValues.name.trim(),
    type: formValues.type,
    legal_entity_id: toNullableTrimmedString(formValues.legal_entity_id),
    currency: toUpperTrimmed(formValues.currency),
    institution_name: toNullableTrimmedString(formValues.institution_name),
    bank_code: toNullableTrimmedString(formValues.bank_code),
    opening_balance_cents: parsedOpeningBalance.isValid ? parsedOpeningBalance.centsString : null,
    opening_balance_date: normalizeIsoDateValue(formValues.opening_balance_date),
    allows_negative_balance: Boolean(formValues.allows_negative_balance),
    is_cash_equivalent: Boolean(formValues.is_cash_equivalent),
    is_active: Boolean(formValues.is_active),
    notes: toNullableTrimmedString(formValues.notes),
  };

  return sanitizeCreatePayload(payload);
};

export const buildUpdateAccountPayload = (formValues, originalAccount, options = {}) => {
  const { isSuperAdmin = false } = options;
  const current = toComparableAccountState(originalAccount);
  const next = toComparableAccountState(formValues);
  const payload = {
    expected_updated_at: originalAccount.updated_at,
  };
  const allowedFields = isSuperAdmin
    ? [...ACCOUNT_STRUCTURAL_FIELDS, ...ACCOUNT_FUNCTIONAL_FIELDS]
    : [...ACCOUNT_FUNCTIONAL_FIELDS];

  const assignIfChanged = (key, nextValue, currentValue) => {
    if (!allowedFields.includes(key)) return;
    if (nextValue !== currentValue) {
      payload[key] = nextValue;
    }
  };

  assignIfChanged('code', next.code, current.code);
  assignIfChanged('name', next.name, current.name);
  assignIfChanged('type', next.type, current.type);
  assignIfChanged('legal_entity_id', next.legal_entity_id, current.legal_entity_id);
  assignIfChanged('currency', next.currency, current.currency);
  assignIfChanged('institution_name', next.institution_name, current.institution_name);
  assignIfChanged('bank_code', next.bank_code, current.bank_code);
  assignIfChanged('opening_balance_date', next.opening_balance_date, current.opening_balance_date);
  assignIfChanged('allows_negative_balance', next.allows_negative_balance, current.allows_negative_balance);
  assignIfChanged('is_cash_equivalent', next.is_cash_equivalent, current.is_cash_equivalent);
  assignIfChanged('is_active', next.is_active, current.is_active);
  assignIfChanged('notes', next.notes, current.notes);

  if (isSuperAdmin && next.opening_balance_cents !== current.opening_balance_cents && next.opening_balance_cents !== null) {
    payload.opening_balance_cents = next.opening_balance_cents;
  }

  return payload;
};

export const buildAccountStatusPatchPayload = (account, nextIsActive) => {
  return {
    is_active: Boolean(nextIsActive),
    expected_updated_at: account.updated_at,
  };
};

export const hasAccountChanges = (payload) => {
  return Object.keys(payload).some((key) => key !== 'expected_updated_at');
};

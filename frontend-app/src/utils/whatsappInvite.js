export const DRIVER_APK_URL = 'https://play.google.com/store/apps/details?id=com.kaviar.driver';
export const PASSENGER_APK_URL = 'https://downloads.kaviar.com.br/kaviar-passageiro-v1.13.8-ota.apk';
export const MANAGER_INVITE_URL = 'https://kaviar.com.br/gestor';

export const WHATSAPP_DRIVER_INVITE_MESSAGE = `Olá! Tudo bem?

Estamos convidando motoristas parceiros para conhecer o KAVIAR.

O KAVIAR é uma nova plataforma de mobilidade feita para motoristas, passageiros e também para transporte pet.

Baixe o app do motorista na Google Play por aqui:
${DRIVER_APK_URL}

Depois do cadastro, sua documentação será analisada para liberação na plataforma.

KAVIAR. Para todos.`;

export const WHATSAPP_PASSENGER_INVITE_MESSAGE = `Olá! Tudo bem?

Conheça o KAVIAR, uma nova opção de mobilidade feita para passageiros, motoristas e também para quem precisa transportar seu pet com mais conforto e segurança.

Baixe o app do passageiro por aqui:
${PASSENGER_APK_URL}

KAVIAR. Para todos.`;

export const WHATSAPP_MANAGER_INVITE_MESSAGE = `Olá! Tudo bem?

Estamos convidando novos gestores territoriais para conhecer o KAVIAR.

O KAVIAR é uma plataforma de mobilidade feita para conectar motoristas, passageiros, pets, turismo e oportunidades locais dentro da sua região.

Como gestor, você pode ajudar a expandir o KAVIAR na sua cidade ou território, convidando motoristas e passageiros e acompanhando o crescimento da operação local.

Conheça a oportunidade para gestores:
${MANAGER_INVITE_URL}

KAVIAR. Para todos.`;

export function normalizeBrazilianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('55') && digits.length > 11) return digits;

  const localDigits = digits.replace(/^0+/, '');
  return localDigits ? `55${localDigits}` : '';
}

export function buildWhatsAppInviteUrl({ phone, message }) {
  const normalizedPhone = normalizeBrazilianPhone(phone);
  const encodedMessage = encodeURIComponent(message);
  const recipientPath = normalizedPhone ? `/${normalizedPhone}` : '/';

  return `https://wa.me${recipientPath}?text=${encodedMessage}`;
}

export function openWhatsAppContact(phone, message = "") {
  const normalizedPhone = normalizeBrazilianPhone(phone);
  const recipientPath = normalizedPhone ? "/" + normalizedPhone : "/";
  const textQuery = message ? "?text=" + encodeURIComponent(message) : "";

  window.open("https://wa.me" + recipientPath + textQuery, "_blank", "noopener,noreferrer");
}

export function getWhatsAppInviteMessage(type) {
  if (type === 'passenger') return WHATSAPP_PASSENGER_INVITE_MESSAGE;
  if (type === 'manager' || type === 'gestor') return WHATSAPP_MANAGER_INVITE_MESSAGE;
  return WHATSAPP_DRIVER_INVITE_MESSAGE;
}

export function openWhatsAppInvite(phoneOrOptions, type = 'driver') {
  const options = typeof phoneOrOptions === 'object' && phoneOrOptions !== null
    ? phoneOrOptions
    : { phone: phoneOrOptions, message: getWhatsAppInviteMessage(type) };
  const url = buildWhatsAppInviteUrl(options);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openDriverWhatsAppInvite(phone) {
  openWhatsAppInvite(phone, 'driver');
}

export function openPassengerWhatsAppInvite(phone) {
  openWhatsAppInvite(phone, 'passenger');
}

export function openManagerWhatsAppInvite(phone) {
  openWhatsAppInvite(phone, 'manager');
}

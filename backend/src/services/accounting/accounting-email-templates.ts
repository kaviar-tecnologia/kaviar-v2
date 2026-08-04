/**
 * Email templates for the accounting portal.
 * All templates follow KAVIAR branding (gold #B8942E) and are responsive.
 * Security: NO CPF, passwords, companies, branches, or tokens shown separately from URLs.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KAVIAR</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background-color:#1a1a1a;padding:24px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#B8942E;letter-spacing:3px;">KAVIAR</span>
</td></tr>
<tr><td style="padding:32px 24px;">
${body}
</td></tr>
<tr><td style="background-color:#f9f9f9;padding:20px 24px;text-align:center;border-top:1px solid #eee;">
<p style="margin:0;font-size:12px;color:#999;">KAVIAR Tecnologia e Serviços Digitais</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td align="center" style="background-color:#B8942E;border-radius:6px;">
<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;">${escapeHtml(label)}</a>
</td></tr>
</table>
<p style="font-size:13px;color:#666;margin:0;">Ou copie e cole este link no navegador:<br><a href="${escapeHtml(url)}" style="color:#B8942E;word-break:break-all;">${escapeHtml(url)}</a></p>`;
}

export function buildInviteEmail(params: {
  nome: string;
  activationUrl: string;
  adminName: string;
  expiresInHours: number;
}): { subject: string; html: string; text: string } {
  const subject = 'KAVIAR — Convite para o Portal Contábil';

  const body = `
<p style="margin:0 0 16px;font-size:16px;color:#333;">Olá, ${escapeHtml(params.nome)}.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;">Você foi convidado(a) por <strong>${escapeHtml(params.adminName)}</strong> para acessar o Portal Contábil KAVIAR.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;">Clique no botão abaixo para ativar sua conta e definir suas credenciais de acesso:</p>
${buildButton(params.activationUrl, 'Ativar Minha Conta')}
<p style="margin:24px 0 16px;font-size:14px;color:#666;">Este link é válido por <strong>${params.expiresInHours} horas</strong>.</p>
<p style="margin:0 0 0;font-size:13px;color:#999;">Se você não solicitou este acesso, ignore este email.</p>`;

  const text = [
    `Olá, ${params.nome}.`,
    '',
    `Você foi convidado(a) por ${params.adminName} para acessar o Portal Contábil KAVIAR.`,
    '',
    'Para ativar sua conta e definir suas credenciais de acesso, acesse o link abaixo:',
    '',
    params.activationUrl,
    '',
    `Este link é válido por ${params.expiresInHours} horas.`,
    '',
    'Se você não solicitou este acesso, ignore este email.',
    '',
    '---',
    'KAVIAR Tecnologia e Serviços Digitais',
  ].join('\n');

  return { subject, html: wrapHtml(body), text };
}

export function buildReinviteEmail(params: {
  nome: string;
  activationUrl: string;
  expiresInHours: number;
}): { subject: string; html: string; text: string } {
  const subject = 'KAVIAR — Novo link de ativação do Portal Contábil';

  const body = `
<p style="margin:0 0 16px;font-size:16px;color:#333;">Olá, ${escapeHtml(params.nome)}.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;">Um novo link de ativação foi gerado para sua conta no Portal Contábil KAVIAR. O link anterior foi invalidado.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;">Clique no botão abaixo para ativar sua conta:</p>
${buildButton(params.activationUrl, 'Ativar Minha Conta')}
<p style="margin:24px 0 16px;font-size:14px;color:#666;">Este link é válido por <strong>${params.expiresInHours} horas</strong>.</p>
<p style="margin:0 0 0;font-size:13px;color:#999;">Se você não solicitou este acesso, ignore este email.</p>`;

  const text = [
    `Olá, ${params.nome}.`,
    '',
    'Um novo link de ativação foi gerado para sua conta no Portal Contábil KAVIAR. O link anterior foi invalidado.',
    '',
    'Para ativar sua conta, acesse o link abaixo:',
    '',
    params.activationUrl,
    '',
    `Este link é válido por ${params.expiresInHours} horas.`,
    '',
    'Se você não solicitou este acesso, ignore este email.',
    '',
    '---',
    'KAVIAR Tecnologia e Serviços Digitais',
  ].join('\n');

  return { subject, html: wrapHtml(body), text };
}

export function buildPasswordResetEmail(params: {
  nome: string;
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  const subject = 'KAVIAR — Recuperação de acesso ao Portal Contábil';

  const body = `
<p style="margin:0 0 16px;font-size:16px;color:#333;">Olá, ${escapeHtml(params.nome)}.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;">Recebemos uma solicitação para redefinir suas credenciais do Portal Contábil KAVIAR.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;">Clique no botão abaixo para criar novas credenciais de acesso:</p>
${buildButton(params.resetUrl, 'Redefinir Acesso')}
<p style="margin:24px 0 16px;font-size:14px;color:#666;">Este link é válido por <strong>${params.expiresInMinutes} minutos</strong>.</p>
<p style="margin:0 0 0;font-size:13px;color:#999;">Se você não solicitou, ignore este email.</p>`;

  const text = [
    `Olá, ${params.nome}.`,
    '',
    'Recebemos uma solicitação para redefinir suas credenciais do Portal Contábil KAVIAR.',
    '',
    'Para criar novas credenciais de acesso, acesse o link abaixo:',
    '',
    params.resetUrl,
    '',
    `Este link é válido por ${params.expiresInMinutes} minutos.`,
    '',
    'Se você não solicitou, ignore este email.',
    '',
    '---',
    'KAVIAR Tecnologia e Serviços Digitais',
  ].join('\n');

  return { subject, html: wrapHtml(body), text };
}

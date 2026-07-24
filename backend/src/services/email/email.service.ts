import { CloudflareSMTPProvider } from './providers/cloudflare-smtp.provider';
import { SESProvider } from './providers/ses.provider';

interface EmailParams {
  to: string;
  additionalTo?: string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    size: number;
  }>;
}

interface EmailConfig {
  provider: 'cloudflare' | 'ses' | 'disabled';
  region?: string;
  fromEmail: string;
  replyTo: string[];
  allowedFromEmails: Set<string>;
  cloudflareSMTP: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    token?: string;
  };
}

export interface EmailSendResult {
  ok: boolean;
  provider: 'cloudflare' | 'ses' | 'disabled';
  from: string;
  messageId?: string;
  error?: string;
}

class EmailService {
  private config: EmailConfig;
  private sesProvider?: SESProvider;
  private cloudflareProvider?: CloudflareSMTPProvider;

  private readonly officialAliases = [
    'contato@kaviar.com.br',
    'suporte@kaviar.com.br',
    'financeiro@kaviar.com.br',
    'no-reply@kaviar.com.br',
  ];

  constructor() {
    const fromEmail = process.env.EMAIL_FROM_DEFAULT || 'KAVIAR <no-reply@kaviar.com.br>';

    const configuredAllowedFrom = (process.env.EMAIL_ALLOWED_FROM || '')
      .split(',')
      .map((value) => this.extractEmailAddress(value))
      .filter((value): value is string => !!value && this.officialAliases.includes(value));

    const allowedFromValues = configuredAllowedFrom.length ? configuredAllowedFrom : [...this.officialAliases];
    if (!allowedFromValues.includes('no-reply@kaviar.com.br')) {
      allowedFromValues.push('no-reply@kaviar.com.br');
    }
    const allowedFromEmails = new Set(allowedFromValues);

    const replyTo = (process.env.EMAIL_REPLY_TO || 'contato@kaviar.com.br')
      .split(',')
      .map((value) => this.extractEmailAddress(value))
      .filter(Boolean) as string[];

    const providerEnv = (process.env.EMAIL_PROVIDER || 'cloudflare').toLowerCase();
    const provider = providerEnv === 'ses' || providerEnv === 'disabled' ? providerEnv : 'cloudflare';

    const requestedFromAddress = this.extractEmailAddress(fromEmail);
    const defaultFromAddress = requestedFromAddress && allowedFromEmails.has(requestedFromAddress)
      ? requestedFromAddress
      : this.officialAliases[3];
    const resolvedDefaultFrom = `KAVIAR <${defaultFromAddress}>`;

    this.config = {
      provider,
      region: process.env.AWS_REGION || 'us-east-2',
      fromEmail: resolvedDefaultFrom,
      replyTo: replyTo.length ? replyTo : ['contato@kaviar.com.br'],
      allowedFromEmails,
      cloudflareSMTP: {
        host: process.env.CLOUDFLARE_SMTP_HOST || 'smtp.mx.cloudflare.net',
        port: Number(process.env.CLOUDFLARE_SMTP_PORT || 465),
        secure: this.parseBoolean(process.env.CLOUDFLARE_SMTP_SECURE, true),
        user: process.env.CLOUDFLARE_SMTP_USER || 'api_token',
        token: process.env.CLOUDFLARE_SMTP_TOKEN,
      },
    };

    if (this.config.provider === 'cloudflare') {
      if (this.config.cloudflareSMTP.token) {
        this.cloudflareProvider = new CloudflareSMTPProvider({
          host: this.config.cloudflareSMTP.host,
          port: this.config.cloudflareSMTP.port,
          secure: this.config.cloudflareSMTP.secure,
          user: this.config.cloudflareSMTP.user,
          token: this.config.cloudflareSMTP.token,
        });
      } else {
        console.warn('[EMAIL_CONFIG] provider=cloudflare sem CLOUDFLARE_SMTP_TOKEN. Envio sera marcado como falha ate configurar o secret.');
      }
    }

    if (this.config.provider === 'ses') {
      this.sesProvider = new SESProvider(this.config.region!, this.config.fromEmail!);
    }
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
  }

  private isKaviarDomain(email: string): boolean {
    return email.toLowerCase().endsWith('@kaviar.com.br');
  }

  private extractEmailAddress(input?: string): string | null {
    if (!input) return null;

    const trimmed = input.trim();
    const match = trimmed.match(/<([^>]+)>/);
    const value = (match ? match[1] : trimmed).trim().toLowerCase();
    if (!value.includes('@')) return null;

    return value;
  }

  private resolveFromEmail(candidate?: string): string {
    if (!candidate) return this.config.fromEmail;

    const address = this.extractEmailAddress(candidate);
    if (!address || !this.isKaviarDomain(address) || !this.config.allowedFromEmails.has(address)) {
      console.warn('[EMAIL_FROM_FALLBACK] Invalid or non-allowed from address requested. Falling back to default sender.');
      return this.config.fromEmail;
    }

    return candidate;
  }

  private resolveReplyTo(candidate?: string[]): string[] {
    const values = (candidate && candidate.length ? candidate : this.config.replyTo)
      .map((value) => this.extractEmailAddress(value))
      .filter((value): value is string => !!value && this.isKaviarDomain(value));

    return values.length ? values : this.config.replyTo;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***@***';
    const masked = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : '***';
    return `${masked}@${domain}`;
  }

  getRuntimeInfo() {
    return {
      provider: this.config.provider,
      fromDefault: this.config.fromEmail,
      replyToDefault: this.config.replyTo,
    };
  }

  async sendMail(params: EmailParams): Promise<EmailSendResult> {
    const maskedEmail = this.maskEmail(params.to);
    const fromResolved = this.resolveFromEmail(params.from);
    const replyToResolved = this.resolveReplyTo(params.replyTo);
    const hasAttachments = !!params.attachments?.length;

    if (this.config.provider === 'disabled') {
      console.log(`[EMAIL_DISABLED] provider=disabled to=${maskedEmail} subject="${params.subject}"`);
      return { ok: true, provider: 'disabled', from: fromResolved };
    }

    if (this.config.provider !== 'cloudflare' && hasAttachments) {
      return {
        ok: false,
        provider: this.config.provider,
        from: fromResolved,
        error: 'Anexos disponiveis apenas com provider cloudflare SMTP.',
      };
    }

    try {
      let providerMessageId: string | undefined;

      if (this.config.provider === 'cloudflare') {
        if (!this.cloudflareProvider) {
          return {
            ok: false,
            provider: 'cloudflare',
            from: fromResolved,
            error: 'Cloudflare SMTP nao configurado (token ausente).',
          };
        }
        const sendResult = await this.cloudflareProvider!.send({
          ...params,
          from: fromResolved,
          replyTo: replyToResolved,
          cc: params.cc,
          bcc: params.bcc,
        });
        providerMessageId = sendResult?.messageId;
      } else {
        const sendResult = await this.sesProvider!.send({
          ...params,
          from: fromResolved,
          replyTo: replyToResolved,
          cc: params.cc,
          bcc: params.bcc,
        });
        providerMessageId = sendResult?.messageId;
      }

      console.log(`[EMAIL_SENT] provider=${this.config.provider} to=${maskedEmail} subject="${params.subject}"`);
      return { ok: true, provider: this.config.provider, from: fromResolved, messageId: providerMessageId };
    } catch (error) {
      const message = (error as Error).message;
      console.error(`[EMAIL_SEND_FAILED] provider=${this.config.provider} to=${maskedEmail} subject="${params.subject}" error=${message}`);
      return { ok: false, provider: this.config.provider, from: fromResolved, error: message };
    }
  }
}

export const emailService = new EmailService();

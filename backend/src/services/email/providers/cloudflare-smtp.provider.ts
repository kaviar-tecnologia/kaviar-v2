import nodemailer from 'nodemailer';

interface SendEmailParams {
  to: string;
  additionalTo?: string[];
  subject: string;
  html: string;
  text: string;
  from: string;
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

interface CloudflareSMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  token: string;
}

export class CloudflareSMTPProvider {
  private readonly transporter;

  constructor(config: CloudflareSMTPConfig) {
    if (!config.token) {
      throw new Error('CLOUDFLARE_SMTP_TOKEN nao configurado para envio SMTP.');
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.token,
      },
    });
  }

  async send(params: SendEmailParams): Promise<{ messageId?: string }> {
    const toList = [params.to, ...(params.additionalTo || [])].join(',');
    const info = await this.transporter.sendMail({
      from: params.from,
      to: toList,
      cc: params.cc?.length ? params.cc.join(',') : undefined,
      bcc: params.bcc?.length ? params.bcc.join(',') : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo?.length ? params.replyTo.join(',') : undefined,
      inReplyTo: params.inReplyTo,
      references: params.references?.length ? params.references : undefined,
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    return { messageId: info?.messageId };
  }
}

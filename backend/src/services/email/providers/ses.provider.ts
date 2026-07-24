import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

interface SendEmailParams {
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

export class SESProvider {
  private client: SESClient;
  private fromEmail: string;

  constructor(region: string, fromEmail: string) {
    this.client = new SESClient({ region });
    this.fromEmail = fromEmail;
  }

  async send(params: SendEmailParams): Promise<{ messageId?: string }> {
    const toAddresses = [params.to, ...(params.additionalTo || [])];
    const command = new SendEmailCommand({
      Source: params.from || this.fromEmail,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: params.cc?.length ? params.cc : undefined,
        BccAddresses: params.bcc?.length ? params.bcc : undefined,
      },
      ReplyToAddresses: params.replyTo,
      Message: {
        Subject: {
          Data: params.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: params.text,
            Charset: 'UTF-8',
          },
          Html: {
            Data: params.html,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const result = await this.client.send(command);
    return { messageId: result?.MessageId };
  }
}

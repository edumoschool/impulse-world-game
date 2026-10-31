import { Global, Inject, Injectable, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Port for outbound mail, sent to adults only. Children have no email address. */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}

@Injectable()
export class SmtpEmailSender extends EmailSender {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.from = config.SMTP_FROM;
    this.transport = nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

@Global()
@Module({
  providers: [{ provide: EmailSender, useClass: SmtpEmailSender }],
  exports: [EmailSender],
})
export class EmailModule {}

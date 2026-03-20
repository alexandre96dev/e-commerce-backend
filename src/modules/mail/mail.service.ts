import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      return;
    }

    this.transporter = null;
  }

  async sendTemplate(to: string, template: string, context: Record<string, unknown>) {
    const subjectByTemplate: Record<string, string> = {
      welcome: 'Bem-vindo(a) a Loja Nova Era',
      order_received: 'Pedido recebido com sucesso',
      payment_approved: 'Pagamento aprovado',
      payment_failed: 'Pagamento recusado',
      order_shipped: 'Seu pedido foi enviado',
      password_recovery: 'Recuperacao de senha',
    };

    const subject = subjectByTemplate[template] ?? 'Notificacao da Loja Nova Era';
    const from = process.env.MAIL_FROM ?? 'no-reply@ecommerce.local';
    const html = `<h2>${subject}</h2><pre>${JSON.stringify(context, null, 2)}</pre>`;

    if (this.transporter) {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email SMTP enviado para ${to} com template ${template}`);
      return;
    }

    this.logger.log(`SMTP nao configurado. Email simulado para ${to} com template ${template}`);
    this.logger.debug(JSON.stringify(context));
  }
}

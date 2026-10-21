import { Inject, Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { ENV, type Env } from "../../config/config.module.js";
import { EmailPort, type EmailMessage } from "./email.port.js";

/** Any SMTP provider works (Mailpit in development). */
@Injectable()
export class SmtpAdapter extends EmailPort {
  private readonly transport: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.transport = nodemailer.createTransport(env.smtpUrl);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.env.smtpFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

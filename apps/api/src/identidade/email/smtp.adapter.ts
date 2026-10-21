import { Inject, Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { ENV, type Env } from "../../config/config.module.js";
import { EmailPort, type MensagemDeEmail } from "./email.port.js";

/** Qualquer provedor com SMTP serve (Mailpit em desenvolvimento). */
@Injectable()
export class SmtpAdapter extends EmailPort {
  private readonly transporte: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.transporte = nodemailer.createTransport(env.smtpUrl);
  }

  async enviar(mensagem: MensagemDeEmail): Promise<void> {
    await this.transporte.sendMail({
      from: this.env.smtpFrom,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
    });
  }
}

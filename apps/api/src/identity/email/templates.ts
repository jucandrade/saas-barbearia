import type { EmailMessage } from "./email.port.js";

export const invitationLink = (base: string, token: string): string =>
  `${base}/invitation/${token}`;

export const recoveryLink = (base: string, token: string): string =>
  `${base}/reset-password/${token}`;

export function invitationTemplate(data: {
  name: string;
  barbershop: string;
  link: string;
}): Pick<EmailMessage, "subject" | "text"> {
  return {
    subject: `Convite para acessar ${data.barbershop}`,
    text: [
      `Olá, ${data.name}!`,
      "",
      `Você foi convidado(a) para acessar ${data.barbershop}. Para criar sua senha e entrar, use o link abaixo (vale por 7 dias e só pode ser usado uma vez):`,
      "",
      data.link,
      "",
      "Se você não esperava este convite, ignore esta mensagem.",
    ].join("\n"),
  };
}

export function recoveryTemplate(data: {
  name: string;
  link: string;
}): Pick<EmailMessage, "subject" | "text"> {
  return {
    subject: "Redefinição de senha",
    text: [
      `Olá, ${data.name}!`,
      "",
      "Recebemos um pedido para redefinir a sua senha. Use o link abaixo (vale por 1 hora e só pode ser usado uma vez):",
      "",
      data.link,
      "",
      "Se você não pediu isso, ignore esta mensagem: a sua senha continua a mesma.",
    ].join("\n"),
  };
}

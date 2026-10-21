import type { MensagemDeEmail } from "./email.port.js";

export const linkConvite = (base: string, token: string): string =>
  `${base}/convite/${token}`;

export const linkRecuperacao = (base: string, token: string): string =>
  `${base}/redefinir-senha/${token}`;

export function modeloConvite(dados: {
  nome: string;
  barbearia: string;
  link: string;
}): Pick<MensagemDeEmail, "assunto" | "texto"> {
  return {
    assunto: `Convite para acessar ${dados.barbearia}`,
    texto: [
      `Olá, ${dados.nome}!`,
      "",
      `Você foi convidado(a) para acessar ${dados.barbearia}. Para criar sua senha e entrar, use o link abaixo (vale por 7 dias e só pode ser usado uma vez):`,
      "",
      dados.link,
      "",
      "Se você não esperava este convite, ignore esta mensagem.",
    ].join("\n"),
  };
}

export function modeloRecuperacao(dados: {
  nome: string;
  link: string;
}): Pick<MensagemDeEmail, "assunto" | "texto"> {
  return {
    assunto: "Redefinição de senha",
    texto: [
      `Olá, ${dados.nome}!`,
      "",
      "Recebemos um pedido para redefinir a sua senha. Use o link abaixo (vale por 1 hora e só pode ser usado uma vez):",
      "",
      dados.link,
      "",
      "Se você não pediu isso, ignore esta mensagem: a sua senha continua a mesma.",
    ].join("\n"),
  };
}

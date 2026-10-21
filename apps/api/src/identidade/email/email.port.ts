export interface MensagemDeEmail {
  para: string;
  assunto: string;
  texto: string;
}

/** Envio de e-mail; o adaptador de produção é SMTP, o dos testes guarda em memória. */
export abstract class EmailPort {
  abstract enviar(mensagem: MensagemDeEmail): Promise<void>;
}

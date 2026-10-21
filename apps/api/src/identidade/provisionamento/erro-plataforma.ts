/** Erro de um comando da equipe do produto; a mensagem é segura para exibir. */
export class ErroPlataforma extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPlataforma";
  }
}

export const EMAIL_INDISPONIVEL = "E-mail indisponível.";

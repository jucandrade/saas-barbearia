import { EmailPort, type MensagemDeEmail } from "./email.port.js";

/** Adaptador dos testes: guarda as mensagens em vez de enviá-las. */
export class MemoriaAdapter extends EmailPort {
  readonly mensagens: MensagemDeEmail[] = [];
  falharProximo = false;

  enviar(mensagem: MensagemDeEmail): Promise<void> {
    if (this.falharProximo) {
      this.falharProximo = false;
      return Promise.reject(new Error("Falha simulada de SMTP"));
    }
    this.mensagens.push(mensagem);
    return Promise.resolve();
  }

  /** Última mensagem enviada para o endereço, se houver. */
  ultimaPara(endereco: string): MensagemDeEmail | undefined {
    return [...this.mensagens].reverse().find((m) => m.para === endereco);
  }

  limpar(): void {
    this.mensagens.length = 0;
  }
}

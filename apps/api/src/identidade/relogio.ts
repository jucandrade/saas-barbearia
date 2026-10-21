/**
 * Fonte da hora atual. Os serviços recebem o relógio por injeção, nunca leem
 * `Date.now()` diretamente, para os testes controlarem o tempo.
 */
export abstract class Relogio {
  abstract agora(): Date;
}

export class RelogioDoSistema extends Relogio {
  agora(): Date {
    return new Date();
  }
}

/** Relógio dos testes: parado até alguém avançá-lo ou defini-lo. */
export class RelogioControlavel extends Relogio {
  private instante: Date;

  constructor(inicio: Date = new Date("2026-10-21T12:00:00.000Z")) {
    super();
    this.instante = new Date(inicio);
  }

  agora(): Date {
    return new Date(this.instante);
  }

  avancar(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }

  definir(data: Date): void {
    this.instante = new Date(data);
  }
}

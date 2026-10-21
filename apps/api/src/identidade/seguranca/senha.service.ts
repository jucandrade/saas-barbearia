import { Inject, Injectable } from "@nestjs/common";
import { argon2id, hash, verify, type HashOptions } from "argon2";
import { ENV, type Env } from "../../config/config.module.js";

/** Hash e verificação de senha com Argon2id (R5). */
@Injectable()
export class SenhaService {
  private readonly opcoes: HashOptions;
  private hashFicticio: Promise<string> | undefined;

  constructor(@Inject(ENV) env: Env) {
    this.opcoes = {
      type: argon2id,
      memoryCost: env.argon2.memoryCost,
      timeCost: env.argon2.timeCost,
      parallelism: env.argon2.parallelism,
    };
  }

  hash(senha: string): Promise<string> {
    return hash(senha, this.opcoes);
  }

  async verificar(hash: string, senha: string): Promise<boolean> {
    try {
      return await verify(hash, senha);
    } catch {
      return false;
    }
  }

  /**
   * Gasta o mesmo tempo de uma verificação real quando o e-mail não existe, para
   * a resposta não revelar se a conta existe (FR-014). Sempre devolve falso.
   */
  async verificarSenhaFicticia(senha: string): Promise<false> {
    this.hashFicticio ??= this.hash("senha-ficticia-para-igualar-o-tempo");
    await this.verificar(await this.hashFicticio, senha);
    return false;
  }
}

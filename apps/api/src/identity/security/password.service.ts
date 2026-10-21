import { Inject, Injectable } from "@nestjs/common";
import { argon2id, hash, verify, type HashOptions } from "argon2";
import { ENV, type Env } from "../../config/config.module.js";

/** Password hashing and verification with Argon2id (R5). */
@Injectable()
export class PasswordService {
  private readonly options: HashOptions;
  private hashDummy: Promise<string> | undefined;

  constructor(@Inject(ENV) env: Env) {
    this.options = {
      type: argon2id,
      memoryCost: env.argon2.memoryCost,
      timeCost: env.argon2.timeCost,
      parallelism: env.argon2.parallelism,
    };
  }

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real verification when the e-mail does not exist, so
   * the response does not reveal whether the account exists (FR-014). Always returns false.
   */
  async verifyDummyPassword(password: string): Promise<false> {
    this.hashDummy ??= this.hash("dummy-password-to-equalize-the-time");
    await this.verify(await this.hashDummy, password);
    return false;
  }
}

import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  ForgotInput,
  RECOVERY_MESSAGE,
  ResetInput,
  type ForgotOutput,
} from "@barbearia/contracts";
import { Public } from "../auth/decorators.js";
import { ZodPipe } from "../http/zod.pipe.js";
import { RecoveryService } from "./recovery.service.js";

@Public()
@UseGuards(ThrottlerGuard)
@Controller("auth/password")
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  /** Always `202` with the same message, whether or not the account exists (FR-014). */
  @Post("forgot")
  @HttpCode(202)
  async forgot(
    @Body(new ZodPipe(ForgotInput)) input: ForgotInput,
  ): Promise<ForgotOutput> {
    await this.recovery.request(input.email);
    return { message: RECOVERY_MESSAGE };
  }

  @Post("reset")
  @HttpCode(204)
  async reset(@Body(new ZodPipe(ResetInput)) input: ResetInput): Promise<void> {
    await this.recovery.reset(input);
  }
}

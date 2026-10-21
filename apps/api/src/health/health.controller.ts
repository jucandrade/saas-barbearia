import { Controller, Get } from "@nestjs/common";
import { Publica } from "../identidade/auth/decorators.js";

@Publica()
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }
}

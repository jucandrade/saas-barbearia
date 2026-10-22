import { HttpException } from "@nestjs/common";

/** Business error in the contracts/api.md format: `{ code, message, fields? }`. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(
      fields === undefined ? { code, message } : { code, message, fields },
      status,
    );
  }
}

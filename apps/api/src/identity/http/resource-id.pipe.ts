import { type PipeTransform } from "@nestjs/common";
import { ApiError } from "./api-error.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resource id in the URL. A malformed id answers like a nonexistent id
 * (404): whoever gets the format wrong learns nothing besides "does not exist" (FR-018).
 */
export class ResourceIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) {
      throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");
    }
    return value;
  }
}

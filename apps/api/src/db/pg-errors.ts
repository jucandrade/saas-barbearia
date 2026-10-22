/** SQLSTATE code of the Postgres error, even when wrapped by Drizzle (`cause`). */
export function pgCode(error: unknown): string | undefined {
  const internal = error instanceof Error ? error.cause : undefined;
  for (const candidate of [internal, error]) {
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      "code" in candidate &&
      typeof candidate.code === "string"
    ) {
      return candidate.code;
    }
  }
  return undefined;
}

/** Message of a trigger's `RAISE EXCEPTION` (for example, `LAST_OWNER`). */
export function pgMessage(error: unknown): string | undefined {
  const internal = error instanceof Error ? error.cause : undefined;
  if (internal instanceof Error) {
    return internal.message;
  }
  return error instanceof Error ? error.message : undefined;
}

export const UNIQUE_VIOLATION = "23505";

export const FOREIGN_KEY_VIOLATION = "23503";

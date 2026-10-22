/** Error from a product-team command; the message is safe to display. */
export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}

export const EMAIL_UNAVAILABLE = "E-mail unavailable.";

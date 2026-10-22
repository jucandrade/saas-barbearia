export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** E-mail sending; the production adapter is SMTP, the test one stores in memory. */
export abstract class EmailPort {
  abstract send(message: EmailMessage): Promise<void>;
}

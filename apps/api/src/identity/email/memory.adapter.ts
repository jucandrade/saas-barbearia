import { EmailPort, type EmailMessage } from "./email.port.js";

/** Test adapter: stores the messages instead of sending them. */
export class MemoryAdapter extends EmailPort {
  readonly messages: EmailMessage[] = [];
  failNext = false;

  send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("Simulated SMTP failure"));
    }
    this.messages.push(message);
    return Promise.resolve();
  }

  /** Last message sent to the address, if any. */
  lastTo(address: string): EmailMessage | undefined {
    return [...this.messages].reverse().find((m) => m.to === address);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

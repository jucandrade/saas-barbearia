/**
 * Source of the current time. Services receive the clock by injection and never
 * read `Date.now()` directly, so tests can control time.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Test clock: stopped until someone advances or sets it. */
export class ControllableClock extends Clock {
  private instant: Date;

  constructor(start: Date = new Date("2026-10-21T12:00:00.000Z")) {
    super();
    this.instant = new Date(start);
  }

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }

  setTime(data: Date): void {
    this.instant = new Date(data);
  }
}

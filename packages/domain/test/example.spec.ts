import { describe, expect, it } from "vitest";

describe("packages/domain", () => {
  it("runs tests without framework, database, network or clock", () => {
    expect(1 + 1).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { canDeactivate, type TeamUser } from "../../src/identity/team.js";

const owner = (id: string, status: TeamUser["status"]): TeamUser => ({
  id,
  role: "owner",
  status,
});
const barber = (id: string): TeamUser => ({
  id,
  role: "barber",
  status: "active",
});

describe("canDeactivate", () => {
  it("is false for the last active owner", () => {
    const ana = owner("ana", "active");
    expect(canDeactivate(ana, [ana, barber("bia")])).toBe(false);
  });

  it("is true when there is another active owner", () => {
    const ana = owner("ana", "active");
    expect(canDeactivate(ana, [ana, owner("caio", "active")])).toBe(true);
  });

  it("a deactivated owner does not count as an active owner", () => {
    const ana = owner("ana", "active");
    expect(canDeactivate(ana, [ana, owner("caio", "deactivated")])).toBe(false);
  });

  it("an invited owner does not count as an active owner yet", () => {
    const ana = owner("ana", "active");
    expect(canDeactivate(ana, [ana, owner("caio", "invited")])).toBe(false);
  });

  it("an owner who is not active yet (invited or deactivated) can always be deactivated", () => {
    const invited = owner("caio", "invited");
    expect(canDeactivate(invited, [invited])).toBe(true);
    const deactivated = owner("dani", "deactivated");
    expect(canDeactivate(deactivated, [deactivated])).toBe(true);
  });

  it("is always true for a barber", () => {
    const bia = barber("bia");
    expect(canDeactivate(bia, [bia, owner("ana", "active")])).toBe(true);
    expect(canDeactivate(bia, [bia])).toBe(true);
  });
});

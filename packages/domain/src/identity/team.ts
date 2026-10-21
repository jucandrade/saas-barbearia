import type { Role, UserStatus } from "./role.js";

export interface TeamUser {
  id: string;
  role: Role;
  status: UserStatus;
}

/**
 * Last-owner rule (FR-005): a barbershop always keeps at least one active owner,
 * so the last one cannot be deactivated.
 */
export function canDeactivate(
  user: TeamUser,
  barbershopUsers: readonly TeamUser[],
): boolean {
  // Only the active owner needs protection: invited and deactivated do not count as an active owner.
  if (user.role !== "owner" || user.status !== "active") {
    return true;
  }
  return barbershopUsers.some(
    (other) =>
      other.id !== user.id &&
      other.role === "owner" &&
      other.status === "active",
  );
}

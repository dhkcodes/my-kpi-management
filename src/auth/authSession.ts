export type UserAccess = "Admin" | "User";
export type UserStatus = "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";

export type AuthSession = Readonly<{
  userKey: string;
  displayName: string;
  loginId: string;
  access: UserAccess;
  status: UserStatus;
}>;

export function getProfileInitials(displayName: string): string {
  const tokens = displayName.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  return (tokens[0] ?? "U").slice(0, 2).toUpperCase();
}

export function parseAuthProfile(value: unknown): AuthSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid authentication response.");
  }
  const profile = value as Record<string, unknown>;
  if (
    typeof profile.userKey !== "string" || !profile.userKey.trim() ||
    typeof profile.displayName !== "string" || !profile.displayName.trim() ||
    typeof profile.loginId !== "string" || !profile.loginId.trim() ||
    !["Admin", "User"].includes(String(profile.access)) ||
    !["INVITED", "ACTIVE", "LOCKED", "DISABLED"].includes(String(profile.status))
  ) throw new Error("Invalid authentication response.");
  return {
    userKey: profile.userKey.trim(),
    displayName: profile.displayName.trim(),
    loginId: profile.loginId.trim(),
    access: profile.access as UserAccess,
    status: profile.status as UserStatus
  };
}

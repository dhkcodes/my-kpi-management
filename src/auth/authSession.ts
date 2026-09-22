export type UserAccess = "Admin" | "User";
export type UserStatus = "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";
export type MenuPermission = "NONE" | "READ" | "WRITE";
export const menuPermissionIds = [
  "kpis-overview",
  "weekly-activities",
  "customers-overview",
  "accounts-workloads",
  "analysis",
  "attainment",
  "records"
] as const;
export type MenuPermissionId = typeof menuPermissionIds[number];
export type MenuPermissionMap = Readonly<Record<MenuPermissionId, MenuPermission>>;

export type AuthSession = Readonly<{
  userKey: string;
  displayName: string;
  loginId: string;
  access: UserAccess;
  status: UserStatus;
  menuPermissions: MenuPermissionMap | Readonly<Record<string, never>>;
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
  const access = profile.access as UserAccess;
  const rawPermissions = profile.menuPermissions;
  let menuPermissions: MenuPermissionMap | Readonly<Record<string, never>> = {};
  if (access === "User") {
    if (typeof rawPermissions !== "object" || rawPermissions === null || Array.isArray(rawPermissions)) {
      throw new Error("Invalid authentication response.");
    }
    const entries = Object.entries(rawPermissions as Record<string, unknown>);
    if (entries.length !== menuPermissionIds.length
        || entries.some(([id, permission]) => !menuPermissionIds.includes(id as MenuPermissionId)
          || !["NONE", "READ", "WRITE"].includes(String(permission)))) {
      throw new Error("Invalid authentication response.");
    }
    menuPermissions = Object.fromEntries(entries) as unknown as MenuPermissionMap;
  } else if (rawPermissions !== undefined) {
    if (typeof rawPermissions !== "object" || rawPermissions === null || Array.isArray(rawPermissions)
        || Object.keys(rawPermissions as object).some((id) => !menuPermissionIds.includes(id as MenuPermissionId))) {
      throw new Error("Invalid authentication response.");
    }
    menuPermissions = rawPermissions as MenuPermissionMap;
  }
  return {
    userKey: profile.userKey.trim(),
    displayName: profile.displayName.trim(),
    loginId: profile.loginId.trim(),
    access,
    status: profile.status as UserStatus,
    menuPermissions
  };
}

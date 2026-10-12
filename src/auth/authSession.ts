export type UserAccess = "Admin" | "User";
export type UserStatus = "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";
export type MenuPermission = "NONE" | "READ" | "WRITE";
export const menuPermissionIds = [
  "kpis-overview",
  "weekly-activities",
  "calendar",
  "meeting-notes",
  "customers-overview",
  "accounts-workloads",
  "analysis",
  "forecast-actual",
  "attainment",
  "records"
] as const;
export type MenuPermissionId = typeof menuPermissionIds[number];
export type MenuPermissionMap = Readonly<Record<MenuPermissionId, MenuPermission>>;
export const assignableMenuPermissionIds = [
  "kpis-overview",
  "weekly-activities",
  "calendar",
  "meeting-notes",
  "accounts-workloads",
  "analysis",
  "forecast-actual",
  "records"
] as const satisfies readonly MenuPermissionId[];

export type AuthSession = Readonly<{
  userKey: string;
  displayName: string;
  loginId: string;
  access: UserAccess;
  status: UserStatus;
  lastLoginAt?: string | null;
  menuPermissions: MenuPermissionMap | Readonly<Record<string, never>>;
}>;

export function getProfileInitials(displayName: string): string {
  const tokens = displayName.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  return (tokens[0] ?? "U").slice(0, 2).toUpperCase();
}

const lastLoginFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export function formatLastLoginAtKst(value: string | null | undefined): string {
  if (value == null) return "No login record";
  const parts = Object.fromEntries(lastLoginFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function isAbsoluteIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (hour > 23 || minute > 59 || second > 59) return false;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
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
  const rawLastLoginAt = profile.lastLoginAt;
  if (rawLastLoginAt !== undefined && rawLastLoginAt !== null
      && (typeof rawLastLoginAt !== "string"
        || !isAbsoluteIsoTimestamp(rawLastLoginAt))) {
    throw new Error("Invalid authentication response.");
  }
  const lastLoginAt = typeof rawLastLoginAt === "string" ? rawLastLoginAt : null;
  const rawPermissions = profile.menuPermissions;
  let menuPermissions: MenuPermissionMap | Readonly<Record<string, never>> = {};
  if (access === "User") {
    if (typeof rawPermissions !== "object" || rawPermissions === null || Array.isArray(rawPermissions)) {
      throw new Error("Invalid authentication response.");
    }
    const entries = Object.entries(rawPermissions as Record<string, unknown>);
    if (entries.length !== menuPermissionIds.length
        || entries.some(([id, permission]) => !menuPermissionIds.includes(id as MenuPermissionId)
          || !["NONE", "READ", "WRITE"].includes(String(permission))
          || (id === "forecast-actual" && permission === "WRITE"))) {
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
    ...(rawLastLoginAt === undefined ? {} : { lastLoginAt }),
    menuPermissions
  };
}

export type AuthSession = Readonly<{
  version: 1;
  userId: string;
  authenticatedAt: string;
}>;

export function createAuthSession(userId: string): AuthSession {
  return {
    version: 1,
    userId,
    authenticatedAt: new Date().toISOString()
  };
}

export function getProfileInitials(userId: string): string {
  const localPart = userId.split("@")[0]?.trim() || userId.trim();
  const tokens = localPart.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  }
  const compact = tokens[0] ?? "U";
  return compact.slice(0, 2).toUpperCase();
}

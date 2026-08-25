export const AUTH_SESSION_STORAGE_KEY = "kap.local-auth.v1";

const AUTH_SESSION_VERSION = 1;

export type AuthSession = Readonly<{
  version: typeof AUTH_SESSION_VERSION;
  userId: string;
  authenticatedAt: string;
}>;

export type AuthStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function writeAuthSession(storage: AuthStorage, session: AuthSession): void {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readAuthSession(storage: AuthStorage): AuthSession | null {
  const stored = storage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!stored) return null;
  try {
    const candidate = JSON.parse(stored) as Partial<AuthSession>;
    if (
      candidate.version !== AUTH_SESSION_VERSION
      || typeof candidate.userId !== "string"
      || candidate.userId.length === 0
      || candidate.userId.length > 254
      || typeof candidate.authenticatedAt !== "string"
      || candidate.authenticatedAt.length === 0
    ) {
      storage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    return candidate as AuthSession;
  } catch {
    storage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearAuthSession(storage: AuthStorage): void {
  storage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function getProfileInitials(userId: string): string {
  const firstCharacter = userId.trim().charAt(0);
  return firstCharacter ? firstCharacter.toUpperCase() : "U";
}

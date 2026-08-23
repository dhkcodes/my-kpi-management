export const AUTH_SESSION_STORAGE_KEY = "kap.local-auth.v1";

const AUTH_SESSION_VERSION = 1;

type RuntimeAuthConfig = Readonly<{
  userId: string;
  password: string;
}>;

declare global {
  var KAP_AUTH_CONFIG: RuntimeAuthConfig | undefined;
}

export type AuthSession = Readonly<{
  version: typeof AUTH_SESSION_VERSION;
  userId: string;
  authenticatedAt: string;
}>;

export type AuthStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readRuntimeAuthConfig(): RuntimeAuthConfig | null {
  const config = globalThis.KAP_AUTH_CONFIG;
  if (
    !config
    || typeof config.userId !== "string"
    || config.userId.length === 0
    || typeof config.password !== "string"
    || config.password.length === 0
  ) {
    return null;
  }
  return config;
}

export function authenticateConfiguredUser(userId: string, password: string): AuthSession | null {
  const config = readRuntimeAuthConfig();
  if (!config || userId !== config.userId || password !== config.password) return null;
  return {
    version: AUTH_SESSION_VERSION,
    userId: config.userId,
    authenticatedAt: new Date().toISOString()
  };
}

export function writeAuthSession(storage: AuthStorage, session: AuthSession): void {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readAuthSession(storage: AuthStorage): AuthSession | null {
  const config = readRuntimeAuthConfig();
  const stored = storage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!config || !stored) return null;
  try {
    const candidate = JSON.parse(stored) as Partial<AuthSession>;
    if (
      candidate.version !== AUTH_SESSION_VERSION
      || candidate.userId !== config.userId
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

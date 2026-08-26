export const AUTH_REQUIRED_EVENT = "kap-auth-required";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type AuthRequiredListener = () => void;

let authRequiredNotified = false;
const listeners = new Set<AuthRequiredListener>();

export function subscribeAuthRequired(listener: AuthRequiredListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetAuthRequiredNotification(): void {
  authRequiredNotified = false;
}

function emitAuthRequired(): void {
  if (authRequiredNotified) return;
  authRequiredNotified = true;
  listeners.forEach((listener) => listener());
  const target = globalThis as typeof globalThis & { dispatchEvent?: (event: Event) => boolean };
  if (typeof target.dispatchEvent === "function" && typeof Event === "function") {
    target.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: FetchLike = fetch,
  notifyAuthRequired = true
): Promise<Response> {
  const response = await fetchImpl(input, { ...init, credentials: "include" });
  if (notifyAuthRequired && response.status === 401) emitAuthRequired();
  return response;
}

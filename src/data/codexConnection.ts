export type CodexAuthenticationState = "AUTH_REQUIRED" | "CONNECTED" | "REAUTH_REQUIRED";
export type CodexConnectivityState = "AVAILABLE" | "TEMPORARY_UNAVAILABLE" | "REFRESHING";

export interface CodexConnectionStatus {
  authentication: CodexAuthenticationState;
  connectivity: CodexConnectivityState;
  integrationAvailable: boolean;
  summarySupported: boolean;
  transcriptionSupported: boolean;
  detail: string;
}

export const unavailableCodexConnection: CodexConnectionStatus = {
  authentication: "AUTH_REQUIRED",
  connectivity: "AVAILABLE",
  integrationAvailable: false,
  summarySupported: false,
  transcriptionSupported: false,
  detail: "이 배포에는 공식 개인 Codex 연결이 구성되어 있지 않습니다.",
};

export const codexAuthenticationLabel = (state: CodexAuthenticationState): string => {
  if (state === "CONNECTED") return "인증 및 연결됨";
  if (state === "REAUTH_REQUIRED") return "재인증 필요";
  return "인증 필요";
};

export const codexConnectionPrimaryLabel = (status: CodexConnectionStatus): string =>
  status.integrationAvailable ? codexAuthenticationLabel(status.authentication) : "연결 기능 미준비";

export const codexConnectivityLabel = (state: CodexConnectivityState): string | null => {
  if (state === "TEMPORARY_UNAVAILABLE") return "일시적 연결 장애";
  if (state === "REFRESHING") return "연결 갱신 중";
  return null;
};

export const preserveAuthenticationDuringTransientFailure = (
  current: CodexConnectionStatus,
  detail = "일시적인 네트워크 또는 서비스 오류입니다. 기존 인증은 유지됩니다.",
): CodexConnectionStatus => ({ ...current, connectivity: "TEMPORARY_UNAVAILABLE", detail });

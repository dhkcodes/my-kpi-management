import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojinputtext";
import type { InputPasswordElement, InputTextElement } from "ojs/ojinputtext";
import { activateUser, authenticateUser, completePasswordReset } from "../auth/authApi";
import type { AuthSession } from "../auth/authSession";

type LoginMode = "signin" | "activate" | "reset";
type LoginPageProps = Readonly<{ appName: string; onAuthenticated: (session: AuthSession) => void }>;

const modeCopy: Record<LoginMode, { title: string; intro: string; submit: string }> = {
  signin: { title: "Sign in", intro: "Enter your workspace credentials to continue.", submit: "Sign in" },
  activate: { title: "Activate", intro: "Use the temporary password from your invitation and choose a new password.", submit: "Activate account" },
  reset: { title: "Reset credential", intro: "Enter the temporary reset password issued by an administrator and choose a new password.", submit: "Reset credential" }
};

const activationLinkLoginId = () => {
  if (typeof window === "undefined" || window.location.pathname !== "/activate") return "";
  return new URLSearchParams(window.location.search).get("loginId")?.trim() ?? "";
};

export function LoginPage({ appName, onAuthenticated }: LoginPageProps) {
  const linkedLoginId = activationLinkLoginId();
  const [mode, setMode] = useState<LoginMode>(linkedLoginId ? "activate" : "signin");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginIdRef = useRef<InputTextElement<string> | null>(null);
  const passwordRef = useRef<InputPasswordElement<string> | null>(null);
  const temporaryPasswordRef = useRef<InputPasswordElement<string> | null>(null);
  const newPasswordRef = useRef<InputPasswordElement<string> | null>(null);
  const confirmPasswordRef = useRef<InputPasswordElement<string> | null>(null);

  useEffect(() => {
    if (linkedLoginId) loginIdRef.current?.setProperty("value", linkedLoginId);
  }, [linkedLoginId]);

  const valueOf = (ref: { current: InputTextElement<string> | InputPasswordElement<string> | null }) =>
    String(ref.current?.rawValue ?? ref.current?.value ?? "");
  const clearSensitive = () => [passwordRef, temporaryPasswordRef, newPasswordRef, confirmPasswordRef]
    .forEach((ref) => ref.current?.setProperty("value", ""));
  const selectMode = (nextMode: LoginMode) => {
    clearSensitive();
    setError("");
    setMode(nextMode);
    if (nextMode === "signin" && typeof window !== "undefined" && window.location.pathname === "/activate") {
      window.history.replaceState(window.history.state, "", "/");
    }
  };

  const handleSubmit = async (event?: Event) => {
    event?.preventDefault();
    if (isSubmitting) return;
    setError("");
    const loginId = valueOf(loginIdRef);
    const password = valueOf(passwordRef);
    const temporaryPassword = valueOf(temporaryPasswordRef);
    const newPassword = valueOf(newPasswordRef);
    const confirmation = valueOf(confirmPasswordRef);
    if (!loginId.trim() || (mode === "signin" ? !password : !temporaryPassword || !newPassword || !confirmation)) {
      setError("Complete all required fields.");
      return;
    }
    if (mode !== "signin" && newPassword !== confirmation) {
      setError("New passwords do not match.");
      clearSensitive();
      return;
    }
    setIsSubmitting(true);
    try {
      const session = mode === "signin"
        ? await authenticateUser(loginId, password)
        : mode === "activate"
          ? await activateUser(loginId, temporaryPassword, newPassword)
          : await completePasswordReset(loginId, temporaryPassword, newPassword);
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential request is temporarily unavailable.");
    } finally {
      clearSensitive();
      setIsSubmitting(false);
    }
  };

  const copy = modeCopy[mode];
  return (
    <main id="kapLoginPage" class="kap-login" aria-labelledby="kapLoginTitle">
      <section class="kap-login__card" aria-label={`${appName} credentials`}>
        <div class="kap-login__brand" aria-label="Oracle"><span class="demo-oracle-icon" role="img" aria-label="Oracle"></span></div>
        <p class="kap-login__eyebrow">MY KPI &amp; ACCOUNT PLANNER</p>
        <h1 id="kapLoginTitle">{copy.title}</h1>
        <p class="kap-login__intro">{copy.intro}</p>
        <form id="kapLoginForm" class="kap-login__form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <oj-input-text id="kapLoginUserId" ref={loginIdRef} class="kap-login__field" autocomplete="username" labelEdge="inside" labelHint="Login ID" required disabled={isSubmitting || mode === "activate"} userAssistanceDensity="compact"></oj-input-text>
          {mode === "signin" ? (
            <oj-input-password id="kapLoginPassword" ref={passwordRef} class="kap-login__field" autocomplete="current-password" labelEdge="inside" labelHint="Password" required disabled={isSubmitting} userAssistanceDensity="compact"></oj-input-password>
          ) : (
            <>
              <oj-input-password id="kapTemporaryPassword" ref={temporaryPasswordRef} class="kap-login__field" autocomplete="current-password" labelEdge="inside" labelHint="Temporary password" required disabled={isSubmitting} userAssistanceDensity="compact"></oj-input-password>
              <oj-input-password id="kapNewPassword" ref={newPasswordRef} class="kap-login__field" autocomplete="new-password" labelEdge="inside" labelHint="New password" required disabled={isSubmitting} userAssistanceDensity="compact"></oj-input-password>
              <oj-input-password id="kapConfirmPassword" ref={confirmPasswordRef} class="kap-login__field" autocomplete="new-password" labelEdge="inside" labelHint="Confirm new password" required disabled={isSubmitting} userAssistanceDensity="compact"></oj-input-password>
            </>
          )}
          {error && <div id="kapLoginError" class="kap-login__error" role="alert" aria-live="assertive"><span class="oj-ux-ico-error-s kap-login__error-icon" aria-hidden="true"></span><span>{error}</span></div>}
          <oj-button id="kapLoginSubmit" class="kap-login__submit" chroming="callToAction" disabled={isSubmitting}>{isSubmitting ? "Working…" : copy.submit}</oj-button>
          <div class="kap-login__links">
            {mode === "signin" ? (
              <button type="button" disabled={isSubmitting} onClick={() => selectMode("reset")}>Forgot or reset credential?</button>
            ) : (
              <button type="button" disabled={isSubmitting} onClick={() => selectMode("signin")}>Back to sign in</button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

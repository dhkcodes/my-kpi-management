import { useEffect, useMemo, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojformlayout";
import "ojs/ojinputtext";
import type { InputPasswordElement, InputTextElement } from "ojs/ojinputtext";
import {
  authenticateUser, completeCredentialAction, inspectCredentialAction,
  type CredentialActionContext, type CredentialActionPurpose
} from "../auth/authApi";
import type { AuthSession } from "../auth/authSession";

type LoginPageProps = Readonly<{ appName?: string; onAuthenticated: (session: AuthSession) => void }>;
type Mode = "signIn" | "forgot" | "validating" | "action" | "invalid";

const requestedAction = (): { token: string; purpose: CredentialActionPurpose } | null => {
  const url = new URL(window.location.href);
  const purpose = url.pathname === "/activate" ? "ACTIVATION" : url.pathname === "/reset-password" ? "RESET" : null;
  const token = url.searchParams.get("token")?.trim() ?? "";
  return purpose && token ? { purpose, token } : null;
};

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const initialAction = useMemo(requestedAction, []);
  const [mode, setMode] = useState<Mode>(initialAction ? "validating" : "signIn");
  const [actionContext, setActionContext] = useState<CredentialActionContext | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialAction) return;
    let active = true;
    void inspectCredentialAction(initialAction.token).then((context) => {
      if (!active) return;
      if (context.purpose !== initialAction.purpose) throw new Error("This action link does not match this page.");
      setActionContext(context); setMode("action"); setError("");
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "This action link is invalid.");
      setMode("invalid");
    });
    return () => { active = false; };
  }, [initialAction]);

  const returnToSignIn = () => {
    window.history.replaceState(null, "", "/");
    setMode("signIn"); setActionContext(null); setError(""); setNewPassword(""); setConfirmPassword("");
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(""); setIsSubmitting(true);
    try {
      if (mode === "signIn") {
        onAuthenticated(await authenticateUser(loginId, password));
      } else if (mode === "action" && initialAction && actionContext) {
        if (newPassword.length < 12) throw new Error("New password must contain at least 12 characters.");
        if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
        onAuthenticated(await completeCredentialAction(actionContext.purpose, initialAction.token, newPassword));
        window.history.replaceState(null, "", "/");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Credential request failed.");
    } finally { setIsSubmitting(false); }
  };

  const actionLabel = actionContext?.purpose === "ACTIVATION" ? "Activate account" : "Reset password";

  return <main class="kap-login-page"><section class="kap-login-card" aria-labelledby="kapLoginTitle">
    <div class="kap-login-brand"><span class="kap-login-brand__mark" aria-hidden="true">K</span><div><strong>My KPI &amp; Account Planner</strong><span>Secure workspace access</span></div></div>
    <h1 id="kapLoginTitle">{mode === "signIn" ? "Sign in" : mode === "forgot" ? "Reset credential" : mode === "validating" ? "Validating link" : mode === "invalid" ? "Link unavailable" : actionLabel}</h1>
    {mode === "signIn" && <p>Use your assigned application account.</p>}
    {mode === "forgot" && <><p>Password reset requires a valid, one-time reset URL.</p><p>Ask an administrator to create a reset link and deliver it through an approved secure channel. No current or temporary password is required.</p></>}
    {mode === "validating" && <p role="status">Checking the action link…</p>}
    {mode === "invalid" && <p>The link may be invalid, expired, already used, or intended for a different action.</p>}
    {mode === "action" && actionContext && <p>{actionContext.purpose === "ACTIVATION" ? "Create the password for" : "Choose a new password for"} <strong>{actionContext.loginId}</strong>. This link expires {new Date(actionContext.expiresAt).toLocaleString()} and works once.</p>}

    {(mode === "signIn" || mode === "action") && <form onSubmit={submit} noValidate>
      <oj-form-layout maxColumns={1} direction="row">
        {mode === "signIn" ? <>
          <oj-input-text id="kapLoginUserId" labelHint="Login ID" value={loginId} autocomplete="username" required
            onvalueChanged={(event: InputTextElement.valueChanged) => setLoginId(String(event.detail.value ?? ""))}></oj-input-text>
          <oj-input-password id="kapLoginPassword" labelHint="Password" value={password} autocomplete="current-password" required
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setPassword(String(event.detail.value ?? ""))}></oj-input-password>
        </> : <>
          <oj-input-password id="kapNewPassword" labelHint="New password" value={newPassword} autocomplete="new-password" required
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setNewPassword(String(event.detail.value ?? ""))}></oj-input-password>
          <oj-input-password id="kapConfirmPassword" labelHint="Confirm new password" value={confirmPassword} autocomplete="new-password" required
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setConfirmPassword(String(event.detail.value ?? ""))}></oj-input-password>
        </>}
      </oj-form-layout>
      {error && <div class="kap-login-error" role="alert">{error}</div>}
      <oj-button id="kapLoginSubmit" chroming="callToAction" disabled={isSubmitting} onojAction={(event: Event) => void submit(event)}>
        {isSubmitting ? "Please wait…" : mode === "signIn" ? "Sign in" : actionLabel}
      </oj-button>
    </form>}
    {(mode === "invalid" || mode === "validating") && error && <div class="kap-login-error" role="alert">{error}</div>}
    {mode === "signIn" && <button class="kap-login-link" type="button" onClick={() => { setMode("forgot"); setError(""); }}>Forgot or reset credential?</button>}
    {mode === "forgot" && <button class="kap-login-link" type="button" onClick={returnToSignIn}>Back to sign in</button>}
    {mode === "invalid" && <button class="kap-login-link" type="button" onClick={returnToSignIn}>Back to sign in</button>}
  </section></main>;
}

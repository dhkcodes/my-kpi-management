import { useEffect, useMemo, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojformlayout";
import "ojs/ojinputtext";
import type { InputPasswordElement, InputTextElement } from "ojs/ojinputtext";
import {
  authenticateUser,
  completeCredentialAction,
  inspectCredentialAction,
  requestPasswordReset,
  type CredentialActionContext,
  type CredentialActionPurpose
} from "../auth/authApi";
import type { AuthSession } from "../auth/authSession";
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from "../auth/passwordPolicy";

type LoginPageProps = Readonly<{ appName?: string; onAuthenticated: (session: AuthSession) => void }>;
type Mode = "signIn" | "forgot" | "validating" | "action" | "invalid" | "success";
type InitialRoute = Readonly<{
  action: { token: string; purpose: CredentialActionPurpose } | null;
  missingActionToken: boolean;
  requestReset: boolean;
}>;

const requestedAction = (): InitialRoute => {
  const url = new URL(window.location.href);
  const purpose = url.pathname === "/activate" ? "ACTIVATION" : url.pathname === "/reset-password" ? "RESET" : null;
  const token = url.searchParams.get("token")?.trim() ?? "";
  return {
    action: purpose && token ? { purpose, token } : null,
    missingActionToken: Boolean(purpose && !token),
    requestReset: url.pathname === "/request-reset"
  };
};

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const initialRoute = useMemo(requestedAction, []);
  const initialAction = initialRoute.action;
  const [mode, setMode] = useState<Mode>(
    initialAction ? "validating" : initialRoute.missingActionToken ? "invalid" : initialRoute.requestReset ? "forgot" : "signIn"
  );
  const [actionContext, setActionContext] = useState<CredentialActionContext | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(initialRoute.missingActionToken ? "This action link is invalid, expired, or already used." : "");
  const [successMessage, setSuccessMessage] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialAction) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [initialAction]);

  useEffect(() => {
    if (!initialAction) return;
    let active = true;
    void inspectCredentialAction(initialAction.token).then((context) => {
      if (!active) return;
      if (context.purpose !== initialAction.purpose) throw new Error("This action link does not match this page.");
      setActionContext(context);
      setMode("action");
      setError("");
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "This action link is invalid, expired, or already used.");
      setMode("invalid");
    });
    return () => { active = false; };
  }, [initialAction]);

  const returnToSignIn = () => {
    window.history.replaceState(null, "", "/");
    setMode("signIn");
    setActionContext(null);
    setError("");
    setSuccessMessage("");
    setResetLink("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const openResetRequest = () => {
    window.history.replaceState(null, "", "/request-reset");
    setMode("forgot");
    setActionContext(null);
    setError("");
    setSuccessMessage("");
    setResetLink("");
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);
    try {
      if (mode === "signIn") {
        onAuthenticated(await authenticateUser(loginId, password));
      } else if (mode === "forgot") {
        if (!loginId.trim()) throw new Error("Enter your Login ID.");
        const reset = await requestPasswordReset(loginId);
        setResetLink(reset.resetLink ?? "");
        setSuccessMessage(reset.resetLink
          ? "Reset link created. Use the one-time link below to choose a new password. No temporary password is created."
          : "Reset request accepted. If the account is eligible, an administrator can provide a one-time reset link through the approved secure channel.");
        setMode("success");
      } else if (mode === "action" && initialAction && actionContext) {
        const policyError = validatePasswordPolicy(newPassword);
        if (policyError) throw new Error(policyError);
        if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
        await completeCredentialAction(actionContext.purpose, initialAction.token, newPassword, confirmPassword);
        setSuccessMessage("Password set successfully. Sign in with your new password.");
        setMode("success");
        window.history.replaceState(null, "", "/");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Credential request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const actionLabel = actionContext?.purpose === "ACTIVATION" ? "Activate account" : "Reset password";
  const title = mode === "signIn" ? "Sign in"
    : mode === "forgot" ? "Request password reset"
      : mode === "validating" ? "Validating link"
        : mode === "invalid" ? "Link unavailable"
          : mode === "success" ? "Request complete"
            : actionLabel;

  return <main class="kap-login-page oj-bg-neutral-0"><section class="kap-login-card" aria-labelledby="kapLoginTitle">
    <div class="kap-login-brand"><span class="kap-login-brand__mark" aria-hidden="true">K</span><div><strong>My KPI &amp; Account Planner</strong><span>Secure workspace access</span></div></div>
    <h1 id="kapLoginTitle">{title}</h1>
    {mode === "signIn" && <p>Use your assigned application account.</p>}
    {mode === "forgot" && <p>Enter your Login ID. If the account is eligible, the reset-link flow will issue a one-time password reset URL. It never creates a temporary password.</p>}
    {mode === "validating" && <p role="status">Checking the action link…</p>}
    {mode === "invalid" && <p>The link is invalid, expired, or already used. Request a new link to continue.</p>}
    {mode === "action" && actionContext && <p>{actionContext.purpose === "ACTIVATION" ? "Create the password for" : "Choose a new password for"} <strong>{actionContext.loginId}</strong>. This link expires {new Date(actionContext.expiresAt).toLocaleString()} and works once.</p>}
    {mode === "success" && <div class="kap-login-success" role="status"><strong>{successMessage.startsWith("Password set successfully") ? "Password set successfully" : "Reset link created"}</strong><p>{successMessage}</p>
      {resetLink && <><a class="kap-login-reset-link" href={resetLink}>Reset password now</a>
        <div class="kap-login-warning" role="note"><strong>Keep this link private.</strong> Anyone with this link can reset the password until it is used or expires.</div></>}
    </div>}

    {(mode === "signIn" || mode === "forgot" || mode === "action") && <form class="kap-login-form" onSubmit={submit} noValidate>
      <oj-form-layout maxColumns={1} direction="row">
        {(mode === "signIn" || mode === "forgot") && <oj-input-text id="kapLoginUserId" labelHint="Login ID" value={loginId} autocomplete="username" required
          onvalueChanged={(event: InputTextElement.valueChanged) => setLoginId(String(event.detail.value ?? ""))}></oj-input-text>}
        {mode === "signIn" && <oj-input-password id="kapLoginPassword" labelHint="Password" value={password} autocomplete="current-password" required
          onvalueChanged={(event: InputPasswordElement.valueChanged) => setPassword(String(event.detail.value ?? ""))}></oj-input-password>}
        {mode === "action" && <>
          <oj-input-password id="kapNewPassword" labelHint="New password" value={newPassword} autocomplete="new-password" required
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setNewPassword(String(event.detail.value ?? ""))}></oj-input-password>
          <oj-input-password id="kapConfirmPassword" labelHint="Confirm new password" value={confirmPassword} autocomplete="new-password" required
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setConfirmPassword(String(event.detail.value ?? ""))}></oj-input-password>
          <p class="kap-password-policy-hint">{PASSWORD_POLICY_HINT}</p>
        </>}
      </oj-form-layout>
      {error && <div class="kap-login-error" role="alert">{error}</div>}
      <oj-button id="kapLoginSubmit" chroming="callToAction" disabled={isSubmitting} onojAction={(event: Event) => void submit(event)}>
        {isSubmitting ? "Please wait…" : mode === "signIn" ? "Sign in" : mode === "forgot" ? "Request reset link" : actionLabel}
      </oj-button>
    </form>}
    {(mode === "invalid" || mode === "validating") && error && <div class="kap-login-error" role="alert">{error}</div>}
    {mode === "signIn" && <button class="kap-login-link" type="button" onClick={openResetRequest}>Forgot password</button>}
    {mode === "forgot" && <button class="kap-login-link" type="button" onClick={returnToSignIn}>Back to sign in</button>}
    {mode === "invalid" && <><button class="kap-login-link" type="button" onClick={openResetRequest}>Request a new link</button><button class="kap-login-link" type="button" onClick={returnToSignIn}>Back to sign in</button></>}
    {mode === "success" && <button class="kap-login-link" type="button" onClick={returnToSignIn}>Sign in</button>}
  </section></main>;
}

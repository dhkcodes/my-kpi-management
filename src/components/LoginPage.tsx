import { h } from "preact";
import { useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojinputtext";
import type { InputPasswordElement, InputTextElement } from "ojs/ojinputtext";
import {
  AuthSession,
  authenticateConfiguredUser
} from "../auth/authSession";

type LoginPageProps = Readonly<{
  appName: string;
  onAuthenticated: (session: AuthSession) => void;
}>;

export function LoginPage({ appName, onAuthenticated }: LoginPageProps) {
  const [error, setError] = useState("");
  const userIdRef = useRef<InputTextElement<string> | null>(null);
  const passwordRef = useRef<InputPasswordElement<string> | null>(null);

  const handleSubmit = (event?: Event) => {
    event?.preventDefault();
    setError("");
    const userId = String(userIdRef.current?.rawValue ?? userIdRef.current?.value ?? "");
    const password = String(passwordRef.current?.rawValue ?? passwordRef.current?.value ?? "");

    if (!userId || !password) {
      setError("Enter both your user ID and password.");
      return;
    }

    const session = authenticateConfiguredUser(userId, password);
    if (!session) {
      setError("The user ID or password is incorrect.");
      passwordRef.current?.setProperty("value", "");
      window.requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }

    passwordRef.current?.setProperty("value", "");
    onAuthenticated(session);
  };

  return (
    <main id="kapLoginPage" class="kap-login" aria-labelledby="kapLoginTitle">
      <section class="kap-login__card" aria-label={`${appName} sign in`}>
        <div class="kap-login__brand" aria-label="Oracle">
          <span class="demo-oracle-icon" role="img" aria-label="Oracle"></span>
        </div>
        <p class="kap-login__eyebrow">MY KPI &amp; ACCOUNT PLANNER</p>
        <h1 id="kapLoginTitle">Sign in</h1>
        <p class="kap-login__intro">Enter your workspace credentials to continue.</p>

        <form
          id="kapLoginForm"
          class="kap-login__form"
          onSubmit={handleSubmit}
          noValidate>
          <oj-input-text
            id="kapLoginUserId"
            ref={userIdRef}
            class="kap-login__field"
            autocomplete="username"
            labelEdge="inside"
            labelHint="User ID"
            required={true}
            userAssistanceDensity="compact"
            virtualKeyboard="email"
            onrawValueChanged={() => {
              if (error) setError("");
            }}>
          </oj-input-text>

          <oj-input-password
            id="kapLoginPassword"
            ref={passwordRef}
            class="kap-login__field"
            autocomplete="current-password"
            labelEdge="inside"
            labelHint="Password"
            required={true}
            userAssistanceDensity="compact"
            onrawValueChanged={() => {
              if (error) setError("");
            }}>
          </oj-input-password>

          {error && (
            <div id="kapLoginError" class="kap-login__error" role="alert" aria-live="assertive">
              <span class="oj-ux-ico-error-s kap-login__error-icon" aria-hidden="true"></span>
              <span>{error}</span>
            </div>
          )}

          <oj-button
            id="kapLoginSubmit"
            class="kap-login__submit"
            chroming="callToAction">
            Sign in
          </oj-button>
        </form>

        <p class="kap-login__notice">
          This single-user sign-in is a local workspace gate. It does not secure Backend APIs or data.
        </p>
      </section>
    </main>
  );
}

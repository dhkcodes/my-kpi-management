import { h } from "preact";
import { useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojinputtext";
import type { InputPasswordElement, InputTextElement } from "ojs/ojinputtext";
import { authenticateUser } from "../auth/authApi";
import type { AuthSession } from "../auth/authSession";

type LoginPageProps = Readonly<{
  appName: string;
  onAuthenticated: (session: AuthSession) => void;
}>;

export function LoginPage({ appName, onAuthenticated }: LoginPageProps) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const userIdRef = useRef<InputTextElement<string> | null>(null);
  const passwordRef = useRef<InputPasswordElement<string> | null>(null);

  const handleSubmit = async (event?: Event) => {
    event?.preventDefault();
    if (isSubmitting) return;
    setError("");
    const userId = String(userIdRef.current?.rawValue ?? userIdRef.current?.value ?? "");
    const password = String(passwordRef.current?.rawValue ?? passwordRef.current?.value ?? "");

    if (!userId.trim() || !password) {
      setError("Enter both your user ID and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await authenticateUser(userId, password);
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in is temporarily unavailable.");
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    } finally {
      passwordRef.current?.setProperty("value", "");
      setIsSubmitting(false);
    }
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
          onSubmit={(event) => void handleSubmit(event)}
          noValidate>
          <oj-input-text
            id="kapLoginUserId"
            ref={userIdRef}
            class="kap-login__field"
            autocomplete="username"
            labelEdge="inside"
            labelHint="User ID"
            required={true}
            disabled={isSubmitting}
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
            disabled={isSubmitting}
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
            chroming="callToAction"
            disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </oj-button>
        </form>

        <p class="kap-login__notice">
          Authentication is verified by the workspace service. Backend API authorization remains Tailnet-scoped.
        </p>
      </section>
    </main>
  );
}

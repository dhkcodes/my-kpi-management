import { h } from "preact";
import { useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojinputtext";
import type { InputPasswordElement } from "ojs/ojinputtext";
import { changePassword } from "../../auth/authApi";
import type { AuthSession } from "../../auth/authSession";

export function ProfilePage({ profile }: Readonly<{ profile: AuthSession }>) {
  const currentRef = useRef<InputPasswordElement<string> | null>(null);
  const nextRef = useRef<InputPasswordElement<string> | null>(null);
  const confirmRef = useRef<InputPasswordElement<string> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const read = (ref: typeof currentRef) => String(ref.current?.rawValue ?? ref.current?.value ?? "");
  const clear = () => [currentRef, nextRef, confirmRef].forEach((ref) => ref.current?.setProperty("value", ""));
  const submit = async (event: Event) => {
    event.preventDefault();
    if (saving) return;
    setError(""); setMessage("");
    const currentPassword = read(currentRef);
    const newPassword = read(nextRef);
    if (!currentPassword || !newPassword || !read(confirmRef)) return setError("Complete all password fields.");
    if (newPassword !== read(confirmRef)) { clear(); return setError("New passwords do not match."); }
    setSaving(true);
    try { await changePassword(currentPassword, newPassword); setMessage("Password changed."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Password change failed."); }
    finally { clear(); setSaving(false); }
  };
  return (
    <section class="kap-account-page" aria-labelledby="kapProfileTitle">
      <header><span class="kpi-eyebrow">Account</span><h2 id="kapProfileTitle">Profile</h2></header>
      <dl class="kap-profile-fields">
        <div><dt>Display name</dt><dd>{profile.displayName}</dd></div>
        <div><dt>Login ID</dt><dd>{profile.loginId}</dd></div>
        <div><dt>Access</dt><dd>{profile.access}</dd></div>
        <div><dt>Status</dt><dd>{profile.status}</dd></div>
      </dl>
      <form class="kap-password-form" onSubmit={(event) => void submit(event)}>
        <h3>Change password</h3>
        <oj-input-password ref={currentRef} labelEdge="inside" labelHint="Current password" autocomplete="current-password" required disabled={saving}></oj-input-password>
        <oj-input-password ref={nextRef} labelEdge="inside" labelHint="New password" autocomplete="new-password" required disabled={saving}></oj-input-password>
        <oj-input-password ref={confirmRef} labelEdge="inside" labelHint="Confirm new password" autocomplete="new-password" required disabled={saving}></oj-input-password>
        {error && <div class="kap-form-message kap-form-message--error" role="alert">{error}</div>}
        {message && <div class="kap-form-message" role="status">{message}</div>}
        <oj-button chroming="callToAction" disabled={saving}>{saving ? "Changing…" : "Change password"}</oj-button>
      </form>
    </section>
  );
}

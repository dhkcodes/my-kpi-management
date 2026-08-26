import { h } from "preact";
import { useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojdialog";
import "ojs/ojinputtext";
import type { DialogElement } from "ojs/ojdialog";
import type { InputPasswordElement } from "ojs/ojinputtext";
import { changePassword } from "../../auth/authApi";
import type { AuthSession } from "../../auth/authSession";
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from "../../auth/passwordPolicy";

export function ProfilePage({ profile }: Readonly<{ profile: AuthSession }>) {
  const dialogRef = useRef<DialogElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const clear = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setMessage("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Complete all password fields.");
      return;
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      clear();
      dialogRef.current?.close();
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password change failed.");
    } finally {
      setSaving(false);
    }
  };

  const openDialog = () => {
    clear();
    setMessage("");
    dialogRef.current?.open();
  };

  return (
    <section class="kap-account-page" aria-labelledby="kapProfileTitle">
      <header class="kap-profile-header"><div><span class="kpi-eyebrow">Account</span><h2 id="kapProfileTitle">Profile</h2></div>
        <oj-button chroming="callToAction" onojAction={openDialog}>Change password</oj-button>
      </header>
      <dl class="kap-profile-fields">
        <div><dt>Display name</dt><dd>{profile.displayName}</dd></div>
        <div><dt>Login ID</dt><dd>{profile.loginId}</dd></div>
        <div><dt>Access</dt><dd>{profile.access}</dd></div>
        <div><dt>Status</dt><dd>{profile.status}</dd></div>
      </dl>
      {message && <div class="kap-form-message" role="status">{message}</div>}

      <oj-dialog ref={dialogRef} initialVisibility="hide" dialogTitle="Change password" cancelBehavior={saving ? "none" : "icon"}
        onojClose={() => { if (!saving) clear(); }} class="kap-password-dialog">
        <form slot="body" class="kap-password-dialog__body" onSubmit={(event) => void submit(event)} noValidate>
          <oj-input-password value={currentPassword} labelEdge="inside" labelHint="Current password" autocomplete="current-password" required disabled={saving}
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setCurrentPassword(String(event.detail.value ?? ""))}></oj-input-password>
          <oj-input-password value={newPassword} labelEdge="inside" labelHint="New password" autocomplete="new-password" required disabled={saving}
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setNewPassword(String(event.detail.value ?? ""))}></oj-input-password>
          <oj-input-password value={confirmPassword} labelEdge="inside" labelHint="Confirm new password" autocomplete="new-password" required disabled={saving}
            onvalueChanged={(event: InputPasswordElement.valueChanged) => setConfirmPassword(String(event.detail.value ?? ""))}></oj-input-password>
          <p class="kap-password-policy-hint">{PASSWORD_POLICY_HINT}</p>
          {error && <div class="kap-form-message kap-form-message--error" role="alert">{error}</div>}
        </form>
        <div slot="footer">
          <oj-button disabled={saving} onojAction={() => dialogRef.current?.close()}>Cancel</oj-button>
          <oj-button chroming="callToAction" disabled={saving} onojAction={(event: Event) => void submit(event)}>{saving ? "Changing…" : "Change password"}</oj-button>
        </div>
      </oj-dialog>
    </section>
  );
}

import { ComponentChildren, h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "ojs/ojavatar";
import { fetchProfilePreferences, mergeProfilePreferences, profileLanguages, readAvatarFile, saveProfilePreferences } from "../../auth/profileApi";
import { getProfileInitials } from "../../auth/authSession";
import "ojs/ojbutton";
import "ojs/ojdialog";
import "ojs/ojinputtext";
import type { DialogElement } from "ojs/ojdialog";
import type { InputPasswordElement } from "ojs/ojinputtext";
import { changePassword } from "../../auth/authApi";
import type { AuthSession } from "../../auth/authSession";
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from "../../auth/passwordPolicy";

export function ProfilePage({ profile, onProfileUpdated, breadcrumb }: Readonly<{ profile: AuthSession; onProfileUpdated: (profile: AuthSession) => void; breadcrumb?: ComponentChildren }>) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [languageCode, setLanguageCode] = useState(profile.languageCode ?? "en");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(profile.avatarDataUrl ?? null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileGeneration = useRef(0);
  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true); setProfileError("");
    void fetchProfilePreferences().then(p => {
      if (cancelled) return;
      setDisplayName(p.displayName); setLanguageCode(p.languageCode); setAvatarDataUrl(p.avatarDataUrl);
      onProfileUpdated(mergeProfilePreferences(profile,p)); setProfileLoading(false);
    }).catch(e => { if (!cancelled) setProfileError(e instanceof Error ? e.message : "Unable to load profile."); });
    return () => { cancelled = true; fileGeneration.current++; };
  }, [profile.userKey, loadAttempt]);
  const chooseImage = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; input.value = "";
    if (!file) return;
    const generation = ++fileGeneration.current;
    setImageLoading(true); setProfileError(""); setProfileMessage("");
    try { const value = await readAvatarFile(file); if (generation === fileGeneration.current) setAvatarDataUrl(value); }
    catch(e) { if (generation === fileGeneration.current) setProfileError(e instanceof Error ? e.message : "Unable to read image."); }
    finally { if (generation === fileGeneration.current) setImageLoading(false); }
  };
  const saveProfile = async (event: Event) => {
    event.preventDefault();
    if (profileLoading || profileSaving || imageLoading) return;
    setProfileError(""); setProfileMessage("");
    const name = displayName.trim();
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) { setProfileError("Enter a display name of 1–120 characters without control characters."); return; }
    setProfileSaving(true);
    try {
      const p = await saveProfilePreferences({ displayName: name, languageCode, avatarDataUrl });
      setDisplayName(p.displayName); setAvatarDataUrl(p.avatarDataUrl);
      onProfileUpdated(mergeProfilePreferences(profile,p)); setProfileMessage("Profile saved.");
    } catch(e) { setProfileError(e instanceof Error ? e.message : "Unable to save profile."); }
    finally { setProfileSaving(false); }
  };
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
      <header class="kap-profile-header"><div>{breadcrumb}<span class="kpi-eyebrow">Account</span><h2 id="kapProfileTitle">Profile</h2></div>
        <oj-button chroming="callToAction" onojAction={openDialog}>Change password</oj-button>
      </header>
      <form class="kap-profile-editor" onSubmit={(event) => void saveProfile(event)}>
        <fieldset disabled={profileLoading || profileSaving || imageLoading}>
          <legend>Personal profile</legend>
          <div class="kap-profile-avatar-row">
            <oj-avatar src={avatarDataUrl ?? undefined} initials={getProfileInitials(displayName)} size="lg" shape="circle" aria-label="Profile photo preview"></oj-avatar>
            <div class="kap-profile-photo-actions">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => void chooseImage(event)} />
              <oj-button disabled={profileLoading || profileSaving || imageLoading} onojAction={() => fileRef.current?.click()}>{avatarDataUrl ? "Replace photo" : "Upload photo"}</oj-button>
              <oj-button disabled={!avatarDataUrl || profileLoading || profileSaving || imageLoading} onojAction={() => { fileGeneration.current++; setAvatarDataUrl(null); setProfileMessage(""); }}>Delete photo</oj-button>
              <p>PNG or JPEG, up to 256 KiB and 1024 × 1024 pixels. Save to apply changes.</p>
            </div>
          </div>
          <label>Display name<input value={displayName} maxLength={120} required onInput={(event) => setDisplayName(event.currentTarget.value)} /></label>
          <label>Preferred language<select value={languageCode} onChange={(event) => setLanguageCode(event.currentTarget.value)}>{profileLanguages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}</select></label>
          <p>Stores your preference only; interface translations are not enabled.</p>
          <oj-button chroming="callToAction" disabled={profileLoading || profileSaving || imageLoading} onojAction={(event: Event) => void saveProfile(event)}>{profileSaving ? "Saving…" : "Save profile"}</oj-button>
        </fieldset>
        {profileLoading && !profileError && <p role="status">Loading profile…</p>}
        {imageLoading && <p role="status">Reading photo…</p>}
        {profileError && <div class="kap-form-message kap-form-message--error" role="alert">{profileError}{profileLoading && <oj-button onojAction={() => setLoadAttempt(n => n + 1)}>Retry</oj-button>}</div>}
        {profileMessage && <div class="kap-form-message" role="status">{profileMessage}</div>}
      </form>
      <dl class="kap-profile-fields">
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

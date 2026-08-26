import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojinputtext";
import type { InputPasswordElement } from "ojs/ojinputtext";
import type { AuthSession, UserAccess } from "../../auth/authSession";
import {
  cancelUserInvite, disableUser, enableUser, inviteUser, listUsers, lockUser,
  reissueUserInvite, resetUserPassword, unlockUser
} from "../../auth/usersApi";

type DialogState = Readonly<{ kind: "invite" | "reissue" | "reset"; user?: AuthSession }> | null;

export function UsersPage() {
  const [users, setUsers] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [access, setAccess] = useState<UserAccess>("User");
  const temporaryPasswordRef = useRef<InputPasswordElement<string> | null>(null);

  const refresh = async () => {
    setLoading(true); setError("");
    try { setUsers(await listUsers()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Users are unavailable."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const clearDialog = () => {
    temporaryPasswordRef.current?.setProperty("value", "");
    setDisplayName(""); setLoginId(""); setAccess("User"); setDialogError(""); setDialog(null);
  };
  const openDialog = (next: NonNullable<DialogState>) => { setError(""); setDialogError(""); setDialog(next); };
  const submitDialog = async (event?: Event) => {
    event?.preventDefault();
    if (!dialog || busy) return;
    const temporaryPassword = String(temporaryPasswordRef.current?.rawValue ?? temporaryPasswordRef.current?.value ?? "");
    if (!temporaryPassword || (dialog.kind === "invite" && (!displayName.trim() || !loginId.trim()))) {
      setDialogError("Complete all required fields."); return;
    }
    setBusy(true); setDialogError("");
    try {
      if (dialog.kind === "invite") await inviteUser({ displayName: displayName.trim(), loginId, access, temporaryPassword });
      else if (dialog.kind === "reissue" && dialog.user) await reissueUserInvite(dialog.user.userKey, temporaryPassword);
      else if (dialog.kind === "reset" && dialog.user) await resetUserPassword(dialog.user.userKey, temporaryPassword);
      clearDialog();
      await refresh();
    } catch (caught) {
      temporaryPasswordRef.current?.setProperty("value", "");
      setDialogError(caught instanceof Error ? caught.message : "User action failed.");
    } finally { setBusy(false); }
  };
  const confirmAction = async (user: AuthSession, label: string, action: () => Promise<void>) => {
    if (!window.confirm(`${label} ${user.displayName}?`)) return;
    setBusy(true); setError("");
    try { await action(); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "User action failed."); }
    finally { setBusy(false); }
  };

  return (
    <section class="kap-account-page kap-users-page" aria-labelledby="kapUsersTitle">
      <header class="kap-users-header">
        <div><span class="kpi-eyebrow">Administration</span><h2 id="kapUsersTitle">Users</h2><p>Invite users and manage account access.</p></div>
        <oj-button chroming="callToAction" disabled={busy} onojAction={() => openDialog({ kind: "invite" })}>Invite user</oj-button>
      </header>
      {error && <div class="kap-form-message kap-form-message--error" role="alert">{error}</div>}
      {loading ? <div class="kap-empty-state" role="status">Loading users…</div> : users.length === 0 ? (
        <div class="kap-empty-state"><span class="oj-ux-ico-contact-group" aria-hidden="true"></span><h3>No users yet</h3><p>Invite the first user to this workspace.</p></div>
      ) : (
        <div class="kap-users-table-wrap"><table class="kap-users-table">
          <thead><tr><th>Display name</th><th>Login ID</th><th>Access</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.userKey}>
            <td>{user.displayName}</td><td>{user.loginId}</td><td>{user.access}</td><td><span class={`kap-status kap-status--${user.status.toLowerCase()}`}>{user.status}</span></td>
            <td><div class="kap-user-actions">
              {user.status === "INVITED" && <><button type="button" disabled={busy} onClick={() => openDialog({ kind: "reissue", user })}>Reissue</button><button type="button" disabled={busy} onClick={() => void confirmAction(user, "Cancel invite for", () => cancelUserInvite(user.userKey))}>Cancel invite</button></>}
              {user.status !== "INVITED" && user.status !== "DISABLED" && <button type="button" disabled={busy} onClick={() => openDialog({ kind: "reset", user })}>Reset password</button>}
              {user.access !== "Admin" && user.status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => void confirmAction(user, "Lock", () => lockUser(user.userKey))}>Lock</button>}
              {user.status === "LOCKED" && <button type="button" disabled={busy} onClick={() => void confirmAction(user, "Unlock", () => unlockUser(user.userKey))}>Unlock</button>}
              {user.status === "DISABLED" ? <button type="button" disabled={busy} onClick={() => void confirmAction(user, "Enable", () => enableUser(user.userKey))}>Enable</button> : user.access !== "Admin" && <button type="button" disabled={busy} onClick={() => void confirmAction(user, "Disable", () => disableUser(user.userKey))}>Disable</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
      {dialog && <div class="kap-dialog-backdrop" role="presentation"><section class="kap-action-dialog" role="dialog" aria-modal="true" aria-labelledby="kapUserDialogTitle">
        <form onSubmit={(event) => void submitDialog(event)}>
          <h3 id="kapUserDialogTitle">{dialog.kind === "invite" ? "Invite user" : dialog.kind === "reissue" ? "Reissue invitation" : "Reset password"}</h3>
          {dialogError && <div class="kap-form-message kap-form-message--error" role="alert">{dialogError}</div>}
          {dialog.kind === "invite" && <>
            <label>Display name<input value={displayName} onInput={(event) => setDisplayName((event.target as HTMLInputElement).value)} required /></label>
            <label>Login ID<input type="email" value={loginId} onInput={(event) => setLoginId((event.target as HTMLInputElement).value)} required /></label>
            <label>Access<select value={access} onChange={(event) => setAccess((event.target as HTMLSelectElement).value as UserAccess)}><option>Admin</option><option>User</option></select></label>
          </>}
          <oj-input-password ref={temporaryPasswordRef} labelEdge="inside" labelHint="Temporary password" autocomplete="new-password" required disabled={busy}></oj-input-password>
          <p class="kap-dialog-note">The temporary password is generated once, cleared after submission, and must be delivered securely by the administrator.</p>
          <footer><oj-button disabled={busy} onojAction={clearDialog}>Cancel</oj-button><oj-button chroming="callToAction" disabled={busy} onojAction={() => void submitDialog()}>{busy ? "Submitting…" : "Submit"}</oj-button></footer>
        </form>
      </section></div>}
    </section>
  );
}

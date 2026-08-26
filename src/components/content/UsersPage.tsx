import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojdialog";
import "ojs/ojinputtext";
import "ojs/ojselectsingle";
import type { DialogElement } from "ojs/ojdialog";
import type { InputTextElement } from "ojs/ojinputtext";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import {
  cancelUserInvite, disableUser, enableUser, inviteUser, listUsers, lockUser,
  reissueUserInvite, resetUserPassword, unlockUser, type UserActionLink
} from "../../auth/usersApi";
import type { AuthSession, UserAccess } from "../../auth/authSession";

type DialogState = Readonly<{ kind: "invite" | "reissue" | "reset"; user?: AuthSession }> | null;
const accessOptions = [{ value: "User", label: "User" }, { value: "Admin", label: "Admin" }];

const actionUrl = (link: UserActionLink): string => {
  const path = link.purpose === "ACTIVATION" ? "/activate" : "/reset-password";
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", link.actionToken);
  return url.toString();
};

export function UsersPage() {
  const [users, setUsers] = useState<AuthSession[]>([]);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [access, setAccess] = useState<UserAccess>("User");
  const [issuedLink, setIssuedLink] = useState<UserActionLink | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<DialogElement>(null);
  const accessProvider = useMemo(() => new ArrayDataProvider(accessOptions, { keyAttributes: "value" }), []);

  const reload = async () => {
    try { setUsers(await listUsers()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load users."); }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => { if (dialog) dialogRef.current?.open(); }, [dialog]);

  const openDialog = (next: Exclude<DialogState, null>) => {
    if (busy) return;
    setDialogError(""); setIssuedLink(null); setCopied(false);
    setDisplayName(next.user?.displayName ?? ""); setLoginId(next.user?.loginId ?? "");
    setAccess(next.user?.access ?? "User"); setDialog(next);
  };
  const clearDialog = () => {
    setDialog(null); setDialogError(""); setIssuedLink(null); setCopied(false);
    setDisplayName(""); setLoginId(""); setAccess("User");
  };
  const submitDialog = async () => {
    if (!dialog || busy) return;
    setDialogError(""); setBusy(true);
    try {
      const result = dialog.kind === "invite"
        ? await inviteUser({ displayName: displayName.trim(), loginId, access })
        : dialog.kind === "reissue" && dialog.user
          ? await reissueUserInvite(dialog.user.userKey)
          : dialog.kind === "reset" && dialog.user
            ? await resetUserPassword(dialog.user.userKey)
            : null;
      if (!result) throw new Error("Unable to create the action link.");
      setIssuedLink(result);
      await reload();
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : "User action failed.");
    } finally { setBusy(false); }
  };
  const copyLink = async () => {
    if (!issuedLink) return;
    try {
      await navigator.clipboard.writeText(actionUrl(issuedLink));
      setCopied(true); setDialogError("");
    } catch {
      setDialogError("Copy failed. Select and copy the link manually.");
    }
  };
  const confirmAction = async (message: string, action: () => Promise<void>) => {
    if (busy) return;
    if (!window.confirm(message)) return;
    try { setBusy(true); await action(); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "User action failed."); }
    finally { setBusy(false); }
  };

  const title = issuedLink
    ? issuedLink.purpose === "ACTIVATION" ? "Activation link ready" : "Password reset link ready"
    : dialog?.kind === "invite" ? "Invite user" : dialog?.kind === "reissue" ? "Reissue activation link" : "Create password reset link";

  return <section class="kap-account-page users-page">
    <div class="kap-users-header"><div><span class="kpi-eyebrow">Administration</span><h1>Users</h1><p>Manage application access and credential action links.</p></div>
      <oj-button chroming="callToAction" disabled={busy} onojAction={() => openDialog({ kind: "invite" })}>Invite user</oj-button></div>
    {error && <div class="kap-error" role="alert">{error}</div>}
    <div class="kap-users-table-wrap"><table class="kap-users-table"><thead><tr><th>Display name</th><th>Login ID</th><th>Access</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{users.map((user) => <tr key={user.userKey}><td data-label="Display name"><strong>{user.displayName}</strong></td><td data-label="Login ID">{user.loginId}</td><td data-label="Access"><span class="kap-access-badge">{user.access}</span></td><td data-label="Status"><span class={`kap-status kap-status--${user.status.toLowerCase()}`}>{user.status}</span></td><td data-label="Actions"><div class="kap-user-actions">
        {user.status === "INVITED" && <><oj-button chroming="outlined" disabled={busy} onojAction={() => openDialog({ kind: "reissue", user })}>Reissue</oj-button><oj-button chroming="borderless" disabled={busy} onojAction={() => void confirmAction(`Cancel invitation for ${user.loginId}?`, () => cancelUserInvite(user.userKey))}>Cancel invite</oj-button></>}
        {user.status === "ACTIVE" && <oj-button chroming="outlined" disabled={busy} onojAction={() => openDialog({ kind: "reset", user })}>Reset password</oj-button>}
        {user.status === "ACTIVE" && <oj-button chroming="borderless" disabled={busy || user.access === "Admin"} title={user.access === "Admin" ? "Admin accounts cannot be locked" : "Lock user"} onojAction={() => void confirmAction(`Lock ${user.loginId}?`, () => lockUser(user.userKey))}>Lock</oj-button>}
        {user.status === "LOCKED" && <oj-button chroming="borderless" disabled={busy} onojAction={() => void confirmAction(`Unlock ${user.loginId}?`, () => unlockUser(user.userKey))}>Unlock</oj-button>}
        {user.status === "DISABLED" && <oj-button chroming="borderless" disabled={busy} onojAction={() => void confirmAction(`Enable ${user.loginId}?`, () => enableUser(user.userKey))}>Enable</oj-button>}
        {(user.status === "ACTIVE" || user.status === "LOCKED") && <oj-button chroming="borderless" disabled={busy || user.access === "Admin"} title={user.access === "Admin" ? "Admin accounts cannot be disabled" : "Disable user"} onojAction={() => void confirmAction(`Disable ${user.loginId}?`, () => disableUser(user.userKey))}>Disable</oj-button>}
      </div></td></tr>)}</tbody></table></div>

    <oj-dialog ref={dialogRef} dialogTitle={title} cancelBehavior={busy ? "none" : "icon"} onojClose={() => { if (!busy) clearDialog(); }} class="kap-user-dialog">
      <div slot="body" class="kap-dialog-body">
        {issuedLink ? <>
          <p>No email was sent. Copy this one-time link and deliver it to <strong>{issuedLink.user.loginId}</strong> through an approved secure channel.</p>
          <label class="kap-field"><span>{issuedLink.purpose === "ACTIVATION" ? "Activation URL" : "Password reset URL"}</span>
            <oj-input-text value={actionUrl(issuedLink)} readonly={true}></oj-input-text></label>
          <div class="kap-user-link-meta"><span>Expires</span><strong>{new Date(issuedLink.expiresAt).toLocaleString()}</strong></div>
          <p class="kap-field__hint">The link expires at the time shown and can be used only once. Creating another link invalidates this one.</p>
          {copied && <div class="kap-success" role="status">Link copied.</div>}
        </> : <>
          {dialog?.kind === "invite" ? <>
            <label class="kap-field"><span>Display name</span><oj-input-text value={displayName} onvalueChanged={(event: InputTextElement.valueChanged) => setDisplayName(String(event.detail.value ?? ""))}></oj-input-text></label>
            <label class="kap-field"><span>Login ID</span><oj-input-text value={loginId} onvalueChanged={(event: InputTextElement.valueChanged) => setLoginId(String(event.detail.value ?? ""))}></oj-input-text></label>
            <label class="kap-field"><span>Access</span><oj-select-single data={accessProvider} value={access} onvalueChanged={(event: CustomEvent<{ value: UserAccess | null }>) => setAccess(event.detail.value ?? "User")}></oj-select-single></label>
            <p class="kap-field__hint">Submitting creates an activation URL. It does not send email.</p>
          </> : <p>{dialog?.kind === "reissue"
            ? `Create a new activation link for ${dialog.user?.loginId}? Any previous activation link will stop working.`
            : `Create a one-time password reset link for ${dialog?.user?.loginId}? The current password remains valid until the link is used.`}</p>}
        </>}
        {dialogError && <div class="kap-error" role="alert">{dialogError}</div>}
      </div>
      <div slot="footer">
        {issuedLink ? <><oj-button onojAction={() => void copyLink()}>Copy link</oj-button><oj-button chroming="callToAction" onojAction={() => dialogRef.current?.close()}>Done</oj-button></>
          : <><oj-button disabled={busy} onojAction={() => dialogRef.current?.close()}>Cancel</oj-button><oj-button chroming="callToAction" disabled={busy} onojAction={() => void submitDialog()}>{busy ? "Creating..." : "Create link"}</oj-button></>}
      </div>
    </oj-dialog>
  </section>;
}

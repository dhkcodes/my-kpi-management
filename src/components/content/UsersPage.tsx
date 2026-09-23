import { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojdialog";
import "ojs/ojinputtext";
import "ojs/ojselectsingle";
import type { DialogElement } from "ojs/ojdialog";
import type { InputTextElement } from "ojs/ojinputtext";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import {
  cancelUserInvite, deleteUser, disableUser, enableUser, inviteUser, listUsers, lockUser,
  reissueUserInvite, resetUserPassword, unlockUser, updateUserMenuPermissions, type UserActionLink
} from "../../auth/usersApi";
import { menuPermissionIds, type AuthSession, type MenuPermissionId, type MenuPermission, type MenuPermissionMap, type UserAccess } from "../../auth/authSession";

type DialogState = Readonly<{ kind: "invite" | "reissue" | "reset"; user?: AuthSession }> | null;
const accessOptions = [{ value: "User", label: "User" }, { value: "Admin", label: "Admin" }];
const menuLabels: Record<MenuPermissionId, string> = {
  "kpis-overview": "KPI", "weekly-activities": "Weekly", "customers-overview": "Customer 360", "accounts-workloads": "Accounts & Workloads",
  analysis: "Consumption Analysis", attainment: "Consumption Attainment", records: "Consumption Records"
};

const actionUrl = (link: UserActionLink): string => {
  const path = link.purpose === "ACTIVATION" ? "/activate" : "/reset-password";
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", link.actionToken);
  return url.toString();
};

export function UsersPage({ currentUserKey, breadcrumb }: Readonly<{ currentUserKey: string; breadcrumb?: ComponentChildren }>) {
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
  const [deleteCandidate, setDeleteCandidate] = useState<AuthSession | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [permissionCandidate, setPermissionCandidate] = useState<AuthSession | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<MenuPermissionMap>(() =>
    Object.fromEntries(menuPermissionIds.map((menu) => [menu, "NONE"])) as MenuPermissionMap);
  const [permissionError, setPermissionError] = useState("");
  const dialogRef = useRef<DialogElement>(null);
  const actionFormRef = useRef<HTMLFormElement>(null);
  const displayNameInputRef = useRef<InputTextElement | null>(null);
  const loginIdInputRef = useRef<InputTextElement | null>(null);
  const accessInputRef = useRef<(EventTarget & { value: UserAccess | null }) | null>(null);
  const actionSubmitLockRef = useRef(false);
  const deleteDialogRef = useRef<DialogElement>(null);
  const permissionDialogRef = useRef<DialogElement>(null);
  const accessProvider = useMemo(() => new ArrayDataProvider(accessOptions, { keyAttributes: "value" }), []);

  const reload = async () => {
    try { setUsers(await listUsers()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load users."); }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => { if (dialog) dialogRef.current?.open(); }, [dialog]);
  useEffect(() => { if (deleteCandidate) deleteDialogRef.current?.open(); }, [deleteCandidate]);
  useEffect(() => { if (permissionCandidate) permissionDialogRef.current?.open(); }, [permissionCandidate]);

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
  const submitDialog = async (event?: Event) => {
    event?.preventDefault();
    if (!dialog || issuedLink || actionSubmitLockRef.current) return;
    actionSubmitLockRef.current = true;
    setDialogError(""); setBusy(true);
    try {
      const submittedDisplayName = String(displayNameInputRef.current?.value ?? displayName).trim();
      const submittedLoginId = String(loginIdInputRef.current?.value ?? loginId).trim();
      const submittedAccess = accessInputRef.current?.value ?? access;
      if (dialog.kind === "invite" && !submittedDisplayName) throw new Error("Enter a display name.");
      if (dialog.kind === "invite" && !submittedLoginId) throw new Error("Enter a Login ID.");
      const result = dialog.kind === "invite"
        ? await inviteUser({ displayName: submittedDisplayName, loginId: submittedLoginId, access: submittedAccess })
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
    } finally {
      actionSubmitLockRef.current = false;
      setBusy(false);
    }
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
  const openPermissionDialog = (user: AuthSession) => {
    if (busy || user.access === "Admin") return;
    setPermissionError("");
    setPermissionDraft(Object.fromEntries(menuPermissionIds.map((menu) => [menu, user.menuPermissions[menu] ?? "NONE"])) as MenuPermissionMap);
    setPermissionCandidate(user);
  };
  const changePermission = (menu: MenuPermissionId, level: "READ" | "WRITE", checked: boolean) => {
    const current = permissionDraft[menu] ?? "NONE";
    const next: MenuPermission = level === "WRITE"
      ? checked ? "WRITE" : current === "WRITE" ? "READ" : current
      : checked ? current === "WRITE" ? "WRITE" : "READ" : "NONE";
    setPermissionDraft({ ...permissionDraft, [menu]: next });
  };
  const savePermissions = async () => {
    if (busy || !permissionCandidate || permissionCandidate.access === "Admin") return;
    try {
      setBusy(true);
      const updated = await updateUserMenuPermissions(permissionCandidate.userKey, permissionDraft);
      setUsers((current) => current.map((candidate) => candidate.userKey === updated.userKey ? updated : candidate));
      setPermissionError("");
      setPermissionCandidate(null);
      permissionDialogRef.current?.close();
    } catch (cause) {
      setPermissionError(cause instanceof Error ? cause.message : "Unable to save menu permissions.");
    } finally { setBusy(false); }
  };
  const openDeleteDialog = (user: AuthSession) => {
    if (busy || user.userKey === currentUserKey) return;
    setDeleteError("");
    setDeleteCandidate(user);
  };
  const confirmPermanentDelete = async () => {
    if (!deleteCandidate || busy || deleteCandidate.userKey === currentUserKey) return;
    setDeleteError("");
    setBusy(true);
    try {
      await deleteUser(deleteCandidate.userKey);
      await reload();
      deleteDialogRef.current?.close();
      setDeleteCandidate(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "User deletion failed.");
    } finally { setBusy(false); }
  };

  const title = issuedLink
    ? issuedLink.purpose === "ACTIVATION" ? "Activation link ready" : "Password reset link ready"
    : dialog?.kind === "invite" ? "Invite user" : dialog?.kind === "reissue" ? "Reissue activation link" : "Create password reset link";

  return <section class="kap-account-page users-page">
    <div class="kap-users-header"><div>{breadcrumb}<span class="kpi-eyebrow">Administration</span><h1>Users</h1><p>Manage application access and credential action links.</p></div>
      <oj-button chroming="callToAction" disabled={busy} onojAction={() => openDialog({ kind: "invite" })}>Invite user</oj-button></div>
    {error && <div class="kap-error" role="alert">{error}</div>}
    <div class="kap-users-table-wrap"><table class="kap-users-table"><thead><tr><th>Display name</th><th>Login ID</th><th>Access</th><th>Status</th><th>Menu permissions</th><th>Actions</th></tr></thead>
      <tbody>{users.map((user) => <tr key={user.userKey}><td data-label="Display name"><strong>{user.displayName}</strong></td><td data-label="Login ID">{user.loginId}</td><td data-label="Access"><span class="kap-access-badge">{user.access}</span></td><td data-label="Status"><span class={`kap-status kap-status--${user.status.toLowerCase()}`}>{user.status}</span></td><td data-label="Menu permissions">
        {user.access === "Admin" ? <span>Default WRITE</span> : <oj-button chroming="outlined" disabled={busy}
          onojAction={() => openPermissionDialog(user)}>Edit permissions</oj-button>}
      </td><td data-label="Actions"><div class="kap-user-actions">
        {user.status === "INVITED" && <><oj-button chroming="outlined" disabled={busy} onojAction={() => openDialog({ kind: "reissue", user })}>Reissue</oj-button><oj-button chroming="borderless" disabled={busy} onojAction={() => void confirmAction(`Cancel invitation for ${user.loginId}?`, () => cancelUserInvite(user.userKey))}>Cancel invite</oj-button></>}
        {user.status === "ACTIVE" && <oj-button chroming="outlined" disabled={busy} onojAction={() => openDialog({ kind: "reset", user })}>Reset password</oj-button>}
        {user.status === "ACTIVE" && <oj-button chroming="borderless" disabled={busy || user.access === "Admin"} title={user.access === "Admin" ? "Admin accounts cannot be locked" : "Lock user"} onojAction={() => void confirmAction(`Lock ${user.loginId}?`, () => lockUser(user.userKey))}>Lock</oj-button>}
        {user.status === "LOCKED" && <oj-button chroming="borderless" disabled={busy} onojAction={() => void confirmAction(`Unlock ${user.loginId}?`, () => unlockUser(user.userKey))}>Unlock</oj-button>}
        {user.status === "DISABLED" && <oj-button chroming="borderless" disabled={busy} onojAction={() => void confirmAction(`Enable ${user.loginId}?`, () => enableUser(user.userKey))}>Enable</oj-button>}
        {(user.status === "ACTIVE" || user.status === "LOCKED") && <oj-button chroming="borderless" disabled={busy || user.access === "Admin"} title={user.access === "Admin" ? "Admin accounts cannot be disabled" : "Disable user"} onojAction={() => void confirmAction(`Disable ${user.loginId}?`, () => disableUser(user.userKey))}>Disable</oj-button>}
        <oj-button chroming="borderless" disabled={busy || user.userKey === currentUserKey}
          title={user.userKey === currentUserKey ? "You cannot permanently delete your own signed-in account" : "Permanently delete user"}
          onojAction={() => openDeleteDialog(user)}>Delete</oj-button>
      </div></td></tr>)}</tbody></table></div>

    <oj-dialog ref={dialogRef} initialVisibility="hide" dialogTitle={title} cancelBehavior={busy ? "none" : "icon"} onojClose={() => { if (!busy) clearDialog(); }} class="kap-user-dialog">
      <form ref={actionFormRef} slot="body" class="kap-dialog-body" onSubmit={submitDialog}>
        {issuedLink ? <>
          <p>No email was sent. Copy this one-time link and deliver it to <strong>{issuedLink.user.loginId}</strong> through an approved secure channel.</p>
          <label class="kap-field"><span>{issuedLink.purpose === "ACTIVATION" ? "Activation URL" : "Password reset URL"}</span>
            <oj-input-text value={actionUrl(issuedLink)} readonly={true}></oj-input-text></label>
          <div class="kap-user-link-meta"><span>Expires</span><strong>{new Date(issuedLink.expiresAt).toLocaleString()}</strong></div>
          <p class="kap-field__hint">The link expires at the time shown and can be used only once. Creating another link invalidates this one.</p>
          {copied && <div class="kap-success" role="status">Link copied.</div>}
        </> : <>
          {dialog?.kind === "invite" ? <>
            <label class="kap-field"><span>Display name</span><oj-input-text ref={displayNameInputRef} value={displayName} required onvalueChanged={(event: InputTextElement.valueChanged) => setDisplayName(String(event.detail.value ?? ""))}></oj-input-text></label>
            <label class="kap-field"><span>Login ID</span><oj-input-text ref={loginIdInputRef} value={loginId} required onvalueChanged={(event: InputTextElement.valueChanged) => setLoginId(String(event.detail.value ?? ""))}></oj-input-text></label>
            <label class="kap-field"><span>Access</span><oj-select-single ref={accessInputRef} data={accessProvider} value={access} onvalueChanged={(event: CustomEvent<{ value: UserAccess | null }>) => setAccess(event.detail.value ?? "User")}></oj-select-single></label>
            <p class="kap-field__hint">Submitting creates an activation URL. It does not send email.</p>
          </> : <p>{dialog?.kind === "reissue"
            ? `Create a new activation link for ${dialog.user?.loginId}? Any previous activation link will stop working.`
            : `Create a one-time password reset link for ${dialog?.user?.loginId}? The current password remains valid until the link is used.`}</p>}
        </>}
        {dialogError && <div class="kap-error" role="alert">{dialogError}</div>}
        <button type="submit" hidden disabled={busy || Boolean(issuedLink)}>Submit</button>
      </form>
      <div slot="footer">
        {issuedLink ? <><oj-button onojAction={() => void copyLink()}>Copy link</oj-button><oj-button chroming="callToAction" onojAction={() => dialogRef.current?.close()}>Done</oj-button></>
          : <><oj-button disabled={busy} onojAction={() => dialogRef.current?.close()}>Cancel</oj-button><oj-button chroming="callToAction" disabled={busy} onojAction={() => actionFormRef.current?.requestSubmit()}>{busy ? "Creating..." : "Create link"}</oj-button></>}
      </div>
    </oj-dialog>
    <oj-dialog ref={permissionDialogRef} initialVisibility="hide" dialogTitle="Menu permissions"
      cancelBehavior={busy ? "none" : "icon"}
      onojClose={() => { if (!busy) { setPermissionCandidate(null); setPermissionError(""); } }}
      class="kap-user-dialog kap-permission-dialog">
      <div slot="body" class="kap-dialog-body">
        {permissionCandidate && <p><strong>{permissionCandidate.displayName}</strong> ({permissionCandidate.loginId})</p>}
        <div class="kap-permission-table-wrap"><table class="kap-permission-table">
          <thead><tr><th>Menu</th><th>Read</th><th>Write</th></tr></thead>
          <tbody>{menuPermissionIds.map((menu) => {
            const access = permissionDraft[menu] ?? "NONE";
            return <tr key={menu}><th scope="row">{menuLabels[menu]}</th>
              <td><input type="checkbox" aria-label={`${menuLabels[menu]} read`} checked={access === "READ" || access === "WRITE"}
                disabled={busy} onChange={(event) => changePermission(menu, "READ", event.currentTarget.checked)} /></td>
              <td><input type="checkbox" aria-label={`${menuLabels[menu]} write`} checked={access === "WRITE"}
                disabled={busy} onChange={(event) => changePermission(menu, "WRITE", event.currentTarget.checked)} /></td></tr>;
          })}</tbody>
        </table></div>
        <p class="kap-field__hint">Write permission includes read access. KPI and Weekly remain limited to each user's own data.</p>
        {permissionError && <div class="kap-error" role="alert">{permissionError}</div>}
      </div>
      <div slot="footer">
        <oj-button disabled={busy} onojAction={() => permissionDialogRef.current?.close()}>Cancel</oj-button>
        <oj-button chroming="callToAction" disabled={busy} onojAction={() => void savePermissions()}>{busy ? "Saving…" : "Save permissions"}</oj-button>
      </div>
    </oj-dialog>
    <oj-dialog ref={deleteDialogRef} initialVisibility="hide" dialogTitle="Permanently delete user"
      cancelBehavior={busy ? "none" : "icon"} onojClose={() => { if (!busy) { setDeleteCandidate(null); setDeleteError(""); } }}
      class="kap-user-dialog">
      <div slot="body" class="kap-dialog-body">
        <div class="kap-destructive-warning" role="alert"><strong>This action cannot be undone.</strong> The user and their application access will be permanently deleted.</div>
        {deleteCandidate && <p>Permanently delete <strong>{deleteCandidate.displayName}</strong> ({deleteCandidate.loginId})?</p>}
        {deleteError && <div class="kap-error" role="alert">{deleteError}</div>}
      </div>
      <div slot="footer">
        <oj-button disabled={busy} onojAction={() => deleteDialogRef.current?.close()}>Cancel</oj-button>
        <oj-button chroming="callToAction" disabled={busy} onojAction={() => void confirmPermanentDelete()}>{busy ? "Deleting…" : "Permanently delete"}</oj-button>
      </div>
    </oj-dialog>
  </section>;
}

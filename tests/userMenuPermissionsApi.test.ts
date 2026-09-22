import assert from "node:assert/strict";
import { updateUserMenuPermissions } from "../src/auth/usersApi";
import type { MenuPermissionMap } from "../src/auth/authSession";

const permissions: MenuPermissionMap = {
  "kpis-overview": "READ", "weekly-activities": "WRITE", "customers-overview": "NONE",
  "accounts-workloads": "READ", analysis: "WRITE", attainment: "READ", records: "NONE"
};
void (async () => {
  let request: { input: string; init?: RequestInit } | undefined;
  const updated = await updateUserMenuPermissions("user/one", permissions, async (input, init) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ userKey: "user/one", displayName: "One", loginId: "one@example.com", access: "User", status: "ACTIVE", menuPermissions: permissions }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  assert.equal(request?.input, "/api/v1/users/user%2Fone/menu-permissions");
  assert.equal(request?.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { menuPermissions: permissions });
  assert.deepEqual(updated.menuPermissions, permissions);
  console.log("user menu permissions API tests passed");
})();

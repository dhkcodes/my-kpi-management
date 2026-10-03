import * as assert from "node:assert/strict";
import {
  codexAuthenticationLabel,
  codexConnectionPrimaryLabel,
  codexConnectivityLabel,
  preserveAuthenticationDuringTransientFailure,
  type CodexConnectionStatus,
} from "../src/data/codexConnection";

assert.equal(codexAuthenticationLabel("AUTH_REQUIRED"), "인증 필요");
assert.equal(codexAuthenticationLabel("CONNECTED"), "인증 및 연결됨");
assert.equal(codexAuthenticationLabel("REAUTH_REQUIRED"), "재인증 필요");
assert.equal(codexConnectivityLabel("TEMPORARY_UNAVAILABLE"), "일시적 연결 장애");
assert.equal(codexConnectivityLabel("REFRESHING"), "연결 갱신 중");
assert.equal(codexConnectivityLabel("AVAILABLE"), null);
assert.equal(codexConnectionPrimaryLabel({
  authentication: "AUTH_REQUIRED", connectivity: "AVAILABLE", integrationAvailable: false,
  summarySupported: false, transcriptionSupported: false, detail: "not configured",
}), "연결 기능 미준비", "an unavailable integration must not look actionable as user authentication");

const connected: CodexConnectionStatus = {
  authentication: "CONNECTED",
  connectivity: "AVAILABLE",
  integrationAvailable: true,
  summarySupported: true,
  transcriptionSupported: false,
  detail: "connected",
};
const temporaryFailure = preserveAuthenticationDuringTransientFailure(connected);
assert.equal(temporaryFailure.authentication, "CONNECTED", "transient failures must preserve the authenticated state");
assert.equal(temporaryFailure.connectivity, "TEMPORARY_UNAVAILABLE");
assert.equal(temporaryFailure.summarySupported, true);
assert.equal(temporaryFailure.transcriptionSupported, false);
assert.match(temporaryFailure.detail, /기존 인증은 유지/);
console.log("Codex connection policy tests passed");

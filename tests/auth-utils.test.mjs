import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authLinkState,
  authErrorMessage,
  normalizeEmail,
  validateNewPassword,
} from "../src/auth-utils.ts";
test("invitation and recovery intent survives URL consumption by capturing it first", () => {
  const captured = authLinkState("#type=invite&access_token=fixture-only");
  assert.equal(captured.passwordSetup, true);
  assert.equal(authLinkState("").passwordSetup, false);
  assert.equal(authLinkState("#type=recovery").passwordSetup, true);
  assert.equal(authLinkState("#type=magiclink").passwordSetup, false);
});
test("expired links and email limits produce actionable messages", () => {
  assert.match(
    authLinkState("#error=access_denied&error_code=otp_expired").error,
    /expired/,
  );
  assert.match(
    authErrorMessage({ code: "over_email_send_rate_limit" }),
    /sending limit/,
  );
  assert.match(
    authErrorMessage({ code: "invalid_credentials" }),
    /app password/,
  );
});
test("email is normalized and mismatched passwords are rejected before submission", () => {
  assert.equal(
    normalizeEmail(" Example@Example.invalid "),
    "example@example.invalid",
  );
  assert.match(validateNewPassword("short", "short"), /12/);
  assert.match(
    validateNewPassword("fixture-password-123", "fixture-password-456"),
    /do not match/,
  );
  assert.equal(
    validateNewPassword("fixture-password-123", "fixture-password-123"),
    "",
  );
});

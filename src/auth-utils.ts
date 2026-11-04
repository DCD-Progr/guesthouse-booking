export function authLinkState(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const type = params.get("type");
  return {
    passwordSetup: type === "invite" || type === "recovery",
    error: params.has("error")
      ? "This email link is invalid or has expired. Request a new sign-in or password-reset link."
      : "",
  };
}
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function authErrorMessage(error: unknown) {
  const e = error as { code?: string; status?: number; message?: string };
  if (
    e?.code === "over_email_send_rate_limit" ||
    /email rate limit/i.test(e?.message ?? "")
  )
    return "The email service has reached its sending limit. Another email cannot be sent right now. Password sign-in still works if you have set a password; otherwise contact the administrator to restore email delivery.";
  if (e?.status === 429)
    return "Too many attempts. Wait before trying again. Repeated clicks will not restore access.";
  if (e?.code === "invalid_credentials")
    return "The email or app password was not accepted. Use the password set for Guesthouse, or choose Reset password. Your Microsoft password is not connected to this app.";
  return e?.message || "The request could not be completed. Please try again.";
}
export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 12)
    return "Use at least 12 characters for your new password.";
  if (password !== confirmation) return "The two passwords do not match.";
  return "";
}

import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return response(405, { error: "POST required." });
  if (!allowedOrigin || !appUrl)
    return response(503, { error: "Invitation service is not configured." });
  if (req.headers.get("origin") !== allowedOrigin)
    return response(403, { error: "Origin not allowed." });
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return response(401, { error: "Sign in first." });
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const publicKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(projectUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(
    authorization.slice(7),
  );
  if (authError || !auth.user)
    return response(401, { error: "Invalid session." });
  const { data: role, error: roleError } = await userClient.rpc("my_role");
  if (roleError || role !== "admin")
    return response(403, { error: "Administrator access required." });
  let payload;
  try {
    payload = await req.json();
  } catch {
    return response(400, { error: "Invalid request." });
  }
  const email = String(payload.email ?? "")
    .trim()
    .toLowerCase();
  const name = String(payload.full_name ?? "").trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !name ||
    name.length > 150
  )
    return response(400, { error: "Enter a valid work email and full name." });
  const { data: existing, error: lookupError } = await userClient
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);
  if (lookupError)
    return response(500, { error: "Could not check existing staff." });
  if (existing?.length)
    return response(409, {
      error: "Staff member already exists. Edit their access instead.",
    });
  // The privileged credential stays exclusively in the function environment.
  const secret =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret)
    return response(503, {
      error: "Invitation credentials are not configured.",
    });
  const adminClient = createClient(projectUrl, secret, {
    auth: { persistSession: false },
  });
  const { data: invite, error } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: appUrl,
    });
  if (error || !invite.user)
    return response(400, {
      error:
        "Invitation could not be sent. Check whether this email already has an account and review Auth logs.",
    });
  // Re-check live administrator authority in the transaction which grants app access.
  const { error: profileError } = await userClient.rpc(
    "provision_invited_staff",
    { p_user: invite.user.id, p_name: name },
  );
  if (profileError)
    return response(500, {
      error:
        "Invitation was created but staff access was not activated. An administrator must finish provisioning before this user can access data.",
    });
  return response(200, { ok: true });
});

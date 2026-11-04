import { useCallback, useEffect, useRef, useState } from "react";
import {
  BedDouble,
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  CheckCircle2,
  Building2,
  Users,
  History,
  LogOut,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import {
  configured,
  getProfile,
  loadData,
  rpc,
  supabase,
  initialAuthLink,
} from "./api";
import {
  authErrorMessage,
  normalizeEmail,
  validateNewPassword,
} from "./auth-utils";
import { demoData, demoRpc, demoUsers } from "./demo";
import type { Data, Page, Profile, RpcArgs } from "./types";
import { Context } from "./context";
import { Availability } from "./pages/Availability";
import { Requests } from "./pages/Requests";
import { Overview } from "./pages/Overview";
import { Activity, Calendar, Inventory, Staff } from "./pages/Operations";
import { Field } from "./components/UI";
const icons = {
  Overview: LayoutDashboard,
  Availability: BedDouble,
  "My requests": ClipboardList,
  Approvals: CheckCircle2,
  Calendar: CalendarDays,
  Inventory: Building2,
  Staff: Users,
  Activity: History,
};
export default function App() {
  const [demo, setDemo] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState<Page>("Availability");
  const [busy, setBusy] = useState(false);
  const [boot, setBoot] = useState(configured);
  const [error, setError] = useState(initialAuthLink.error);
  const [message, setMessage] = useState("");
  const [mobile, setMobile] = useState(false);
  const [passwordMode, setPasswordMode] = useState(
    initialAuthLink.passwordSetup,
  );
  const [authEmail, setAuthEmail] = useState("");
  const [emailCooldown, setEmailCooldown] = useState(0);
  const mounted = useRef(true);
  const refreshVersion = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  const requestLock = useRef(false);
  const notify = useCallback((s: string) => {
    setError("");
    setMessage(s);
  }, []);
  const refresh = useCallback(async () => {
    if (demo) return;
    const version = ++refreshVersion.current;
    try {
      const p = await getProfile();
      const d = await loadData();
      if (mounted.current && version === refreshVersion.current) {
        setUser(p);
        setData(d);
      }
    } catch (e) {
      if (version !== refreshVersion.current) return;
      setUser(null);
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load your account.");
    } finally {
      if (version === refreshVersion.current) setBoot(false);
    }
  }, [demo]);
  useEffect(() => {
    mounted.current = true;
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(authErrorMessage(error));
      if (data.session) void refresh();
      else setBoot(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") setPasswordMode(true);
        if (event === "SIGNED_OUT") {
          refreshVersion.current++;
          setPasswordMode(false);
          setUser(null);
          setData(null);
        } else if (session) setTimeout(() => void refresh(), 0);
      },
    );
    return () => {
      mounted.current = false;
      refreshVersion.current++;
      listener.subscription.unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timeout = setTimeout(
      () => setEmailCooldown((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => clearTimeout(timeout);
  }, [emailCooldown]);
  async function call<T = unknown>(
    name: string,
    args: RpcArgs = {},
  ): Promise<T> {
    if (requestLock.current)
      throw new Error("An operation is already running.");
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      let value: unknown;
      if (demo) {
        const r = demoRpc(dataRef.current!, user!, name, args);
        value = r.value;
        setData(r.data);
        dataRef.current = r.data;
        const p = r.data.profiles.find((p) => p.id === user!.id);
        if (p) setUser(p);
      } else if (name === "invite_staff") {
        const r = await supabase!.functions.invoke("invite-staff", {
          body: args,
        });
        if (r.error) throw new Error(r.error.message);
        if (r.data?.error) throw new Error(r.data.error);
        value = r.data;
        await refresh();
      } else {
        value = await rpc(name, args);
        await refresh();
      }
      return value as T;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The operation failed. Please retry.",
      );
      throw e;
    } finally {
      setBusy(false);
      requestLock.current = false;
    }
  }
  async function auth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (passwordMode) {
        const password = String(f.get("password"));
        const validation = validateNewPassword(
          password,
          String(f.get("confirmPassword")),
        );
        if (validation) throw new Error(validation);
        const { data: sessionData } = await supabase!.auth.getSession();
        if (!sessionData.session)
          throw new Error(
            "Open a fresh invitation or password-reset link before setting a password.",
          );
        const { error } = await supabase!.auth.updateUser({
          password: String(f.get("password")),
        });
        if (error) throw error;
        setPasswordMode(false);
        notify("Password saved.");
        await refresh();
      } else {
        const { error } = await supabase!.auth.signInWithPassword({
          email: normalizeEmail(authEmail),
          password: String(f.get("password")),
        });
        if (error) throw error;
        await refresh();
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function requestEmail(kind: "signin" | "reset") {
    const email = normalizeEmail(authEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter your work email first.");
      return;
    }
    if (busy || emailCooldown > 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const result =
        kind === "reset"
          ? await supabase!.auth.resetPasswordForEmail(email, { redirectTo })
          : await supabase!.auth.signInWithOtp({
              email,
              options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
            });
      if (result.error) throw result.error;
      notify(
        kind === "reset"
          ? "If this email has an account, a password-reset link has been requested. Open the newest email to set your password."
          : "If this email has an account, a sign-in link has been requested. Open the newest email; links work only once.",
      );
      setEmailCooldown(60);
    } catch (e) {
      setError(authErrorMessage(e));
      if ((e as { status?: number })?.status === 429) setEmailCooldown(60);
    } finally {
      setBusy(false);
    }
  }
  async function signout() {
    refreshVersion.current++;
    if (supabase && !demo) await supabase.auth.signOut();
    setPasswordMode(false);
    setUser(null);
    setData(null);
    setDemo(false);
    setPage("Availability");
  }
  if (boot)
    return (
      <div className="auth-shell">
        <p role="status">Loading your workspace…</p>
      </div>
    );
  if (!user || !data || passwordMode)
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="brand">
            <BedDouble size={30} />
            <strong>Guesthouse</strong>
          </div>
          <h1>
            {passwordMode
              ? "Set your password"
              : configured
                ? "Welcome back"
                : "Your booking workspace"}
          </h1>
          <p>
            {configured
              ? "Staff accommodation, approvals and travel tracking."
              : "The application is ready for database setup. Explore a sample workflow while live booking is being configured."}
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {configured && (
            <form onSubmit={auth}>
              {!passwordMode && (
                <Field label="Work email">
                  <input
                    autoComplete="username"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                  />
                </Field>
              )}
              <Field label={passwordMode ? "New password" : "Password"}>
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    passwordMode ? "new-password" : "current-password"
                  }
                  minLength={passwordMode ? 12 : 1}
                  required
                />
              </Field>
              {passwordMode && (
                <Field label="Confirm new password">
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                </Field>
              )}
              <button disabled={busy}>
                {passwordMode ? "Save password" : "Sign in"}
              </button>
              {!passwordMode && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void requestEmail("signin")}
                  disabled={busy || emailCooldown > 0}
                >
                  Email me a sign-in link
                </button>
              )}
              {!passwordMode && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void requestEmail("reset")}
                  disabled={busy || emailCooldown > 0}
                >
                  Reset password
                </button>
              )}
              {emailCooldown > 0 && (
                <p className="muted" role="status">
                  Check your inbox before requesting another email. Retry
                  available in {emailCooldown}s.
                </p>
              )}
            </form>
          )}
          {!configured && (
            <p className="notice">
              Live reservations and staff accounts require a connected Supabase
              project. Sample data is fictional and resets when you leave.
            </p>
          )}
          <button
            className="secondary"
            onClick={() => {
              refreshVersion.current++;
              setDemo(true);
              setData(demoData());
              setUser(demoUsers[0]);
              setPage("Availability");
              setError("");
              setBoot(false);
            }}
          >
            Explore sample workspace
          </button>
          <p className="muted">
            Access is by invitation. Contact your administrator for a staff
            account.
          </p>
        </section>
      </div>
    );
  const canApprove = data.approver_id === user.id;
  const pages: Page[] = [
    "Overview",
    "Availability",
    "My requests",
    ...(canApprove ? ["Approvals" as Page] : []),
    ...(canApprove || user.role === "admin" ? ["Calendar" as Page] : []),
    ...(user.role === "admin" ? ["Inventory" as Page, "Staff" as Page] : []),
    ...(canApprove || user.role === "admin" ? ["Activity" as Page] : []),
  ];
  const safePage = pages.includes(page) ? page : "Availability";
  return (
    <Context.Provider value={{ data, user, demo, busy, call, refresh, notify }}>
      <div className="app-shell">
        <aside className={mobile ? "sidebar open" : "sidebar"}>
          <div className="brand">
            <BedDouble size={27} />
            <strong>Guesthouse</strong>
          </div>
          <nav aria-label="Main navigation">
            {pages.map((p) => {
              const Icon = icons[p];
              return (
                <button
                  className={safePage === p ? "nav active" : "nav"}
                  key={p}
                  aria-label={p}
                  onClick={() => {
                    setPage(p);
                    setMobile(false);
                  }}
                >
                  <Icon size={21} />
                  <span>{p}</span>
                  {p === "Approvals" && (
                    <b>
                      {
                        data.requests.filter((q) => q.status === "pending")
                          .length
                      }
                    </b>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-footer">
            <small>
              {user.role === "admin"
                ? "Administration"
                : canApprove
                  ? "Designated approver"
                  : "Staff workspace"}
            </small>
            <button className="nav" onClick={() => void signout()}>
              <LogOut size={18} /> {demo ? "Leave sample" : "Sign out"}
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="workspace">
          <header>
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(!mobile)}
              >
                {mobile ? <X /> : <Menu />}
              </button>
              <Building2 size={19} />
              <span>Accommodation</span>
            </div>
            <div className="account">
              {demo && (
                <select
                  aria-label="Sample role"
                  value={user.id}
                  onChange={(e) => {
                    setUser(
                      data.profiles.find((u) => u.id === e.target.value)!,
                    );
                    setPage("Availability");
                    setError("");
                  }}
                >
                  {demoUsers.map((p) => (
                    <option key={p.id} value={p.id}>
                      Sample {p.role}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="icon-button"
                aria-label="Refresh data"
                disabled={busy || demo}
                onClick={() => void refresh()}
              >
                <RefreshCw size={17} />
              </button>
              <span className="avatar">
                {user.full_name
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <span className="account-name">{user.full_name}</span>
            </div>
          </header>
          {demo && (
            <div className="demo-banner">
              Sample workspace · Fictional data · Changes last only for this
              session
            </div>
          )}
          <main>
            {error && (
              <div className="error" role="alert">
                <span>{error}</span>
                <button
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {message && (
              <div className="notice" role="status">
                {message}
              </div>
            )}
            {safePage === "Overview" ? (
              <Overview />
            ) : safePage === "Availability" ? (
              <Availability />
            ) : safePage === "My requests" ? (
              <Requests key="my-requests" />
            ) : safePage === "Approvals" ? (
              <Requests key="approvals" approval />
            ) : safePage === "Calendar" ? (
              <Calendar />
            ) : safePage === "Inventory" ? (
              <Inventory />
            ) : safePage === "Staff" ? (
              <Staff />
            ) : (
              <Activity />
            )}
          </main>
          <footer>
            Staff accommodation workspace
            <span>
              {busy ? "Updating…" : demo ? "Sample data" : "Connected"}
            </span>
          </footer>
        </div>
      </div>
    </Context.Provider>
  );
}

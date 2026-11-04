import { createClient } from "@supabase/supabase-js";
import type { Data, Profile, RpcArgs } from "./types";
import { authLinkState } from "./auth-utils";
// Capture invitation/recovery intent before Auth consumes and clears the URL.
export const initialAuthLink = authLinkState(window.location.hash);
export const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const supabase = configured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          flowType: "implicit",
          persistSession: false,
          detectSessionInUrl: true,
        },
      },
    )
  : null;
export async function rpc<T = unknown>(
  name: string,
  args: RpcArgs = {},
): Promise<T> {
  if (!supabase)
    throw new Error("Connect a Supabase project before using live booking.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export async function loadData(): Promise<Data> {
  if (!supabase) throw new Error("Database is not configured.");
  const names = [
    "profiles",
    "guesthouses",
    "rooms",
    "requests",
    "room_allocations",
    "room_blocks",
    "activity_events",
  ] as const;
  const entries = await Promise.all(
    names.map(async (name) => {
      let rows: unknown[] = [];
      let from = 0;
      // Supabase/PostgREST can cap responses. Fetch every page; RLS applies on each page.
      for (;;) {
        const { data, error } = await supabase!
          .from(name)
          .select("*")
          .order("id")
          .range(from, from + 499);
        if (error) throw new Error(error.message);
        rows = rows.concat(data);
        if (data.length < 500) break;
        from += 500;
      }
      return [name, rows] as const;
    }),
  );
  const { data, error } = await supabase
    .from("settings")
    .select("approver_id")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...Object.fromEntries(entries),
    approver_id: data.approver_id,
  } as Data;
}
export async function getProfile(): Promise<Profile> {
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in.");
  const result = await supabase!
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (result.error || !result.data?.active)
    throw new Error(
      "Your staff account is not active. Contact the administrator.",
    );
  return result.data;
}

import { createContext, useContext } from "react";
import type { Data, Profile, RpcArgs } from "./types";
export type AppContext = {
  data: Data;
  user: Profile;
  demo: boolean;
  busy: boolean;
  call: <T = unknown>(name: string, args?: RpcArgs) => Promise<T>;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
};
export const Context = createContext<AppContext | null>(null);
export function useApp() {
  const c = useContext(Context);
  if (!c) throw new Error("Application context missing.");
  return c;
}

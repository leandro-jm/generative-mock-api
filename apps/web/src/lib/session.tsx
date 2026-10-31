import { createContext, useContext } from "react";
import type { User } from "./api";

export interface Session {
  user: User;
  appName: string;
  secretGenerated: boolean;
}

export const SessionCtx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("fora da sessão");
  return s;
}

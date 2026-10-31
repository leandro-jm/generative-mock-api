export type Role = "admin" | "editor" | "viewer";

export interface Principal {
  kind: "session" | "apiKey" | "jwt" | "anonymous";
  userId?: string;
  role?: Role;
  name?: string;
  scopes: string[];
  keyId?: string;
}

export const ROLE_SCOPES: Record<Role, string[]> = {
  admin: ["*"],
  editor: ["*"],
  viewer: ["*:read"],
};

/** Scopes: "*", "<módulo>:*", "<módulo>:read|write", "*:read|write". write inclui read. */
export function hasScope(scopes: string[], module: string, mode: "read" | "write"): boolean {
  const wanted = mode === "read" ? [`${module}:read`, `${module}:write`, "*:read", "*:write"] : [`${module}:write`, "*:write"];
  return scopes.some((s) => s === "*" || s === `${module}:*` || wanted.includes(s));
}

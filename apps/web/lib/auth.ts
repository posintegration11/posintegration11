const KEY = "pos_token";
const USER_KEY = "pos_user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function canAccess(path: string, role: string): boolean {
  if (path.startsWith("/admin")) return role === "ADMIN";
  if (path.startsWith("/kitchen")) return role === "KITCHEN" || role === "ADMIN";
  if (path.startsWith("/billing")) return role === "CASHIER" || role === "ADMIN";
  if (path.startsWith("/reports")) return role === "CASHIER" || role === "ADMIN";
  if (path.startsWith("/settings")) return role === "ADMIN" || role === "CASHIER";
  return true;
}

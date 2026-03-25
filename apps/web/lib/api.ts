import { getToken } from "./auth";

export const apiBaseUrl = () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function apiUrl(path: string) {
  return `${apiBaseUrl()}/api/v1${path}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (e) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "(server)";
    const base = apiBaseUrl();
    if (e instanceof TypeError) {
      throw new Error(
        `Cannot reach API (${base}). Start the API (e.g. npm run dev:api) and check NEXT_PUBLIC_API_URL. ` +
          `If you open the site from another device or IP (not localhost), set NEXT_PUBLIC_API_URL to this machine's LAN IP and CORS_ORIGIN to ${origin} — localhost in the URL only works on this PC.`
      );
    }
    throw e;
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

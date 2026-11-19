import BASE_URL from "../../BASE_URL";
import { idbDeletePrefix } from "@/lib/idbCache";

// Token storage (localStorage is the source of truth so it survives reloads and is shared with the
// authFetch wrapper and the Redux auth slice).
const ACCESS_KEY = "epm.accessToken";
const REFRESH_KEY = "epm.refreshToken";

export function getAccessToken(): string | null {
  try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
}

export function getRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}

export function setTokens(access: string | null, refresh: string | null): void {
  try {
    if (access) localStorage.setItem(ACCESS_KEY, access); else localStorage.removeItem(ACCESS_KEY);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh); else localStorage.removeItem(REFRESH_KEY);
  } catch { /* storage unavailable (private mode) — tokens live in memory for this session only */ }
}

/** Sign-out: drops the tokens and the API responses saved in IndexedDB (lib/idbCache), so the next
 *  person to open the app can't see data loaded under this session. */
export function clearTokens(): void {
  setTokens(null, null);
  void idbDeletePrefix("");
}

/** Pull access + refresh tokens out of a login/verify/refresh response, which the API types only as a
 *  generic object. Accepts snake_case (FastAPI default) and a couple of common fallbacks. */
export function extractTokens(body: Record<string, unknown>): { access: string | null; refresh: string | null } {
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = body?.[k];
      if (typeof v === "string" && v) return v;
    }
    // Sometimes nested under `tokens` or `data`.
    for (const wrap of ["tokens", "data"]) {
      const inner = body?.[wrap];
      if (inner && typeof inner === "object") {
        for (const k of keys) {
          const v = (inner as Record<string, unknown>)[k];
          if (typeof v === "string" && v) return v;
        }
      }
    }
    return null;
  };
  return {
    access: pick("access_token", "accessToken", "access"),
    refresh: pick("refresh_token", "refreshToken", "refresh"),
  };
}

/** Turn an API error response into a readable message. The API uses
 *  `{ detail: { code, message } }` for business errors and `{ detail: [ { msg, loc } ] }` for 422
 *  validation errors. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      if (Array.isArray(detail)) {
        return detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join("; ") || fallback;
      }
      if (typeof detail.message === "string") return detail.message;
    }
    if (typeof body?.message === "string") return body.message;
  } catch { /* non-JSON body — use the fallback */ }
  return fallback;
}

let refreshing: Promise<boolean> | null = null;

/** Exchange the stored refresh token for a fresh pair. De-duped so concurrent 401s refresh once. */
async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refresh_token = getRefreshToken();
  if (!refresh_token) return false;
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE_URL}auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as Record<string, unknown>;
      const { access, refresh } = extractTokens(body);
      if (!access) return false;
      setTokens(access, refresh ?? refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Called when a request can't be authenticated even after a refresh attempt — clears tokens and
 *  sends the user back to the login page. */
function forceLogout(): void {
  clearTokens();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

/** fetch() for authenticated endpoints: attaches the Bearer token, and on a 401 refreshes the token
 *  once and retries. If the refresh fails, it clears the session and redirects to /login. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = (token: string | null): RequestInit => ({
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let res = await fetch(input, withAuth(getAccessToken()));
  if (res.status !== 401) return res;

  const ok = await refreshTokens();
  if (!ok) {
    forceLogout();
    return res;
  }
  res = await fetch(input, withAuth(getAccessToken()));
  if (res.status === 401) forceLogout();
  return res;
}

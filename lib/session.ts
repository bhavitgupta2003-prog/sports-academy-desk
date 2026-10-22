// Decides whether a failed request means "your login has expired" (send to /login)
// or is just an ordinary problem (network down, database error) where we must NOT log anyone out.

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";
export const SESSION_EXPIRED_URL = "/login?reason=expired";

type Err = { code?: string; status?: number; name?: string; message?: string } | null | undefined;

/** Could this error be caused by a missing or expired login? (Only a hint; we confirm below.) */
export function needsSessionCheck(err: unknown): boolean {
  const e = err as Err;
  if (!e) return false;
  if (e.status === 401) return true;
  const code = String(e.code ?? "");
  if (code.startsWith("PGRST30")) return true; // JWT missing / expired / invalid
  if (code === "42501") return true; // permission denied: could be a lost login
  if (["session_not_found", "refresh_token_not_found", "bad_jwt", "no_authorization"].includes(code)) return true;
  if (e.name === "AuthSessionMissingError") return true;
  return /jwt/i.test(String(e.message ?? ""));
}

type AuthLike = {
  auth: {
    getUser: () => Promise<{ data: { user: unknown | null }; error: { name?: string; status?: number } | null }>;
  };
};

/**
 * True only when we have PROVED the login is gone:
 * the error looks auth-related AND asking Supabase "who is signed in?" says nobody.
 * If that check itself fails because the network is down, we say false (don't log anyone out).
 */
export async function sessionIsGone(err: unknown, supabase: AuthLike): Promise<boolean> {
  if (!needsSessionCheck(err)) return false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return false; // still signed in: this was some other problem
    if (!error) return true; // nobody is signed in and nothing went wrong while asking
    if (error.name === "AuthSessionMissingError") return true;
    if (error.status === 400 || error.status === 401 || error.status === 403) return true; // Supabase rejected the token
    return false; // network or server trouble: not proven, so don't log anyone out
  } catch {
    return false; // network failure while checking
  }
}

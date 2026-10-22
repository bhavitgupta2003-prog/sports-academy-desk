// Small checks run on the AI endpoint before it does any work.

/**
 * Browsers attach an Origin header to POST requests. If it names a different website than the one
 * serving the app, refuse. (A missing Origin comes from tools like curl, which cannot ride on
 * someone else's login cookie, and the endpoint still requires a valid login.)
 */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const MAX_BODY_BYTES = 1024;

/** The endpoint needs no input, so any real body is unexpected. Reject anything large. */
export function bodyTooLarge(contentLength: string | null, max: number = MAX_BODY_BYTES): boolean {
  if (contentLength === null) return false;
  const n = Number(contentLength);
  return !Number.isFinite(n) || n < 0 || n > max;
}

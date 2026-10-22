// A simple "one request at a time, then wait a bit" gate, kept per user.
//
// HONEST LIMITS: this lives in the memory of ONE server instance. On Vercel your app can run on
// several instances at once, and instances restart, so this cannot stop a determined person.
// It only stops accidental double-clicks and rapid repeats. For a hard limit, set a spending
// cap on the OpenRouter key (see README), or store the last-request time in the database.

export const COOLDOWN_MS = 15_000;

export type Gate = { ok: true } | { ok: false; retryAfterSec: number };

export function createCooldown(now: () => number = Date.now, windowMs: number = COOLDOWN_MS) {
  const finishedAt = new Map<string, number>(); // when each user's last request finished
  const running = new Set<string>(); // users with a request in progress

  return {
    /** Call before the expensive work. If ok, you MUST call finish() afterwards. */
    tryStart(key: string): Gate {
      const t = now();
      for (const [k, at] of finishedAt) if (t - at >= windowMs) finishedAt.delete(k); // forget old entries
      if (running.has(key)) return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
      const last = finishedAt.get(key);
      if (last !== undefined && t - last < windowMs) {
        return { ok: false, retryAfterSec: Math.ceil((windowMs - (t - last)) / 1000) };
      }
      running.add(key);
      return { ok: true };
    },
    finish(key: string) {
      running.delete(key);
      finishedAt.set(key, now());
    },
  };
}

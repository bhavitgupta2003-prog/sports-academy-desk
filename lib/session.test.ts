import test from "node:test";
import assert from "node:assert/strict";
import { needsSessionCheck, sessionIsGone } from "./session.ts";

const fake = (user: unknown, error: { name?: string; status?: number } | null = null, throws = false) => ({
  auth: {
    getUser: async () => {
      if (throws) throw new TypeError("fetch failed");
      return { data: { user }, error };
    },
  },
});

test("auth-looking errors are flagged for checking", () => {
  assert.equal(needsSessionCheck({ status: 401 }), true);
  assert.equal(needsSessionCheck({ code: "PGRST301", message: "JWT expired" }), true);
  assert.equal(needsSessionCheck({ code: "42501" }), true);
  assert.equal(needsSessionCheck({ message: "invalid JWT: unable to parse" }), true);
  assert.equal(needsSessionCheck({ name: "AuthSessionMissingError" }), true);
});
test("ordinary errors are NOT flagged", () => {
  assert.equal(needsSessionCheck({ code: "23505", message: "duplicate key" }), false);
  assert.equal(needsSessionCheck({ code: "PGRST116" }), false);
  assert.equal(needsSessionCheck({ message: "Failed to fetch" }), false);
  assert.equal(needsSessionCheck({ status: 500 }), false);
  assert.equal(needsSessionCheck(null), false);
  assert.equal(needsSessionCheck(undefined), false);
});
test("ordinary database errors never log the user out, and never even ask Supabase", async () => {
  let asked = false;
  const sb = { auth: { getUser: async () => ((asked = true), { data: { user: null }, error: null }) } };
  assert.equal(await sessionIsGone({ code: "23505" }, sb), false);
  assert.equal(await sessionIsGone({ message: "Failed to fetch" }, sb), false);
  assert.equal(asked, false);
});
test("expired login: auth-looking error and nobody is signed in -> true", async () => {
  assert.equal(await sessionIsGone({ status: 401 }, fake(null, { name: "AuthSessionMissingError", status: 400 })), true);
  assert.equal(await sessionIsGone({ code: "PGRST301" }, fake(null, null)), true);
  assert.equal(await sessionIsGone({ code: "42501" }, fake(null, { name: "AuthApiError", status: 401 })), true);
});
test("a permission error while still signed in is NOT an expired session", async () => {
  assert.equal(await sessionIsGone({ code: "42501" }, fake({ id: "u1" })), false);
  assert.equal(await sessionIsGone({ status: 401 }, fake({ id: "u1" })), false);
});
test("network down while checking is NOT treated as expired", async () => {
  assert.equal(await sessionIsGone({ status: 401 }, fake(null, { name: "AuthRetryableFetchError", status: 0 })), false);
  assert.equal(await sessionIsGone({ status: 401 }, fake(null, null, true)), false);
});

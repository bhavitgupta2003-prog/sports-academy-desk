import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createCooldown } from "./cooldown.ts";
import { bodyTooLarge, isSameOrigin } from "./apiGuard.ts";

// ---------- cooldown (the AI endpoint's accidental-repeat guard) ----------
test("cooldown: first request is allowed", () => {
  const c = createCooldown(() => 0, 15_000);
  assert.deepEqual(c.tryStart("u1"), { ok: true });
});
test("cooldown: a second request while the first is running is refused", () => {
  const c = createCooldown(() => 0, 15_000);
  c.tryStart("u1");
  assert.equal(c.tryStart("u1").ok, false);
});
test("cooldown: refused right after finishing, with how long to wait", () => {
  let t = 1000;
  const c = createCooldown(() => t, 15_000);
  c.tryStart("u1");
  t = 5000;
  c.finish("u1");
  t = 9000; // 4s after finishing
  const g = c.tryStart("u1");
  assert.equal(g.ok, false);
  assert.equal(g.ok === false && g.retryAfterSec, 11);
});
test("cooldown: allowed again after the wait", () => {
  let t = 0;
  const c = createCooldown(() => t, 15_000);
  c.tryStart("u1");
  c.finish("u1");
  t = 15_000;
  assert.equal(c.tryStart("u1").ok, true);
});
test("cooldown: one user's wait never blocks another user", () => {
  const c = createCooldown(() => 0, 15_000);
  c.tryStart("u1");
  c.finish("u1");
  assert.equal(c.tryStart("u2").ok, true);
});
test("cooldown: a request that fails still releases the gate (finish is always called)", () => {
  let t = 0;
  const c = createCooldown(() => t, 15_000);
  c.tryStart("u1");
  c.finish("u1"); // what the route's finally block does
  t = 16_000;
  assert.equal(c.tryStart("u1").ok, true);
});

// ---------- request checks ----------
test("same-origin check accepts our own site and rejects other sites", () => {
  assert.equal(isSameOrigin("https://sports-academy-desk.vercel.app", "sports-academy-desk.vercel.app"), true);
  assert.equal(isSameOrigin("http://localhost:3000", "localhost:3000"), true);
  assert.equal(isSameOrigin("https://evil.example", "sports-academy-desk.vercel.app"), false);
  assert.equal(isSameOrigin("https://sports-academy-desk.vercel.app.evil.example", "sports-academy-desk.vercel.app"), false);
  assert.equal(isSameOrigin("not a url", "localhost:3000"), false);
  assert.equal(isSameOrigin("https://x.example", null), false);
});
test("a missing Origin header (non-browser tools) is let through to the login check", () => {
  assert.equal(isSameOrigin(null, "localhost:3000"), true);
});
test("body size check", () => {
  assert.equal(bodyTooLarge(null), false);
  assert.equal(bodyTooLarge("0"), false);
  assert.equal(bodyTooLarge("1024"), false);
  assert.equal(bodyTooLarge("1025"), true);
  assert.equal(bodyTooLarge("abc"), true);
  assert.equal(bodyTooLarge("-5"), true);
});

// ---------- STATIC checks of project files (these read the files; they do NOT test the live database) ----------
const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(rel);
  }
  return out;
}
const appFiles = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib"), "proxy.ts"];

test("static: the AI key is only read in the server route", () => {
  const users = appFiles.filter((f) => read(f).includes("OPENROUTER_API_KEY"));
  assert.deepEqual(users.map((f) => f.replaceAll("\\", "/")), ["app/api/summary/route.ts"]);
});
test("static: no browser ('use client') file mentions a secret or service-role key", () => {
  for (const f of appFiles) {
    const text = read(f);
    if (text.trimStart().startsWith('"use client"')) {
      assert.doesNotMatch(text, /OPENROUTER_API_KEY|SERVICE_ROLE|service_role/i, f);
    }
  }
});
test("static: no secret is exposed through a NEXT_PUBLIC_ name", () => {
  for (const f of appFiles) {
    assert.doesNotMatch(read(f), /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|OPENROUTER|AI_KEY)/i, f);
  }
});
test("static: no key-looking values are written in source files", () => {
  const pattern = /sk-or-v1-[A-Za-z0-9]{10,}|eyJhbGciOi[A-Za-z0-9._-]{20,}|sb_(publishable|secret)_[A-Za-z0-9_-]{10,}/;
  for (const f of [...appFiles, "README.md", ".env.example", "supabase/schema.sql"]) assert.doesNotMatch(read(f), pattern, f);
});
test("static: .gitignore excludes local env files but keeps the empty template", () => {
  const g = read(".gitignore");
  assert.match(g, /^\.env\*/m);
  assert.match(g, /^!\.env\.example/m);
  assert.match(g, /^\.vercel/m);
});
test("static: schema turns on row level security and an owner-only policy for every table", () => {
  const schema = read("supabase/schema.sql");
  const tables = [...schema.matchAll(/create table (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["attendance", "batches", "events", "fee_payments", "students"]);
  for (const t of tables) {
    assert.match(schema, new RegExp(`alter table ${t} enable row level security`), t);
    assert.match(schema, new RegExp(`create policy "own rows" on ${t} for all using \\(owner_id = auth\\.uid\\(\\)\\) with check \\(owner_id = auth\\.uid\\(\\)\\)`), t);
  }
});
test("static: links between tables require the same owner (schema and migration)", () => {
  const schema = read("supabase/schema.sql");
  const migration = read("supabase/migrations/001_same_account_references.sql");
  for (const text of [schema, migration]) {
    assert.match(text, /\(batch_id, owner_id\) references batches \(id, owner_id\)/);
    assert.match(text, /\(student_id, owner_id\) references students \(id, owner_id\)/);
  }
  assert.equal((migration.match(/\(student_id, owner_id\) references students/g) ?? []).length, 2); // attendance + fee_payments
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});
test("static: the events migration has row level security, the owner-only rule, and is all-or-nothing", () => {
  const m = read("supabase/migrations/002_events.sql");
  assert.match(m, /^begin;/m);
  assert.match(m, /^commit;/m);
  assert.match(m, /alter table public\.events enable row level security/);
  assert.match(m, /create policy "own rows" on public\.events for all using \(owner_id = auth\.uid\(\)\) with check \(owner_id = auth\.uid\(\)\)/);
  assert.match(m, /\(batch_id, owner_id\) references public\.batches \(id, owner_id\)/); // an event can only point at a batch of the same account
  assert.doesNotMatch(m, /\b(delete from|truncate|drop table (?!public\.events;))/i); // it never deletes or drops existing data (the only drop is the commented-out undo)
});
test("static: the AI route checks login first, filters by owner, and uses the cooldown", () => {
  const route = read("app/api/summary/route.ts");
  assert.ok(route.indexOf("auth.getUser()") < route.indexOf('.from("students")'), "login is checked before any data is read");
  for (const table of ["students", "attendance", "fee_payments"]) {
    const line = route.split("\n").find((l) => l.includes(`.from("${table}")`));
    assert.ok(line, `${table} query exists`);
    assert.ok(line.includes('.eq("owner_id", user.id)'), `${table} query is limited to the signed-in account`);
  }
  assert.match(route, /cooldown\.tryStart/);
  assert.match(route, /cooldown\.finish/);
  assert.match(route, /isSameOrigin/);
});

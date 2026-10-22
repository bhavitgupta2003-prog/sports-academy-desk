import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// STATIC checks: these read the script's source files. They do not touch any database.
const dir = import.meta.dirname;
const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const source = (f: string) => readFileSync(join(dir, f), "utf8");
const all = files.map((f) => [f, source(f)] as const);
const seed = source("seed.ts");

test("static: no service-role or secret key is used anywhere in the seed scripts", () => {
  for (const [f, text] of all) assert.doesNotMatch(text, /service_role|SERVICE_ROLE|SUPABASE_SERVICE|OPENROUTER|sk-or-v1/i, f);
});
test("static: the script signs in as the user with the public key only", () => {
  assert.match(seed, /signInWithPassword/);
  assert.match(seed, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});
test("static: the password is never printed or logged", () => {
  for (const [f, text] of all) {
    for (const line of text.split("\n")) {
      // a console line must not print the variable that holds the password
      if (/console\.(log|error|warn|info)/.test(line)) assert.doesNotMatch(line, /SEED_PASSWORD|\$\{\s*password|,\s*password\b/, `${f}: ${line.trim()}`);
    }
  }
});
test("static: no credentials are written into the files", () => {
  const key = /eyJhbGciOi[A-Za-z0-9._-]{30,}|sb_(publishable|secret)_[A-Za-z0-9_-]{20,}/;
  for (const [f, text] of all) assert.doesNotMatch(text, key, f);
  assert.doesNotMatch(source("generate.ts"), /owner_id\s*:/); // no owner_id property: the database sets it from the login
});
test("static: the only changes to existing data are inserts that skip duplicates", () => {
  assert.doesNotMatch(seed, /\.update\(|\.rpc\(|\.sql\b/);
  assert.match(seed, /ignoreDuplicates:\s*true/);
  for (const [f, text] of all) if (f !== "seed.ts") assert.doesNotMatch(text, /\.delete\(|\.upsert\(|\.insert\(/, f);
});
test("static: every delete is limited to the demo ids", () => {
  const lines = seed.split("\n");
  const deletes = lines.map((l, i) => [l, i] as const).filter(([l]) => l.includes(".delete()"));
  assert.ok(deletes.length >= 4); // attendance, payments, students, batches
  for (const [line] of deletes) assert.match(line, /\.(in|eq)\(/, `unfiltered delete: ${line.trim()}`);
  // the lists used for deleting come from the fixed demo ids
  assert.match(seed, /demoStudentIds\(user\.id\)/);
  assert.match(seed, /demoBatchIds\(user\.id\)/);
});
test("static: writing needs --yes, and removing only previews without it", () => {
  assert.match(seed, /--apply writes to your real database\. Add --yes to confirm/);
  assert.match(seed, /PREVIEW ONLY\. Nothing was deleted/);
  const removeFn = seed.slice(seed.indexOf("async function removeDemo"), seed.indexOf("async function main"));
  assert.ok(removeFn.indexOf("if (!yes)") < removeFn.indexOf(".delete()"), "the --yes check comes before any delete");
});
test("static: the dry run and generator make no network calls", () => {
  for (const f of ["generate.ts", "preview.ts", "data.ts", "ids.ts", "sql.ts"]) assert.doesNotMatch(source(f), /@supabase|fetch\(|https?:\/\//i, f);
});

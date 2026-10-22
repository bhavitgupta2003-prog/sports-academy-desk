import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS_SETUP_SQL } from "./eventsSetupSql.ts";

const migration = readFileSync(join(import.meta.dirname, "..", "supabase", "migrations", "002_events.sql"), "utf8");

test("the SQL offered on the Events page is exactly the migration file (no drift)", () => {
  assert.equal(EVENTS_SETUP_SQL, migration);
});
test("the offered SQL only creates the events table: it never deletes or drops your data", () => {
  const code = EVENTS_SETUP_SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(code, /create table public\.events/);
  assert.match(code, /enable row level security/);
  assert.doesNotMatch(code, /\b(delete from|truncate|drop )/i);
  assert.doesNotMatch(code, /(alter table public\.(students|attendance|fee_payments))/i);
});

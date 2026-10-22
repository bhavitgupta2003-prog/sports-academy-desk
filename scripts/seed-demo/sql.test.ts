import test from "node:test";
import assert from "node:assert/strict";
import { demoBatchIds, demoStudentIds, generateDemo } from "./generate.ts";
import { buildInsertSql, buildRemoveSql, isUuid, sqlText } from "./sql.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const ds = generateDemo("2026-10-22", USER);
const sql = buildInsertSql(ds, USER);
const code = (text: string) => text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"); // without comment lines

const blocksFor = (table: string) => [...sql.matchAll(new RegExp(`insert into public\\.${table} \\([^)]*\\) values[\\s\\S]*?on conflict \\(id\\) do nothing;`, "g"))].map((m) => m[0]);
const rowsIn = (blocks: string[]) => blocks.reduce((n, b) => n + (b.match(/^ {2}\(/gm) ?? []).length, 0);

test("escaping: a single quote inside text is doubled, so it cannot break out of the quotes", () => {
  assert.equal(sqlText("O'Brien"), "'O''Brien'");
  assert.equal(sqlText("x'); drop table students; --"), "'x''); drop table students; --'");
  assert.equal(sqlText("plain"), "'plain'");
});
test("the account id must be a real uuid, so nothing else can be slipped into the SQL", () => {
  assert.equal(isUuid(USER), true);
  for (const bad of ["", "abc", "x'); drop table students; --", USER + "'", USER + " ", "11111111-2222-4333-8444-55555555555", "g1111111-2222-4333-8444-555555555555"]) {
    assert.equal(isUuid(bad), false, bad);
    assert.throws(() => buildInsertSql(ds, bad));
    assert.throws(() => buildRemoveSql(bad));
  }
});
test("the insert SQL contains exactly the planned rows for each table", () => {
  assert.equal(rowsIn(blocksFor("batches")), ds.batches.length);
  assert.equal(rowsIn(blocksFor("students")), ds.students.length);
  assert.equal(rowsIn(blocksFor("attendance")), ds.attendance.length);
  assert.equal(rowsIn(blocksFor("fee_payments")), ds.payments.length);
});
test("every insert skips rows that already exist (so running it twice adds nothing)", () => {
  const inserts = code(sql).match(/insert into public\.\w+/g) ?? [];
  assert.ok(inserts.length >= 4);
  assert.equal((code(sql).match(/on conflict \(id\) do nothing;/g) ?? []).length, inserts.length);
});
test("the insert SQL only adds data: no update, delete, drop, truncate or alter", () => {
  assert.doesNotMatch(code(sql), /\b(update|delete|drop|truncate|alter|grant|revoke|disable)\b/i);
});
test("it is all-or-nothing and checks the account exists first", () => {
  const c = code(sql);
  assert.ok(c.indexOf("begin;") < c.indexOf("if not exists (select 1 from auth.users") && c.indexOf("if not exists") < c.indexOf("insert into"));
  assert.ok(c.indexOf("commit;") > c.lastIndexOf("insert into"));
});
test("every row names the owner explicitly (the SQL Editor has no logged-in user to fill it in)", () => {
  const total = ds.batches.length + ds.students.length + ds.attendance.length + ds.payments.length;
  const inRows = (code(sql).match(new RegExp(`'${USER}'`, "g")) ?? []).length;
  assert.ok(inRows >= total, `${inRows} owner ids for ${total} rows`);
  for (const t of ["batches", "students", "attendance", "fee_payments"]) assert.match(sql, new RegExp(`insert into public\\.${t} \\(id, owner_id`));
});
test("numbers are plain numbers and dates are quoted, and the demo ids match the dataset", () => {
  // a student row: name, batch id, coach, parent name, fake phone, fee (a plain number), joined date (quoted)
  assert.match(sql, /\('[0-9a-f-]{36}', '[0-9a-f-]{36}', '[A-Za-z' ]+', '[0-9a-f-]{36}', 'Coach [^']+', '[A-Za-z' ]+', '00000 \d{5}', \d+(\.\d+)?, '20\d\d-\d\d-\d\d'\)/);
  for (const id of [...demoBatchIds(USER), ...demoStudentIds(USER)]) assert.ok(sql.includes(`'${id}'`));
});
test("the SQL's final select reports the counts it should reach", () => {
  assert.match(sql, /as demo_batches,[\s\S]*as demo_students,[\s\S]*as demo_attendance_marks,[\s\S]*as demo_payments;\s*$/);
});

// ---------- remove ----------
const rm = buildRemoveSql(USER);
test("remove SQL deletes only the demo students and demo batches, always limited to this account", () => {
  const c = code(rm);
  const deletes = c.match(/delete from public\.\w+[\s\S]*?;/g) ?? [];
  assert.equal(deletes.length, 2);
  for (const d of deletes) assert.match(d, new RegExp(`owner_id = '${USER}'`));
  assert.match(deletes[0], /delete from public\.students/);
  assert.match(deletes[1], /delete from public\.batches/);
  assert.doesNotMatch(c, /\b(truncate|drop|alter|update)\b/i);
});
test("remove SQL lists exactly the demo ids, and keeps a batch that still has other students", () => {
  for (const id of [...demoBatchIds(USER), ...demoStudentIds(USER)]) assert.ok(rm.includes(`'${id}'`));
  const found = new Set(rm.match(/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g) ?? []);
  assert.deepEqual([...found].sort(), [...demoBatchIds(USER), ...demoStudentIds(USER)].sort()); // exactly the demo ids, nothing else
  assert.match(rm, /not exists \(select 1 from public\.students s where s\.batch_id = b\.id\)/);
  assert.ok(code(rm).indexOf("delete from public.students") < code(rm).indexOf("delete from public.batches")); // students first
  assert.ok(code(rm).indexOf("begin;") < code(rm).indexOf("delete from"));
});
test("the SQL is a different size for a different account but the same shape", () => {
  const other = buildInsertSql(generateDemo("2026-10-22", "99999999-2222-4333-8444-555555555555"), "99999999-2222-4333-8444-555555555555");
  assert.equal(other.split("\n").length, sql.split("\n").length);
  assert.equal(other.includes(USER), false);
});

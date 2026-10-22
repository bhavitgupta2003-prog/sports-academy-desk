// Writes the demo data as SQL you can paste into the Supabase SQL Editor. No network, no password.
// It is for people who sign in to Supabase with GitHub (so there is no website password to give the script).
//
// The SQL Editor runs as the project's admin role, so every row has to name its owner explicitly.
// The owner is YOUR website account's id (not a secret: it is just an id shown in Authentication > Users).

import { demoBatchIds, demoStudentIds, toRows, type Dataset } from "./generate.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

/** A SQL text literal: wrapped in single quotes, with any single quote doubled. */
export const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sqlNumber = (n: number) => {
  if (!Number.isFinite(n)) throw new Error("A number was not finite");
  return String(n);
};

function insertStatements(table: string, columns: string[], rows: string[][], size = 100): string {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const values = rows.slice(i, i + size).map((r) => `  (${r.join(", ")})`).join(",\n");
    out.push(`insert into public.${table} (${columns.join(", ")}) values\n${values}\non conflict (id) do nothing;`);
  }
  return out.join("\n\n");
}

/** INSERT-only SQL. Rows that already exist are skipped, so running it twice adds nothing. */
export function buildInsertSql(ds: Dataset, userId: string): string {
  if (!isUuid(userId)) throw new Error("That is not a valid account id (it looks like 8-4-4-4-12 letters and numbers).");
  const uid = sqlText(userId);
  const rows = toRows(ds);
  const withOwner = (cols: string[]) => ["id", "owner_id", ...cols.filter((c) => c !== "id")];

  const batches = insertStatements("batches", withOwner(["name"]), rows.batches.map((b) => [sqlText(b.id), uid, sqlText(b.name)]));
  const students = insertStatements(
    "students",
    withOwner(["name", "batch_id", "coach", "parent_name", "parent_phone", "monthly_fee", "joined_on"]),
    rows.students.map((s) => [sqlText(s.id), uid, sqlText(s.name), sqlText(s.batch_id), sqlText(s.coach), sqlText(s.parent_name), sqlText(s.parent_phone), sqlNumber(s.monthly_fee), sqlText(s.joined_on)]),
  );
  const attendance = insertStatements(
    "attendance",
    withOwner(["student_id", "date", "status"]),
    rows.attendance.map((a) => [sqlText(a.id), uid, sqlText(a.student_id), sqlText(a.date), sqlText(a.status)]),
    200,
  );
  const payments = insertStatements(
    "fee_payments",
    withOwner(["student_id", "amount", "paid_on", "note"]),
    rows.payments.map((p) => [sqlText(p.id), uid, sqlText(p.student_id), sqlNumber(p.amount), sqlText(p.paid_on), sqlText(p.note)]),
  );
  const studentIds = demoStudentIds(userId).map(sqlText).join(", ");
  const batchIds = demoBatchIds(userId).map(sqlText).join(", ");

  return `-- Sports Academy Desk: demo data (${rows.students.length} students, ${rows.batches.length} batches, ${rows.attendance.length} attendance marks, ${rows.payments.length} payments).
-- Everything below is FICTIONAL. Paste it into Supabase: SQL Editor > New query > paste > Run.
-- It ONLY adds rows (it skips any that already exist), so your own students, attendance and payments are untouched,
-- and running it twice adds nothing. It is one all-or-nothing transaction: if anything fails, nothing is added.
-- Built for ${ds.asOf} (India time) and for the account id ${userId}.

begin;

do $$
begin
  if not exists (select 1 from auth.users where id = ${uid}) then
    raise exception 'No account has the id ${userId}. Nothing was added.';
  end if;
end $$;

${batches}

${students}

${attendance}

${payments}

commit;

-- What was added (should show ${rows.batches.length}, ${rows.students.length}, ${rows.attendance.length}, ${rows.payments.length} the first time):
select
  (select count(*) from public.batches where owner_id = ${uid} and id in (${batchIds})) as demo_batches,
  (select count(*) from public.students where owner_id = ${uid} and id in (${studentIds})) as demo_students,
  (select count(*) from public.attendance where owner_id = ${uid} and student_id in (${studentIds})) as demo_attendance_marks,
  (select count(*) from public.fee_payments where owner_id = ${uid} and student_id in (${studentIds})) as demo_payments;
`;
}

/** DELETE SQL that removes ONLY the demo rows (found by their fixed ids). Nothing else is touched. */
export function buildRemoveSql(userId: string): string {
  if (!isUuid(userId)) throw new Error("That is not a valid account id (it looks like 8-4-4-4-12 letters and numbers).");
  const uid = sqlText(userId);
  const studentIds = demoStudentIds(userId).map(sqlText).join(", ");
  const batchIds = demoBatchIds(userId).map(sqlText).join(", ");
  return `-- Sports Academy Desk: REMOVE the demo data (and only the demo data).
-- Paste into Supabase: SQL Editor > New query > paste > Run.
-- It finds the demo rows by their fixed ids, so your own students, batches, attendance and payments are not touched.
-- Deleting a demo student also deletes that student's attendance and payments (the tables are linked that way).
-- Anything you added to a demo student yourself goes with that student. A demo batch that one of your own
-- students has been moved into is kept.

begin;

delete from public.students where owner_id = ${uid} and id in (${studentIds});

delete from public.batches b
where b.owner_id = ${uid} and b.id in (${batchIds})
  and not exists (select 1 from public.students s where s.batch_id = b.id);

commit;

-- What is left of the demo data (should show 0, 0, 0, 0):
select
  (select count(*) from public.batches where owner_id = ${uid} and id in (${batchIds})) as demo_batches_left,
  (select count(*) from public.students where owner_id = ${uid} and id in (${studentIds})) as demo_students_left,
  (select count(*) from public.attendance where owner_id = ${uid} and student_id in (${studentIds})) as demo_attendance_left,
  (select count(*) from public.fee_payments where owner_id = ${uid} and student_id in (${studentIds})) as demo_payments_left;
`;
}


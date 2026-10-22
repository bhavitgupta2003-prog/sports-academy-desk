// Demo data for Sports Academy Desk. See scripts/seed-demo/README.md for how to run it.
//
//   (no flag) / --dry-run   Build the data in memory and print what it would look like. No network, no password.
//   --check                 Sign in as you and only READ: shows what is in your account and any name clashes.
//   --apply --yes           Sign in as you and INSERT the demo rows (rows that already exist are skipped).
//   --remove-demo           Sign in as you and show what removing the demo rows would delete (preview only).
//   --remove-demo --yes     Actually delete ONLY the demo rows (found by their fixed ids). Nothing else is touched.
//   --emit-sql --user-id ID Print the demo data as SQL to paste into the Supabase SQL Editor. No network, no password.
//   --emit-remove-sql --user-id ID   Print SQL that removes ONLY the demo rows (same way).
//
// It signs in with YOUR email and password (SEED_EMAIL / SEED_PASSWORD) and uses the same public key as the
// website, so Row Level Security stays on and every row belongs to you. No service-role key is used.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rupees, todayString } from "../../lib/fees.ts";
import { fetchAll } from "../../lib/fetchAll.ts";
import { buildRows, type PaymentRow, type StudentRow } from "../../lib/studentList.ts";
import { normalizeName } from "../../lib/validation.ts";
import { demoBatchIds, demoStudentIds, generateDemo, toRows, validateDataset } from "./generate.ts";
import { printPreview } from "./preview.ts";
import { buildInsertSql, buildRemoveSql, isUuid } from "./sql.ts";

type Mode = "dry-run" | "check" | "apply" | "remove" | "emit-sql" | "emit-remove-sql";
const DRY_RUN_USER = "00000000-0000-0000-0000-000000000000"; // placeholder: the dry run never signs in

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  let asOf = todayString();
  let userId = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--as-of") asOf = argv[++i] ?? "";
    else if (a === "--user-id") userId = argv[++i] ?? "";
    else if (["--dry-run", "--check", "--apply", "--remove-demo", "--emit-sql", "--emit-remove-sql", "--yes", "--allow-name-clash", "--help"].includes(a)) flags.add(a);
    else throw new Error(`Unknown option: ${a}. Use --help to see the options.`);
  }
  if (flags.has("--help")) return { help: true as const };
  const modes: Mode[] = [];
  if (flags.has("--dry-run")) modes.push("dry-run");
  if (flags.has("--check")) modes.push("check");
  if (flags.has("--apply")) modes.push("apply");
  if (flags.has("--remove-demo")) modes.push("remove");
  if (flags.has("--emit-sql")) modes.push("emit-sql");
  if (flags.has("--emit-remove-sql")) modes.push("emit-remove-sql");
  if (modes.length > 1) throw new Error("Choose only one of --dry-run, --check, --apply, --remove-demo, --emit-sql, --emit-remove-sql.");
  return { help: false as const, mode: modes[0] ?? "dry-run", yes: flags.has("--yes"), allowClash: flags.has("--allow-name-clash"), asOf, userId };
}

const HELP = `Usage: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON [--env-file=.env.local] scripts/seed-demo/seed.ts [option]

  --dry-run           (default) preview only. No network, no password.
  --check             sign in and read-only look at your account.
  --apply --yes       insert the demo rows (skips any that already exist).
  --remove-demo       preview what removing the demo rows would delete.
  --remove-demo --yes delete ONLY the demo rows.
  --as-of YYYY-MM-DD  build the data for a different "today" (default: today in India).
  --allow-name-clash  insert even if a demo name matches one of your existing students.
  --emit-sql --user-id ID         print the demo data as SQL for the Supabase SQL Editor (no password).
  --emit-remove-sql --user-id ID  print SQL that removes only the demo rows.
`;

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function signIn() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Run with --env-file=.env.local.");
  if (!email || !password) throw new Error("Set SEED_EMAIL and SEED_PASSWORD in your terminal first (see the README). The password is never saved or printed.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed: ${error?.message ?? "no user returned"}`);
  return { supabase, user: data.user };
}

async function countIn(supabase: SupabaseClient, table: string, column: string, ids: string[]): Promise<number> {
  let n = 0;
  for (const c of chunk(ids, 50)) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).in(column, c);
    if (error) throw new Error(`Could not count ${table}: ${error.message}`);
    n += count ?? 0;
  }
  return n;
}

async function totalIn(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

async function existingNames(supabase: SupabaseClient, excludeIds: Set<string>): Promise<{ id: string; name: string }[]> {
  const { data, error } = await fetchAll<{ id: string; name: string }>((from, to) => supabase.from("students").select("id,name").order("id").range(from, to));
  if (error) throw new Error("Could not read your existing students.");
  return data.filter((s) => !excludeIds.has(s.id));
}

async function insertSkippingExisting(supabase: SupabaseClient, table: string, rows: object[]) {
  let inserted = 0;
  for (const c of chunk(rows, 500)) {
    const { data, error } = await supabase.from(table).upsert(c, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`Inserting into ${table} failed: ${error.message}. Nothing is lost: run it again and it continues.`);
    inserted += data?.length ?? 0;
  }
  return { inserted, skipped: rows.length - inserted };
}

function nameClashes(demoNames: string[], existing: { name: string }[]): string[] {
  const have = new Set(existing.map((s) => normalizeName(s.name)));
  return demoNames.filter((n) => have.has(normalizeName(n)));
}

async function check(asOf: string) {
  const { supabase, user } = await signIn();
  console.log(`\nSigned in as ${user.email}. READ-ONLY check (nothing is written).`);
  const ds = generateDemo(asOf, user.id);
  const studentIds = demoStudentIds(user.id);
  console.log("\nIn your account now:");
  for (const t of ["batches", "students", "attendance", "fee_payments"]) console.log(`  ${t.padEnd(13)} ${await totalIn(supabase, t)}`);
  console.log("\nDemo rows already present (a rerun would skip these):");
  console.log(`  batches       ${await countIn(supabase, "batches", "id", demoBatchIds(user.id))} of ${ds.batches.length}`);
  console.log(`  students      ${await countIn(supabase, "students", "id", studentIds)} of ${ds.students.length}`);
  console.log(`  attendance    ${await countIn(supabase, "attendance", "student_id", studentIds)}  (this run would add up to ${ds.attendance.length})`);
  console.log(`  payments      ${await countIn(supabase, "fee_payments", "student_id", studentIds)}  (this run would add up to ${ds.payments.length})`);
  const clashes = nameClashes(ds.students.map((s) => s.name), await existingNames(supabase, new Set(studentIds)));
  console.log(clashes.length ? `\nNAME CLASHES with your existing students: ${clashes.join(", ")}` : "\nName clashes with your existing students: none");
}

async function apply(asOf: string, yes: boolean, allowClash: boolean) {
  if (!yes) throw new Error("--apply writes to your real database. Add --yes to confirm.");
  const { supabase, user } = await signIn();
  console.log(`\nSigned in as ${user.email}. Inserting demo data as of ${asOf}.`);
  const ds = generateDemo(asOf, user.id);
  const problems = validateDataset(ds);
  if (problems.length) throw new Error(`The generated data failed validation, so nothing was written:\n  ${problems.slice(0, 5).join("\n  ")}`);

  const studentIds = demoStudentIds(user.id);
  const clashes = nameClashes(ds.students.map((s) => s.name), await existingNames(supabase, new Set(studentIds)));
  if (clashes.length && !allowClash) throw new Error(`These demo names match your existing students: ${clashes.join(", ")}. Nothing was written. Use --allow-name-clash to insert anyway.`);

  const rows = toRows(ds);
  const results: Record<string, { inserted: number; skipped: number }> = {};
  for (const [label, table, list] of [
    ["batches", "batches", rows.batches],
    ["students", "students", rows.students],
    ["attendance", "attendance", rows.attendance],
    ["payments", "fee_payments", rows.payments],
  ] as const) {
    results[label] = await insertSkippingExisting(supabase, table, list);
    console.log(`  ${label.padEnd(11)} inserted ${String(results[label].inserted).padStart(5)}   skipped (already there) ${results[label].skipped}`);
  }

  console.log("\nVerifying from the database...");
  const have = {
    batches: await countIn(supabase, "batches", "id", demoBatchIds(user.id)),
    students: await countIn(supabase, "students", "id", studentIds),
    attendance: await countIn(supabase, "attendance", "student_id", studentIds),
    payments: await countIn(supabase, "fee_payments", "student_id", studentIds),
  };
  const ok = have.batches === ds.batches.length && have.students === ds.students.length && have.attendance >= ds.attendance.length && have.payments >= ds.payments.length;
  console.log(`  batches ${have.batches}/${ds.batches.length}  students ${have.students}/${ds.students.length}  attendance ${have.attendance}/${ds.attendance.length}  payments ${have.payments}/${ds.payments.length}  ${ok ? "OK" : "MISMATCH"}`);

  // Read the demo students back and work out statuses with the app's own functions, exactly as the website will.
  const students: StudentRow[] = [];
  const payments: PaymentRow[] = [];
  for (const c of chunk(studentIds, 50)) {
    const s = await supabase.from("students").select("id,name,coach,monthly_fee,joined_on,batch_id,batches(name)").in("id", c);
    const p = await supabase.from("fee_payments").select("student_id,amount").in("student_id", c);
    if (s.error || p.error) throw new Error("Could not read the demo rows back.");
    students.push(...(s.data as unknown as StudentRow[]));
    payments.push(...(p.data as PaymentRow[]));
  }
  const list = buildRows(students, payments, asOf);
  const count = (st: string) => list.filter((r) => r.status === st).length;
  const owing = list.reduce((sum, r) => sum + Math.max(0, r.owed), 0);
  const orphans = students.filter((s) => !s.batches).length;
  console.log(`  Linked to a batch: ${students.length - orphans}/${students.length}`);
  console.log(`  Fee status as the app shows it: Paid ${count("paid")}, Due soon ${count("due_soon")}, Overdue ${count("overdue")}; outstanding ${rupees(owing)}`);
  if (!ok || orphans) process.exitCode = 1;
}

async function removeDemo(yes: boolean) {
  const { supabase, user } = await signIn();
  const studentIds = demoStudentIds(user.id);
  const batchIds = demoBatchIds(user.id);
  console.log(`\nSigned in as ${user.email}.`);

  const n = {
    attendance: await countIn(supabase, "attendance", "student_id", studentIds),
    payments: await countIn(supabase, "fee_payments", "student_id", studentIds),
    students: await countIn(supabase, "students", "id", studentIds),
    batches: await countIn(supabase, "batches", "id", batchIds),
  };
  console.log(`Demo rows found in your account: ${n.students} students, ${n.batches} batches, ${n.attendance} attendance marks, ${n.payments} payments.`);
  console.log("Only rows with the demo ids are considered. Your other records are never touched.");
  console.log("Note: anything you added to a demo student yourself (attendance, payments) goes with that student.");
  if (!yes) {
    console.log("\nPREVIEW ONLY. Nothing was deleted. Add --yes to delete these rows.");
    return;
  }

  // Children first, then students, then batches.
  for (const c of chunk(studentIds, 50)) {
    const a = await supabase.from("attendance").delete().in("student_id", c);
    if (a.error) throw new Error(`Deleting attendance failed: ${a.error.message}`);
    const p = await supabase.from("fee_payments").delete().in("student_id", c);
    if (p.error) throw new Error(`Deleting payments failed: ${p.error.message}`);
  }
  for (const c of chunk(studentIds, 50)) {
    const s = await supabase.from("students").delete().in("id", c);
    if (s.error) throw new Error(`Deleting students failed: ${s.error.message}`);
  }
  // A batch that still has a student of yours in it is kept, because that student needs it.
  const kept: string[] = [];
  for (const id of batchIds) {
    const { count, error } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("batch_id", id);
    if (error) throw new Error(`Could not check a batch: ${error.message}`);
    if ((count ?? 0) > 0) { kept.push(id); continue; }
    const b = await supabase.from("batches").delete().eq("id", id);
    if (b.error) throw new Error(`Deleting a batch failed: ${b.error.message}`);
  }
  console.log(`\nDeleted the demo rows. ${kept.length ? `${kept.length} demo batch(es) were kept because other students of yours use them.` : "All demo batches removed."}`);
  console.log(`Remaining demo rows: students ${await countIn(supabase, "students", "id", studentIds)}, attendance ${await countIn(supabase, "attendance", "student_id", studentIds)}, payments ${await countIn(supabase, "fee_payments", "student_id", studentIds)}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(HELP);
  if (args.mode === "dry-run") {
    console.log("DRY RUN: no network, no password, nothing is written.");
    process.exitCode = printPreview(args.asOf, DRY_RUN_USER) ? 0 : 1;
  } else if (args.mode === "emit-sql" || args.mode === "emit-remove-sql") {
    if (!isUuid(args.userId)) throw new Error("Add --user-id <your account id>. Find it in Supabase: Authentication > Users (the User UID column).");
    // The SQL goes to standard output so it can be saved or copied; messages go to standard error.
    if (args.mode === "emit-sql") {
      const ds = generateDemo(args.asOf, args.userId);
      const problems = validateDataset(ds);
      if (problems.length) throw new Error(`The generated data failed validation:\n  ${problems.slice(0, 5).join("\n  ")}`);
      process.stdout.write(buildInsertSql(ds, args.userId));
      console.error(`Wrote the demo-data SQL (${ds.students.length} students, ${ds.attendance.length} attendance marks, ${ds.payments.length} payments) for account ${args.userId}.`);
    } else {
      process.stdout.write(buildRemoveSql(args.userId));
      console.error(`Wrote the SQL that removes only the demo rows for account ${args.userId}.`);
    }
  } else if (args.mode === "check") await check(args.asOf);
  else if (args.mode === "apply") await apply(args.asOf, args.yes, args.allowClash);
  else await removeDemo(args.yes);
}

main().catch((e: unknown) => {
  console.error(`\nStopped: ${e instanceof Error ? e.message : "unexpected error"}`);
  process.exit(1);
});

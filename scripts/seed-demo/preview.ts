// A quick printout of what the demo dataset would look like. No network, no password.
import { rupees } from "../../lib/fees.ts";
import { generateDemo, summarize, toRows, validateDataset } from "./generate.ts";

export function printPreview(asOf: string, userId: string): boolean {
  const ds = generateDemo(asOf, userId);
  const rows = toRows(ds);
  const s = summarize(ds);
  const problems = validateDataset(ds);

  console.log(`\nDEMO DATA PREVIEW  (as of ${asOf}, India time)`);
  console.log("-".repeat(60));
  console.log("Rows that would be inserted");
  console.log(`  batches     ${String(rows.batches.length).padStart(5)}`);
  console.log(`  students    ${String(rows.students.length).padStart(5)}`);
  console.log(`  attendance  ${String(rows.attendance.length).padStart(5)}`);
  console.log(`  payments    ${String(rows.payments.length).padStart(5)}`);
  console.log(`  TOTAL       ${String(rows.batches.length + rows.students.length + rows.attendance.length + rows.payments.length).padStart(5)}`);

  console.log("\nFee status the app will show (worked out by the app's own fee functions)");
  console.log(`  Paid      ${s.statusCounts.paid}`);
  console.log(`  Due soon  ${s.statusCounts.due_soon}`);
  console.log(`  Overdue   ${s.statusCounts.overdue}`);
  console.log(`  Total outstanding ${rupees(s.totalOutstanding)} across ${s.studentsOwing} students`);

  console.log("\nBatches");
  for (const b of s.perBatch) {
    console.log(`  ${b.name.padEnd(44)} ${String(b.students).padStart(3)} students  ${String(b.sessions).padStart(3)} sessions  ${String(b.attendanceRows).padStart(4)} marks  ${b.presentPct}% present`);
  }
  console.log(`\nAttendance: ${s.presentPct}% present overall. Marked for today (${asOf}): ${s.markedToday.length ? s.markedToday.join("; ") : "no batch"}`);

  console.log("\nSample students (all fictional)");
  for (const st of ds.students.slice(0, 3)) {
    console.log(`  ${st.name.padEnd(20)} ${ds.batches.find((b) => b.id === st.batch_id)?.name.padEnd(42)} joined ${st.joined_on}  fee ${rupees(st.monthly_fee)}  parent ${st.parent_name}, ${st.parent_phone}`);
  }
  const partial = ds.students.find((x) => x.profile === "partial");
  if (partial) {
    console.log(`\nSample payment history: ${partial.name} (pays only part of this month's fee)`);
    for (const p of ds.payments.filter((x) => x.student_id === partial.id)) console.log(`  ${p.paid_on}  ${rupees(p.amount).padStart(10)}  ${p.note}`);
  }
  console.log("\nColumns written (owner_id is NOT sent; Supabase fills it in from the login):");
  for (const [t, r] of Object.entries(rows)) console.log(`  ${t.padEnd(11)} ${Object.keys(r[0]).join(", ")}`);

  console.log(problems.length === 0 ? "\nValidation: OK (no problems found)" : `\nValidation: ${problems.length} PROBLEM(S)\n  ${problems.slice(0, 10).join("\n  ")}`);
  return problems.length === 0;
}

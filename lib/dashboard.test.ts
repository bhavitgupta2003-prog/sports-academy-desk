import test from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_PERIODS, LOW_ATTENDANCE_PCT, admissionsInPeriod, attendanceByBatch, feeStatusBreakdown, lowAttendanceStudents,
  paymentsInPeriod, periodStart, summarizeAttendance, summarizeDashboard,
} from "./dashboard.ts";
import { buildRows, type PaymentRow, type StudentRow } from "./studentList.ts";

const TODAY = "2026-10-22";
const mk = (id: string, name: string, batch: string, fee: number, joined: string): StudentRow => ({
  id, name, coach: "Ravi", monthly_fee: fee, joined_on: joined, batch_id: "b-" + batch, batches: { name: batch },
});
const students = [
  mk("1", "Aarav Kumar", "A", 3000, "2026-10-01"), // owes Oct, past the 5th -> overdue, 3000
  mk("2", "Meera Shah", "A", 3000, "2026-09-15"), // joined last month, paid 1000 -> overdue, 5000
  mk("3", "Rohan Das", "B", 2000, "2026-10-22"), // joined today -> due soon, 2000
  mk("4", "Isha Rao", "B", 2000, "2026-10-01"), // fully paid
];
const payments: PaymentRow[] = [
  { student_id: "2", amount: 1000 },
  { student_id: "4", amount: 2000 },
];
const rows = buildRows(students, payments, TODAY);

test("headline counts come from the rows", () => {
  const d = summarizeDashboard(rows, []);
  assert.equal(d.students, 4);
  assert.equal(d.batches, 2);
});
test("outstanding total adds up the same balances the list shows", () => {
  const d = summarizeDashboard(rows, []);
  assert.equal(d.totalOutstanding, 3000 + 5000 + 2000 + 0);
  assert.equal(d.studentsOwing, 3);
});
test("a student who paid ahead does not reduce the total owed", () => {
  const ahead = buildRows([mk("9", "Zed", "A", 1000, "2026-10-01")], [{ student_id: "9", amount: 5000 }], TODAY);
  const d = summarizeDashboard([...rows, ...ahead], []);
  assert.equal(d.totalOutstanding, 10000);
  assert.equal(d.studentsOwing, 3);
});
test("overdue list is only overdue students, biggest balance first", () => {
  const d = summarizeDashboard(rows, []);
  assert.deepEqual(d.overdue.map((r) => r.id), ["2", "1"]);
});
test("today's attendance counts present, absent and not marked", () => {
  const d = summarizeDashboard(rows, [
    { student_id: "1", status: "present" },
    { student_id: "2", status: "absent" },
    { student_id: "3", status: "present" },
  ]);
  assert.equal(d.present, 2);
  assert.equal(d.absent, 1);
  assert.equal(d.notMarked, 1);
});
test("marks for students that are not in the list are ignored", () => {
  const d = summarizeDashboard(rows, [{ student_id: "ghost", status: "present" }]);
  assert.equal(d.present, 0);
  assert.equal(d.notMarked, 4);
});
test("a student counted once even if two marks arrive", () => {
  const d = summarizeDashboard(rows, [
    { student_id: "1", status: "absent" },
    { student_id: "1", status: "present" },
  ]);
  assert.equal(d.present + d.absent, 1);
});
test("no students: everything is zero and the lists are empty", () => {
  const d = summarizeDashboard([], []);
  assert.deepEqual([d.students, d.batches, d.present, d.absent, d.notMarked, d.totalOutstanding, d.studentsOwing], [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(d.overdue, []);
});

// ---------- attendance periods ----------
test("period start dates for 22 Oct 2026", () => {
  assert.equal(periodStart("today", "2026-10-22"), "2026-10-22");
  assert.equal(periodStart("week", "2026-10-22"), "2026-10-16"); // 7 days including today
  assert.equal(periodStart("month", "2026-10-22"), "2026-09-23");
  assert.equal(periodStart("quarter", "2026-10-22"), "2026-07-23");
  assert.equal(periodStart("half", "2026-10-22"), "2026-04-23");
});
test("a week is 7 days and a month runs from the day after the same date last month", () => {
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;
  assert.equal(days(periodStart("week", "2026-10-22"), "2026-10-22"), 7);
  assert.equal(days(periodStart("month", "2026-10-22"), "2026-10-22"), 30); // 23 Sep to 22 Oct
});
test("month ends clamp: 31 Aug minus 6 months lands on the end of February", () => {
  assert.equal(periodStart("half", "2026-08-31"), "2026-03-01"); // 28 Feb 2026, then the next day
  assert.equal(periodStart("half", "2027-08-31"), "2027-03-01");
  assert.equal(periodStart("half", "2028-08-31"), "2028-03-01"); // leap year: 29 Feb 2028, then the next day
  assert.equal(periodStart("month", "2026-03-31"), "2026-03-01"); // 28 Feb, then the next day
});
test("periods cross a year boundary correctly", () => {
  assert.equal(periodStart("half", "2027-02-10"), "2026-08-11");
  assert.equal(periodStart("quarter", "2027-01-05"), "2026-10-06");
  assert.equal(periodStart("week", "2027-01-03"), "2026-12-28");
});
test("every period starts on or before today, and longer periods start earlier", () => {
  const today = "2026-10-22";
  const starts = DASHBOARD_PERIODS.map((p) => periodStart(p.value, today));
  for (const s of starts) assert.ok(s <= today);
  assert.deepEqual([...starts].sort().reverse(), starts); // today, week, month, quarter, half: each earlier than the last
  assert.deepEqual(DASHBOARD_PERIODS.map((p) => p.label), ["Today", "Last 7 days", "Last month", "Last 3 months", "Last 6 months"]);
});

// ---------- attendance summary ----------
const mark = (student_id: string, date: string, status: string) => ({ student_id, date, status });
test("attendance summary counts marks, percentage, session days and students", () => {
  const a = summarizeAttendance([
    mark("1", "2026-10-20", "present"), mark("2", "2026-10-20", "present"), mark("3", "2026-10-20", "absent"),
    mark("1", "2026-10-22", "present"), mark("2", "2026-10-22", "absent"),
  ], 10);
  assert.equal(a.present, 3);
  assert.equal(a.absent, 2);
  assert.equal(a.total, 5);
  assert.equal(a.presentPct, 60);
  assert.equal(a.sessionDays, 2);
  assert.equal(a.studentsMarked, 3);
  assert.equal(a.notMarked, 7);
});
test("with no marks the percentage is empty, not zero", () => {
  const a = summarizeAttendance([], 4);
  assert.equal(a.presentPct, null);
  assert.equal(a.total, 0);
  assert.equal(a.notMarked, 4);
});
test("percentages round to a whole number and 100% is possible", () => {
  assert.equal(summarizeAttendance([mark("1", "d1", "present"), mark("1", "d2", "present"), mark("2", "d1", "absent")], 2).presentPct, 67);
  assert.equal(summarizeAttendance([mark("1", "d1", "present")], 1).presentPct, 100);
});
test("unknown statuses are ignored and not-marked never goes below zero", () => {
  const a = summarizeAttendance([mark("1", "d1", "late"), mark("2", "d1", "present"), mark("3", "d1", "present")], 2);
  assert.equal(a.total, 2);
  assert.equal(a.notMarked, 0);
});
test("today view matches the old 'present today' numbers", () => {
  const marks = [mark("1", "2026-10-22", "present"), mark("2", "2026-10-22", "absent"), mark("3", "2026-10-22", "present")];
  const a = summarizeAttendance(marks, 4);
  assert.deepEqual([a.present, a.absent, a.notMarked], [2, 1, 1]);
});

// ---------- fees collected in a period ----------
const pay = (student_id: string, amount: number, paid_on: string) => ({ student_id, amount, paid_on });
test("fees collected: only payments inside the period count, both end days included", () => {
  const p = [pay("1", 1000, "2026-10-15"), pay("1", 500, "2026-10-16"), pay("2", 2000, "2026-10-22"), pay("3", 700, "2026-10-23"), pay("3", 300, "2026-09-01")];
  assert.deepEqual(paymentsInPeriod(p, "2026-10-16", "2026-10-22"), { total: 2500, count: 2 });
  assert.deepEqual(paymentsInPeriod(p, "2026-10-22", "2026-10-22"), { total: 2000, count: 1 }); // today only
  assert.deepEqual(paymentsInPeriod(p, "2026-04-23", "2026-10-22"), { total: 3800, count: 4 }); // a long period: 1000 + 500 + 2000 + 300 (the 23 Oct payment is after today)
});
test("fees collected: nothing recorded gives zero, and paise do not pick up rounding noise", () => {
  assert.deepEqual(paymentsInPeriod([], "2026-10-01", "2026-10-22"), { total: 0, count: 0 });
  assert.equal(paymentsInPeriod([pay("1", 0.1, "2026-10-01"), pay("1", 0.2, "2026-10-02")], "2026-10-01", "2026-10-22").total, 0.3);
});

// ---------- new admissions ----------
test("new admissions: joined inside the period, newest first", () => {
  const a = admissionsInPeriod(rows, "2026-09-23", "2026-10-22").map((r) => r.id);
  assert.deepEqual(a, ["3", "1", "4"]); // Rohan joined 22 Oct; Aarav and Isha both 1 Oct (alphabetical). Meera joined 15 Sep: outside.
  assert.deepEqual(admissionsInPeriod(rows, "2026-10-22", "2026-10-22").map((r) => r.id), ["3"]); // joined today
  assert.deepEqual(admissionsInPeriod(rows, "2026-04-23", "2026-10-22").length, 4);
  assert.deepEqual(admissionsInPeriod(rows, "2026-10-23", "2026-10-30"), []);
});

// ---------- fee status breakdown ----------
test("fee status breakdown counts each status and the paid-up share", () => {
  const b = feeStatusBreakdown(rows);
  assert.deepEqual([b.paid, b.dueSoon, b.overdue, b.total], [1, 1, 2, 4]);
  assert.equal(b.paidUpPct, 25);
  assert.equal(b.paid + b.dueSoon + b.overdue, b.total);
});
test("fee status breakdown with no students has no percentage", () => {
  assert.deepEqual(feeStatusBreakdown([]), { paid: 0, dueSoon: 0, overdue: 0, total: 0, paidUpPct: null });
});

// ---------- attendance by batch ----------
test("attendance by batch: per-batch counts, lowest percentage first, batches without marks last", () => {
  const marks = [
    mark("1", "2026-10-20", "present"), mark("2", "2026-10-20", "absent"), mark("1", "2026-10-22", "present"), mark("2", "2026-10-22", "absent"), // batch A: 2 of 4 = 50%
    mark("3", "2026-10-21", "present"), mark("4", "2026-10-21", "present"), // batch B: 100%
  ];
  const r = attendanceByBatch(rows, marks);
  assert.deepEqual(r.map((b) => [b.name, b.students, b.present, b.absent, b.pct, b.sessionDays]), [["A", 2, 2, 2, 50, 2], ["B", 2, 2, 0, 100, 1]]);
  const none = attendanceByBatch(rows, [mark("1", "2026-10-20", "present")]);
  assert.deepEqual(none.map((b) => [b.name, b.pct]), [["A", 100], ["B", null]]); // B has no marks so it goes last
});
test("attendance by batch ignores marks for unknown students and unknown statuses", () => {
  const r = attendanceByBatch(rows, [mark("ghost", "d1", "present"), mark("1", "d1", "late")]);
  assert.deepEqual(r.map((b) => b.total), [0, 0]);
});

// ---------- students needing attention ----------
test("needs attention: below the cut-off, with enough marks, worst first", () => {
  assert.equal(LOW_ATTENDANCE_PCT, 60);
  const marks = [
    ...["d1", "d2", "d3", "d4"].map((d, i) => mark("1", d, i === 0 ? "present" : "absent")), // 1 of 4 = 25%
    ...["d1", "d2", "d3"].map((d, i) => mark("2", d, i < 1 ? "present" : "absent")), // 1 of 3 = 33%
    ...["d1", "d2", "d3", "d4", "d5"].map((d, i) => mark("3", d, i < 4 ? "present" : "absent")), // 4 of 5 = 80%: fine
    mark("4", "d1", "absent"), mark("4", "d2", "absent"), // only 2 marks: too few to judge
  ];
  const low = lowAttendanceStudents(rows, marks);
  assert.deepEqual(low.map((l) => [l.id, l.pct, l.present, l.total]), [["1", 25, 1, 4], ["2", 33, 1, 3]]);
  assert.equal(low[0].batchName, "A");
});
test("needs attention: exactly at the cut-off is not flagged, and the list is capped", () => {
  const exactly = [mark("1", "d1", "present"), mark("1", "d2", "present"), mark("1", "d3", "present"), mark("1", "d4", "absent"), mark("1", "d5", "absent")]; // 60%
  assert.deepEqual(lowAttendanceStudents(rows, exactly), []);
  const many = Array.from({ length: 12 }, (_, i) => ({ ...rows[0], id: `s${i}`, name: `S${i}` }));
  const marks = many.flatMap((r) => ["d1", "d2", "d3"].map((d) => mark(r.id, d, "absent")));
  assert.equal(lowAttendanceStudents(many, marks).length, 8);
  assert.equal(lowAttendanceStudents(many, marks, 3).length, 3);
});

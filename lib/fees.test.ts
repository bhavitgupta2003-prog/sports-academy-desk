import test from "node:test";
import assert from "node:assert/strict";
import { addDays, feeStatus, isValidDate, monthsBilled, monthsOverdue, monthsPastDue, outstanding, todayString } from "./fees.ts";
import { buildDigest, studentLabel } from "./digest.ts";

// ---------- India time zone ----------
test("India date: 23:59 IST is still the same day", () => {
  // 18:29:59 UTC = 23:59:59 IST on 31 Oct
  assert.equal(todayString(new Date("2026-10-31T18:29:59Z")), "2026-10-31");
});
test("India date: 00:00 IST is already the next day (UTC server still says yesterday)", () => {
  // 18:30:00 UTC = 00:00:00 IST on 1 Nov
  assert.equal(todayString(new Date("2026-10-31T18:30:00Z")), "2026-11-01");
});
test("India date: new year arrives at 18:30 UTC on 31 Dec", () => {
  assert.equal(todayString(new Date("2026-12-31T18:30:00Z")), "2027-01-01");
});

// ---------- date helpers ----------
test("isValidDate accepts real dates and rejects impossible ones", () => {
  assert.equal(isValidDate("2026-10-22"), true);
  assert.equal(isValidDate("2028-02-29"), true); // leap year
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(isValidDate("22-10-2026"), false);
  assert.equal(isValidDate(""), false);
});
test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-10-22", -29), "2026-09-23");
  assert.equal(addDays("2026-01-05", -10), "2025-12-26");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

// ---------- months billed ----------
test("joining this month bills one month", () => {
  assert.equal(monthsBilled("2026-10-05", "2026-10-22"), 1);
});
test("joining on the last day of the month still bills that month, then the next one", () => {
  assert.equal(monthsBilled("2026-10-31", "2026-10-31"), 1);
  assert.equal(monthsBilled("2026-10-31", "2026-11-01"), 2);
});
test("joining on the 1st: same month is 1, next 1st is 2", () => {
  assert.equal(monthsBilled("2026-10-01", "2026-10-01"), 1);
  assert.equal(monthsBilled("2026-10-01", "2026-11-01"), 2);
});
test("counts across a year boundary", () => {
  assert.equal(monthsBilled("2026-11-30", "2027-02-01"), 4);
  assert.equal(monthsBilled("2026-12-31", "2027-01-01"), 2);
});
test("a student joining in a future month is billed nothing yet", () => {
  assert.equal(monthsBilled("2026-12-01", "2026-10-22"), 0);
});
test("bad dates bill nothing instead of producing NaN", () => {
  assert.equal(monthsBilled("", "2026-10-22"), 0);
  assert.equal(monthsBilled("2026-10-22", "oops"), 0);
});

// ---------- outstanding balance ----------
test("joined this month, partial payment", () => {
  assert.equal(outstanding(3000, "2026-10-05", 1000, "2026-10-22"), 2000);
});
test("joined last month, nothing paid: two months owed", () => {
  assert.equal(outstanding(3000, "2026-09-01", 0, "2026-10-22"), 6000);
});
test("joined last month, one month paid in full: one month owed", () => {
  assert.equal(outstanding(3000, "2026-09-15", 3000, "2026-10-22"), 3000);
});
test("joined last month, partial payment across two months", () => {
  assert.equal(outstanding(3000, "2026-09-15", 4000, "2026-10-22"), 2000);
});
test("joined 3 months ago, several partial payments add up", () => {
  const paid = 1000 + 1500 + 500;
  assert.equal(outstanding(2000, "2026-08-10", paid, "2026-10-22"), 3000);
});
test("fully paid is exactly zero", () => {
  assert.equal(outstanding(3000, "2026-09-01", 6000, "2026-10-22"), 0);
});
test("overpaying goes negative (paid ahead)", () => {
  assert.equal(outstanding(3000, "2026-10-05", 4000, "2026-10-22"), -1000);
});
test("balance rolls over when the India month changes", () => {
  const joined = "2026-10-05";
  const lateOctober = todayString(new Date("2026-10-31T18:29:59Z")); // 23:59 IST on 31 Oct
  const earlyNovember = todayString(new Date("2026-10-31T18:30:00Z")); // 00:00 IST on 1 Nov
  assert.equal(outstanding(3000, joined, 3000, lateOctober), 0);
  assert.equal(outstanding(3000, joined, 3000, earlyNovember), 3000);
});
test("rupee and paise amounts don't pick up decimal noise", () => {
  assert.equal(outstanding(2500.5, "2026-10-01", 0.1 + 0.2, "2026-10-22"), 2500.2);
  assert.equal(outstanding(999.99, "2026-08-01", 0, "2026-10-22"), 2999.97);
});
test("a student who hasn't started yet owes nothing", () => {
  assert.equal(outstanding(3000, "2026-12-01", 0, "2026-10-22"), 0);
});
test("free students owe nothing", () => {
  assert.equal(outstanding(0, "2026-01-01", 0, "2026-10-22"), 0);
});

// ---------- months overdue ----------
test("months overdue rounds up and ignores credit", () => {
  assert.equal(monthsOverdue(3000, 4000), 2);
  assert.equal(monthsOverdue(3000, 3000), 1);
  assert.equal(monthsOverdue(3000, 0.01), 1);
  assert.equal(monthsOverdue(3000, -1000), 0);
  assert.equal(monthsOverdue(0, 500), 0);
});

// ---------- AI digest uses the same maths ----------
test("AI digest matches the student page for a student who joined last month", () => {
  const students = [{ id: "s1", name: "Aarav Kumar", monthly_fee: 3000, joined_on: "2026-09-15", batches: { name: "Batch A" } }];
  const attendance = [
    { student_id: "s1", status: "present" },
    { student_id: "s1", status: "absent" },
  ];
  const payments = [{ student_id: "s1", amount: 1000 }];
  const d = buildDigest(students, attendance, payments, "2026-10-22", 30);
  assert.equal(d.students[0].outstanding, outstanding(3000, "2026-09-15", 1000, "2026-10-22"));
  assert.equal(d.students[0].outstanding, 5000);
  assert.equal(d.students[0].monthsOverdue, 2);
  assert.equal(d.students[0].attendancePct, 50);
  assert.equal(d.totals.totalOutstanding, 5000);
  assert.equal(d.students[0].label, "Aarav K.");
});
test("student label never exposes a full surname", () => {
  assert.equal(studentLabel("Aarav"), "Aarav");
  assert.equal(studentLabel("Aarav Kumar Singh"), "Aarav S.");
});

// ---------- fee status: due on the 5th (joining month: the later of the 5th and the joining day) ----------
test("status: nothing owed is Paid", () => {
  assert.equal(feeStatus(3000, "2026-10-01", 3000, "2026-10-22"), "paid");
  assert.equal(feeStatus(3000, "2026-09-01", 6000, "2026-10-22"), "paid");
});
test("status: paid ahead is still Paid", () => {
  assert.equal(feeStatus(3000, "2026-10-01", 9000, "2026-10-22"), "paid");
});
test("status: a free student is Paid", () => {
  assert.equal(feeStatus(0, "2026-01-01", 0, "2026-10-22"), "paid");
});
test("status: unpaid fee after the 5th is Overdue", () => {
  assert.equal(feeStatus(3000, "2026-10-01", 0, "2026-10-22"), "overdue");
});
test("status: partial payment after the due date stays Overdue", () => {
  assert.equal(feeStatus(3000, "2026-10-01", 1000, "2026-10-22"), "overdue");
});
test("status: previous month unpaid is Overdue even on the 1st", () => {
  assert.equal(feeStatus(3000, "2026-09-01", 0, "2026-10-01"), "overdue");
  assert.equal(feeStatus(3000, "2026-09-01", 3000, "2026-10-01"), "due_soon"); // September paid, October due on the 5th
});
test("status boundary: due on the 5th is Due soon on the 5th and Overdue on the 6th", () => {
  assert.equal(feeStatus(3000, "2026-09-01", 3000, "2026-10-04"), "due_soon");
  assert.equal(feeStatus(3000, "2026-09-01", 3000, "2026-10-05"), "due_soon");
  assert.equal(feeStatus(3000, "2026-09-01", 3000, "2026-10-06"), "overdue");
});
test("status: joined today and unpaid is Due soon (first fee is due on the joining day)", () => {
  assert.equal(feeStatus(3000, "2026-10-22", 0, "2026-10-22"), "due_soon");
});
test("status: joined yesterday (after the 5th) and unpaid is Overdue", () => {
  assert.equal(feeStatus(3000, "2026-10-21", 0, "2026-10-22"), "overdue");
});
test("status: joined on the 3rd, checked on the 4th and 5th, is Due soon; the 6th is Overdue", () => {
  assert.equal(feeStatus(3000, "2026-10-03", 0, "2026-10-04"), "due_soon");
  assert.equal(feeStatus(3000, "2026-10-03", 0, "2026-10-05"), "due_soon");
  assert.equal(feeStatus(3000, "2026-10-03", 0, "2026-10-06"), "overdue");
});
test("status: a student who has not started yet is Paid (nothing billed)", () => {
  assert.equal(feeStatus(3000, "2026-12-01", 0, "2026-10-22"), "paid");
});
test("status rolls over at India midnight on the 1st", () => {
  const lastNight = todayString(new Date("2026-10-31T18:29:59Z")); // 23:59 IST 31 Oct
  const midnight = todayString(new Date("2026-10-31T18:30:00Z")); // 00:00 IST 1 Nov
  assert.equal(feeStatus(3000, "2026-10-01", 3000, lastNight), "paid");
  assert.equal(feeStatus(3000, "2026-10-01", 3000, midnight), "due_soon");
});
test("monthsPastDue counts only months whose due date has passed", () => {
  assert.equal(monthsPastDue("2026-09-01", "2026-10-04"), 1);
  assert.equal(monthsPastDue("2026-09-01", "2026-10-06"), 2);
  assert.equal(monthsPastDue("2026-10-22", "2026-10-22"), 0);
  assert.equal(monthsPastDue("2026-11-20", "2027-01-10"), 3); // 20 Nov, 5 Dec, 5 Jan
  assert.equal(monthsPastDue("2026-12-01", "2026-10-22"), 0);
});

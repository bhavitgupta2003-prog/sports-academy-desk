import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDashboard } from "./dashboard.ts";
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

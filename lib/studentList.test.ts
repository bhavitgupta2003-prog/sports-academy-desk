import test from "node:test";
import assert from "node:assert/strict";
import { outstanding } from "./fees.ts";
import { buildRows, filterRows, noFilters, type PaymentRow, type StudentRow } from "./studentList.ts";

const TODAY = "2026-10-22";
const mk = (id: string, name: string, batch: string, fee: number, joined: string): StudentRow => ({
  id, name, coach: "Ravi", monthly_fee: fee, joined_on: joined, batch_id: "b-" + batch, batches: { name: batch },
});
const students = [
  mk("1", "Aarav Kumar", "A", 3000, "2026-10-01"), // owes Oct, past the 5th -> overdue
  mk("2", "Meera Shah", "A", 3000, "2026-09-15"), // joined last month
  mk("3", "Rohan Das", "B", 2000, "2026-10-22"), // joined today -> due soon
  mk("4", "Isha Rao", "B", 2000, "2026-10-01"), // fully paid
];
const payments: PaymentRow[] = [
  { student_id: "2", amount: 1000 },
  { student_id: "2", amount: 500 },
  { student_id: "4", amount: 2000 },
];
const rows = buildRows(students, payments, TODAY);
const by = (id: string) => rows.find((r) => r.id === id)!;

test("outstanding on the list matches the shared fee function (same number as the detail page)", () => {
  for (const r of rows) {
    const paid = payments.filter((p) => p.student_id === r.id).reduce((s, p) => s + p.amount, 0);
    assert.equal(r.owed, outstanding(r.monthly_fee, r.joined_on, paid, TODAY));
  }
  assert.equal(by("1").owed, 3000);
  assert.equal(by("2").owed, 4500); // 2 months x 3000 - 1500
  assert.equal(by("3").owed, 2000);
  assert.equal(by("4").owed, 0);
});
test("partial payments are added up and reflected", () => {
  assert.equal(by("2").paid, 1500);
  const more = buildRows(students, [...payments, { student_id: "2", amount: 1000 }], TODAY);
  assert.equal(more.find((r) => r.id === "2")!.owed, 3500);
});
test("statuses: paid, overdue and due soon", () => {
  assert.equal(by("4").status, "paid");
  assert.equal(by("1").status, "overdue");
  assert.equal(by("2").status, "overdue");
  assert.equal(by("3").status, "due_soon");
});
test("paying in full turns Overdue into Paid", () => {
  const r = buildRows(students, [...payments, { student_id: "1", amount: 3000 }], TODAY).find((x) => x.id === "1")!;
  assert.equal(r.owed, 0);
  assert.equal(r.status, "paid");
});
test("filter: search by name ignores case and spaces", () => {
  assert.deepEqual(filterRows(rows, { ...noFilters, search: "  mEEra " }).map((r) => r.id), ["2"]);
  assert.deepEqual(filterRows(rows, { ...noFilters, search: "a" }).map((r) => r.id), ["1", "2", "3", "4"]);
});
test("filter: batch", () => {
  assert.deepEqual(filterRows(rows, { ...noFilters, batchId: "b-B" }).map((r) => r.id), ["3", "4"]);
});
test("filter: fee status", () => {
  assert.deepEqual(filterRows(rows, { ...noFilters, status: "overdue" }).map((r) => r.id), ["1", "2"]);
  assert.deepEqual(filterRows(rows, { ...noFilters, status: "paid" }).map((r) => r.id), ["4"]);
  assert.deepEqual(filterRows(rows, { ...noFilters, status: "due_soon" }).map((r) => r.id), ["3"]);
});
test("filters work together", () => {
  assert.deepEqual(filterRows(rows, { search: "", batchId: "b-A", status: "overdue" }).map((r) => r.id), ["1", "2"]);
  assert.deepEqual(filterRows(rows, { search: "aarav", batchId: "b-A", status: "overdue" }).map((r) => r.id), ["1"]);
  assert.deepEqual(filterRows(rows, { search: "aarav", batchId: "b-B", status: "all" }), []);
  assert.deepEqual(filterRows(rows, { search: "", batchId: "b-B", status: "overdue" }), []);
});
test("no filters returns everyone", () => {
  assert.equal(filterRows(rows, noFilters).length, 4);
});
test("a student with no batch still appears", () => {
  const r = buildRows([{ ...students[0], batches: null }], [], TODAY);
  assert.equal(r[0].batchName, "No batch");
});

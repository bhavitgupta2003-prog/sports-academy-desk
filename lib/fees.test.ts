import test from "node:test";
import assert from "node:assert/strict";
import { monthsBilled, outstanding, monthsOverdue } from "./fees.ts";

test("joining this month bills one month", () => {
  assert.equal(monthsBilled("2026-10-05", "2026-10-22"), 1);
});
test("counts across a year boundary", () => {
  assert.equal(monthsBilled("2026-11-30", "2027-02-01"), 4);
});
test("outstanding after a partial payment", () => {
  assert.equal(outstanding(3000, "2026-10-05", 1000, "2026-10-22"), 2000);
});
test("two months billed, nothing paid", () => {
  assert.equal(outstanding(3000, "2026-09-01", 0, "2026-10-22"), 6000);
});
test("overpaid goes negative", () => {
  assert.equal(outstanding(3000, "2026-10-05", 4000, "2026-10-22"), -1000);
});
test("months overdue rounds up and ignores credit", () => {
  assert.equal(monthsOverdue(3000, 4000), 2);
  assert.equal(monthsOverdue(3000, -1000), 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, normalizeName, validateRecordDate } from "./validation.ts";

const TODAY = "2026-10-22";

// ---------- record dates (attendance and payments) ----------
test("today is allowed", () => {
  assert.equal(validateRecordDate("2026-10-22", TODAY, "attendance"), null);
  assert.equal(validateRecordDate("2026-10-22", TODAY, "payment"), null);
});
test("past dates still work, including across months and years", () => {
  assert.equal(validateRecordDate("2026-10-21", TODAY, "attendance"), null);
  assert.equal(validateRecordDate("2026-01-01", TODAY, "payment"), null);
  assert.equal(validateRecordDate("2025-12-31", TODAY, "attendance"), null);
});
test("tomorrow is rejected with a clear message", () => {
  assert.match(validateRecordDate("2026-10-23", TODAY, "attendance")!, /future date/);
  assert.match(validateRecordDate("2026-10-23", TODAY, "payment")!, /can't be in the future/);
});
test("far-future dates are rejected", () => {
  assert.ok(validateRecordDate("2030-01-01", TODAY, "attendance"));
  assert.ok(validateRecordDate("2027-01-01", TODAY, "payment"));
});
test("empty or impossible dates are rejected, not changed", () => {
  assert.match(validateRecordDate("", TODAY, "attendance")!, /Choose a date/);
  assert.match(validateRecordDate("", TODAY, "payment")!, /Choose the payment date/);
  assert.match(validateRecordDate("2026-02-30", TODAY, "payment")!, /isn't valid/);
  assert.match(validateRecordDate("tomorrow", TODAY, "attendance")!, /isn't valid/);
});
test("India midnight: at 00:00 IST on the 23rd, the 23rd becomes allowed", () => {
  assert.ok(validateRecordDate("2026-10-23", "2026-10-22", "attendance"));
  assert.equal(validateRecordDate("2026-10-23", "2026-10-23", "attendance"), null);
});

// ---------- duplicate student names ----------
test("names are compared ignoring case and extra spaces", () => {
  assert.equal(normalizeName("  AARAV    Kumar "), "aarav kumar");
  const existing = [{ name: "Aarav Kumar" }, { name: "Meera Shah" }];
  assert.equal(findDuplicates(existing, "aarav kumar").length, 1);
  assert.equal(findDuplicates(existing, "  AARAV   KUMAR  ").length, 1);
});
test("a different name is not a duplicate", () => {
  const existing = [{ name: "Aarav Kumar" }];
  assert.equal(findDuplicates(existing, "Aarav Kumari").length, 0);
  assert.equal(findDuplicates(existing, "Aarav").length, 0);
});
test("every matching student is returned (so the warning can list them)", () => {
  const existing = [{ name: "Isha Rao", id: 1 }, { name: "isha  rao", id: 2 }, { name: "Rohan", id: 3 }];
  assert.deepEqual(findDuplicates(existing, "ISHA RAO").map((x) => x.id), [1, 2]);
});
test("an empty name never matches anything", () => {
  assert.deepEqual(findDuplicates([{ name: "" }, { name: "  " }], "   "), []);
});

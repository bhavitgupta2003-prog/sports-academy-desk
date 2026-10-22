import test from "node:test";
import assert from "node:assert/strict";
import { daysUntil, formatTime, isMissingTableError, shortDate, validateEvent, whenText } from "./events.ts";

const TODAY = "2026-10-22";
const ok = { title: "Inter-academy match", date: "2026-10-25", time: "17:30", location: "Main ground", notes: "Bring kit" };

test("a complete event is valid, and time, place and notes are optional", () => {
  assert.deepEqual(validateEvent(ok, TODAY), {});
  assert.deepEqual(validateEvent({ title: "Sports day", date: TODAY, time: "", location: "", notes: "" }, TODAY), {});
});
test("the title is required and limited in length", () => {
  assert.match(validateEvent({ ...ok, title: "   " }, TODAY).title, /Enter the event title/);
  assert.match(validateEvent({ ...ok, title: "x".repeat(121) }, TODAY).title, /under 120/);
  assert.deepEqual(validateEvent({ ...ok, title: "x".repeat(120) }, TODAY), {});
});
test("the date is required, real, and not in the past", () => {
  assert.match(validateEvent({ ...ok, date: "" }, TODAY).date, /Choose the event date/);
  assert.match(validateEvent({ ...ok, date: "2026-02-30" }, TODAY).date, /isn't valid/);
  assert.match(validateEvent({ ...ok, date: "2026-10-21" }, TODAY).date, /past/);
  assert.deepEqual(validateEvent({ ...ok, date: TODAY }, TODAY), {}); // today is fine
});
test("time must look like HH:MM (24-hour)", () => {
  for (const t of ["00:00", "09:05", "23:59"]) assert.deepEqual(validateEvent({ ...ok, time: t }, TODAY), {}, t);
  for (const t of ["24:00", "9:30", "12:60", "noon", "17.30"]) assert.match(validateEvent({ ...ok, time: t }, TODAY).time, /like 17:30/, t);
});
test("place and notes have length limits", () => {
  assert.match(validateEvent({ ...ok, location: "x".repeat(121) }, TODAY).location, /120/);
  assert.match(validateEvent({ ...ok, notes: "x".repeat(501) }, TODAY).notes, /500/);
});
test("days until and wording, across month and year ends", () => {
  assert.equal(daysUntil("2026-10-22", TODAY), 0);
  assert.equal(daysUntil("2026-11-01", TODAY), 10);
  assert.equal(daysUntil("2027-01-02", "2026-12-31"), 2);
  assert.equal(daysUntil("2026-10-20", TODAY), -2);
  assert.deepEqual(["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-21", "2026-10-17"].map((d) => whenText(d, TODAY)), ["today", "tomorrow", "in 4 days", "yesterday", "5 days ago"]);
});
test("short dates and times read naturally", () => {
  assert.equal(shortDate("2026-11-05"), "5 Nov");
  assert.equal(shortDate("2026-11-05", true), "5 Nov 2026");
  assert.deepEqual(["17:30:00", "17:30", "09:05:00", "00:00:00", "12:00:00", "23:59:00", null, ""].map(formatTime), ["5:30 PM", "5:30 PM", "9:05 AM", "12:00 AM", "12:00 PM", "11:59 PM", "", ""]);
});
test("a missing events table is recognised, other errors are not", () => {
  assert.equal(isMissingTableError({ code: "PGRST205", message: "Could not find the table 'public.events' in the schema cache" }), true);
  assert.equal(isMissingTableError({ code: "42P01" }), true);
  assert.equal(isMissingTableError({ message: 'relation "events" does not exist' }), true);
  assert.equal(isMissingTableError({ code: "42501" }), false);
  assert.equal(isMissingTableError({ message: "Failed to fetch" }), false);
  assert.equal(isMissingTableError(null), false);
});

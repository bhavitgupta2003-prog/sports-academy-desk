// Events: validation and wording. No database code here.

import { isValidDate } from "./fees.ts";

export type EventRow = {
  id: string;
  title: string;
  event_date: string; // YYYY-MM-DD
  event_time: string | null; // "17:30:00"
  location: string | null;
  notes: string | null;
  batch_id: string | null;
  batches: { name: string } | null;
};

export type EventForm = { title: string; date: string; time: string; location: string; notes: string };

export const TITLE_MAX = 120;
export const LOCATION_MAX = 120;
export const NOTES_MAX = 500;

/** Messages to show next to the form fields. An empty object means the form is fine. */
export function validateEvent(f: EventForm, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = f.title.trim();
  if (!title) errors.title = "Enter the event title.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if (!f.date) errors.date = "Choose the event date.";
  else if (!isValidDate(f.date)) errors.date = "That date isn't valid.";
  else if (f.date < today) errors.date = "The event date can't be in the past.";
  if (f.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)) errors.time = "Enter the time like 17:30.";
  if (f.location.trim().length > LOCATION_MAX) errors.location = `Keep the place under ${LOCATION_MAX} characters.`;
  if (f.notes.trim().length > NOTES_MAX) errors.notes = `Keep the notes under ${NOTES_MAX} characters.`;
  return errors;
}

const dayNumber = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
};

/** Whole days from today to the date (0 = today, 1 = tomorrow, negative = in the past). */
export function daysUntil(date: string, today: string): number {
  return dayNumber(date) - dayNumber(today);
}

/** "today", "tomorrow", "in 3 days", "yesterday", "5 days ago". */
export function whenText(date: string, today: string): string {
  const n = daysUntil(date, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "5 Nov" (or "5 Nov 2026" with the year). */
export function shortDate(date: string, withYear = false): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** "17:30:00" or "17:30" becomes "5:30 PM". Empty for no time. */
export function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** True when the events table has not been created in the database yet (the one-time setup is missing). */
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined;
  if (!e) return false;
  return e.code === "PGRST205" || e.code === "42P01" || /could not find the table|relation .* does not exist/i.test(String(e.message ?? ""));
}

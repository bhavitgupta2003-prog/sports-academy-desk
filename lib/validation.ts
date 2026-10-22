import { isValidDate } from "./fees.ts";

/**
 * Checks a date that staff type for a record (attendance or payment).
 * Returns a message to show, or null when the date is fine.
 * "today" is the India date from todayString(); past dates are always allowed.
 */
export function validateRecordDate(date: string, today: string, kind: "attendance" | "payment"): string | null {
  if (!date) return kind === "attendance" ? "Choose a date for the attendance." : "Choose the payment date.";
  if (!isValidDate(date)) return "That date isn't valid. Use a real calendar date.";
  if (date > today) {
    return kind === "attendance"
      ? "You can't record attendance for a future date. Choose today or an earlier date."
      : "The payment date can't be in the future. Choose today or an earlier date.";
  }
  return null;
}

/** Lower-case, trim, and squash repeated spaces so "  AARAV   kumar " equals "aarav kumar". */
export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Existing students whose name matches the new name (ignoring case and extra spaces). */
export function findDuplicates<T extends { name: string }>(existing: T[], name: string): T[] {
  const key = normalizeName(name);
  if (!key) return [];
  return existing.filter((e) => normalizeName(e.name) === key);
}

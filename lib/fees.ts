// All money and date maths lives here. The AI never calculates fees.
// Every "today" is the date in India (Asia/Kolkata), no matter where the code runs.

const INDIA = "Asia/Kolkata";

/** Today's date in India as YYYY-MM-DD. Pass a Date only in tests. */
export function todayString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: INDIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Add (or subtract) whole days from a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Months billed = the joining month through the current month, inclusive.
 * (Joining on the 28th still bills that whole month. Fees are billed monthly in advance.)
 * Joining in a future month bills nothing yet.
 */
export function monthsBilled(joinedOn: string, today: string): number {
  if (!isValidDate(joinedOn) || !isValidDate(today)) return 0;
  const [jy, jm] = joinedOn.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  return Math.max(0, (ty - jy) * 12 + (tm - jm) + 1);
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

/**
 * Outstanding = monthly fee x months billed - total paid, in rupees.
 * Worked in whole paise so amounts like 2500.50 never pick up decimal noise.
 * Negative means the family has paid ahead.
 */
export function outstanding(monthlyFee: number, joinedOn: string, totalPaid: number, today: string): number {
  const owedPaise = toPaise(monthlyFee) * monthsBilled(joinedOn, today) - toPaise(totalPaid);
  return owedPaise / 100;
}

/** Whole months of fees still unpaid (0 if nothing is owed). */
export function monthsOverdue(monthlyFee: number, owed: number): number {
  if (owed <= 0 || monthlyFee <= 0) return 0;
  return Math.ceil(toPaise(owed) / toPaise(monthlyFee));
}

// ---------- Fee status (due dates) ----------

/** Each month's fee is due on this day of the month (change here to change the rule). */
export const DUE_DAY = 5;

export type FeeStatus = "paid" | "due_soon" | "overdue";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The due date of the i-th billed month (0 = the joining month).
 * A month is due on DUE_DAY, except the joining month: if the student joined after DUE_DAY,
 * that first fee is due on the joining day.
 */
function dueDateForMonth(joinedOn: string, i: number): string {
  const [jy, jm] = joinedOn.split("-").map(Number);
  const idx = jm - 1 + i;
  const y = jy + Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const standard = `${y}-${pad2(m)}-${pad2(DUE_DAY)}`;
  return i === 0 && joinedOn > standard ? joinedOn : standard;
}

/** How many billed months have a due date BEFORE today. */
export function monthsPastDue(joinedOn: string, today: string): number {
  const billed = monthsBilled(joinedOn, today);
  let count = 0;
  for (let i = 0; i < billed; i++) if (dueDateForMonth(joinedOn, i) < today) count++;
  return count;
}

/**
 * The due date of the oldest fee that is not fully paid yet (payments are applied to the oldest months first),
 * or null when everything billed so far is paid. Before today means overdue; today or later means due soon.
 */
export function earliestUnpaidDueDate(monthlyFee: number, joinedOn: string, totalPaid: number, today: string): string | null {
  if (!isValidDate(joinedOn) || !isValidDate(today)) return null;
  const feePaise = toPaise(monthlyFee);
  if (feePaise <= 0) return null;
  const billed = monthsBilled(joinedOn, today);
  const monthsCovered = Math.floor(toPaise(totalPaid) / feePaise);
  if (monthsCovered >= billed) return null;
  return dueDateForMonth(joinedOn, monthsCovered);
}

/**
 * Paid     = nothing owed.
 * Overdue  = an unpaid fee's due date is before today.
 * Due soon = money is owed, but every unpaid fee is due today or later.
 */
export function feeStatus(monthlyFee: number, joinedOn: string, totalPaid: number, today: string): FeeStatus {
  if (outstanding(monthlyFee, joinedOn, totalPaid, today) <= 0) return "paid";
  const pastDuePaise = toPaise(monthlyFee) * monthsPastDue(joinedOn, today) - toPaise(totalPaid);
  return pastDuePaise > 0 ? "overdue" : "due_soon";
}

export function rupees(n: number): string {
  return "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// All money maths lives here. The AI never calculates fees.

/** Today as YYYY-MM-DD in the user's local time. */
export function todayString(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Months billed = join month through the current month, inclusive. */
export function monthsBilled(joinedOn: string, today: string): number {
  const [jy, jm] = joinedOn.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  return Math.max(0, (ty - jy) * 12 + (tm - jm) + 1);
}

/** Outstanding = fee x months billed - total paid. Can be negative if overpaid. */
export function outstanding(monthlyFee: number, joinedOn: string, totalPaid: number, today: string): number {
  return Math.round((monthlyFee * monthsBilled(joinedOn, today) - totalPaid) * 100) / 100;
}

/** Whole months of fees still unpaid (0 if nothing is owed). */
export function monthsOverdue(monthlyFee: number, owed: number): number {
  if (owed <= 0 || monthlyFee <= 0) return 0;
  return Math.ceil(owed / monthlyFee);
}

export function rupees(n: number): string {
  return "Rs " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

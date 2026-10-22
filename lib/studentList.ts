import { feeStatus, outstanding, type FeeStatus } from "./fees.ts";

// Turns database rows into what the Students list shows, using the shared fee functions.

export type StudentRow = {
  id: string;
  name: string;
  coach: string;
  monthly_fee: number;
  joined_on: string;
  batch_id: string;
  batches: { name: string } | null;
};
export type PaymentRow = { student_id: string; amount: number };

export type ListRow = StudentRow & { batchName: string; paid: number; owed: number; status: FeeStatus };

export function buildRows(students: StudentRow[], payments: PaymentRow[], today: string): ListRow[] {
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.student_id, (paidBy.get(p.student_id) ?? 0) + Number(p.amount));
  return students.map((s) => {
    const fee = Number(s.monthly_fee);
    const paid = paidBy.get(s.id) ?? 0;
    return {
      ...s,
      monthly_fee: fee,
      batchName: s.batches?.name ?? "No batch",
      paid,
      owed: outstanding(fee, s.joined_on, paid, today),
      status: feeStatus(fee, s.joined_on, paid, today),
    };
  });
}

export type Filters = { search: string; batchId: string; status: "all" | FeeStatus };
export const noFilters: Filters = { search: "", batchId: "", status: "all" };

/** All three filters must match at the same time. */
export function filterRows(rows: ListRow[], f: Filters): ListRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q || r.name.toLowerCase().includes(q)) &&
      (!f.batchId || r.batch_id === f.batchId) &&
      (f.status === "all" || r.status === f.status),
  );
}

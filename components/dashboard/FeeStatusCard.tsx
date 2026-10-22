import Link from "next/link";
import type { StatusBreakdown } from "@/lib/dashboard";
import Icon, { type IconName } from "@/components/ui/Icon";

const rows: { key: "paid" | "dueSoon" | "overdue"; status: string; label: string; icon: IconName; bar: string; text: string }[] = [
  { key: "paid", status: "paid", label: "Paid", icon: "checkCircle", bar: "bg-emerald-600", text: "text-emerald-900" },
  { key: "dueSoon", status: "due_soon", label: "Due soon", icon: "clock", bar: "bg-amber-500", text: "text-amber-900" },
  { key: "overdue", status: "overdue", label: "Overdue", icon: "alert", bar: "bg-red-600", text: "text-red-900" },
];

// How many students are Paid, Due soon and Overdue. Each row opens the Students list with that filter already on.
export default function FeeStatusCard({ breakdown }: { breakdown: StatusBreakdown }) {
  const { total } = breakdown;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">Fee status</p>
      <p className="mt-0.5 text-xs text-slate-500">As of today. Click a status to see those students.</p>

      {total > 0 && (
        <div
          role="img"
          aria-label={`${breakdown.paid} paid, ${breakdown.dueSoon} due soon, ${breakdown.overdue} overdue`}
          className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100"
        >
          {rows.map((r) => (breakdown[r.key] > 0 ? <span key={r.key} className={r.bar} style={{ width: `${(breakdown[r.key] / total) * 100}%` }} /> : null))}
        </div>
      )}

      <ul className="mt-3 space-y-1">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={`/students?status=${r.status}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <Icon name={r.icon} className={`h-4 w-4 ${r.text}`} />
              <span className="text-slate-700">{r.label}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900">{breakdown[r.key]}</span>
              <Icon name="chevronRight" className="h-4 w-4 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
        {breakdown.paidUpPct === null
          ? "No students yet."
          : `${breakdown.paid} of ${total} students fully paid up (${breakdown.paidUpPct}%).`}
      </p>
    </div>
  );
}

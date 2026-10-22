import type { FeeStatus } from "@/lib/fees";

// Each status has a different symbol AND word, so it never relies on colour alone.
const look: Record<FeeStatus, { text: string; icon: string; cls: string }> = {
  paid: { text: "Paid", icon: "✓", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  due_soon: { text: "Due soon", icon: "⏰", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  overdue: { text: "Overdue", icon: "⚠", cls: "border-red-300 bg-red-50 text-red-800" },
};

export default function FeeStatusBadge({ status }: { status: FeeStatus }) {
  const l = look[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${l.cls}`}>
      <span aria-hidden="true">{l.icon}</span>
      {l.text}
    </span>
  );
}

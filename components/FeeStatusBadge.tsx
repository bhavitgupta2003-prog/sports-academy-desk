import type { FeeStatus } from "@/lib/fees";
import Icon, { type IconName } from "@/components/ui/Icon";

// Each status has its own icon AND word, so it never relies on colour alone.
const look: Record<FeeStatus, { text: string; icon: IconName; cls: string }> = {
  paid: { text: "Paid", icon: "checkCircle", cls: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  due_soon: { text: "Due soon", icon: "clock", cls: "border-amber-300 bg-amber-50 text-amber-900" },
  overdue: { text: "Overdue", icon: "alert", cls: "border-red-200 bg-red-50 text-red-900" },
};

export default function FeeStatusBadge({ status }: { status: FeeStatus }) {
  const l = look[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${l.cls}`}>
      <Icon name={l.icon} className="h-3.5 w-3.5" />
      {l.text}
    </span>
  );
}

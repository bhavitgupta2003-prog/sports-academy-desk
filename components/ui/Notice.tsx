import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

type Tone = "success" | "error" | "warning" | "info";

const look: Record<Tone, { box: string; icon: IconName; iconColor: string }> = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "checkCircle", iconColor: "text-emerald-700" },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: "xCircle", iconColor: "text-red-700" },
  warning: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: "alert", iconColor: "text-amber-700" },
  info: { box: "border-slate-200 bg-slate-50 text-slate-800", icon: "info", iconColor: "text-slate-600" },
};

// Success / error / warning / info message. Errors and warnings are announced to screen readers at once.
export default function Notice({
  tone,
  children,
  action,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const l = look[tone];
  return (
    <div role={tone === "error" || tone === "warning" ? "alert" : "status"} className={`flex gap-3 rounded-lg border p-3.5 text-sm ${l.box} ${className}`}>
      <Icon name={l.icon} className={`mt-0.5 h-5 w-5 ${l.iconColor}`} />
      <div className="min-w-0 flex-1">
        {children}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

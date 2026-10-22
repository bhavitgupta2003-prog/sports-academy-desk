import type { ReactNode } from "react";
import { card, cardFlush } from "@/lib/ui";

// A white panel with an optional title row. `flush` removes padding (for edge-to-edge tables).
export default function Card({
  title,
  description,
  actions,
  flush = false,
  className = "",
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const head = (title || actions) && (
    <div className={`flex flex-wrap items-start justify-between gap-2 ${flush ? "border-b border-slate-200 px-5 py-4" : "mb-4"}`}>
      <div>
        {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {actions}
    </div>
  );
  return (
    <section className={`${flush ? cardFlush : card} ${className}`}>
      {head}
      {children}
    </section>
  );
}

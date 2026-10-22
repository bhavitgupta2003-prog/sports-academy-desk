"use client";
import { DASHBOARD_PERIODS, type DashboardPeriod } from "@/lib/dashboard";

// One selector that controls every "in this period" number on the dashboard.
export default function PeriodSelect({ value, onChange }: { value: DashboardPeriod; onChange: (p: DashboardPeriod) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dashboard-period" className="text-sm font-medium text-slate-700">
        Period
      </label>
      <select
        id="dashboard-period"
        value={value}
        onChange={(e) => onChange(e.target.value as DashboardPeriod)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25"
      >
        {DASHBOARD_PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";
import { useState } from "react";
import { button, card } from "@/lib/ui";
import { rupees } from "@/lib/fees";
import type { Digest } from "@/lib/digest";

type Out = {
  result: {
    headline: string;
    observations: string[];
    follow_ups: { who: string; action: string; reason: string; priority: string; verified: boolean }[];
  };
  facts: Digest;
};

const badge: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function AiSummaryPage() {
  const [out, setOut] = useState<Out | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setOut(null);
    try {
      const res = await fetch("/api/summary", { method: "POST" });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else setOut(data);
    } catch {
      setError("Could not get a summary. Check your internet connection, or sign in again if your session expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">AI Summary</h1>
      <p className="text-sm text-slate-600">
        Reads the last 30 days of attendance and fee balances and suggests follow-ups. It only suggests; nothing is sent or changed.
      </p>
      <button className={button} onClick={generate} disabled={loading}>
        {loading ? "Reading your records…" : "Generate summary"}
      </button>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {out && (
        <>
          <div className={card}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              AI suggestions. Check before acting. Based on {out.facts.totals.students} student(s), last {out.facts.windowDays} days.
            </p>
            <h2 className="text-lg font-semibold">{out.result.headline}</h2>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {out.result.observations.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>

          <div className={card}>
            <h2 className="mb-2 font-medium">Follow-up actions</h2>
            {out.result.follow_ups.length === 0 && <p className="text-sm text-slate-500">No follow-ups suggested.</p>}
            <ul className="divide-y">
              {out.result.follow_ups.map((f, i) => (
                <li key={i} className="py-2 text-sm">
                  <span className={`mr-2 rounded px-2 py-0.5 text-xs ${badge[f.priority] ?? badge.medium}`}>{f.priority}</span>
                  <span className="font-medium">{f.who}</span>: {f.action}
                  <p className="text-slate-500">Why: {f.reason}</p>
                  {!f.verified && (
                    <p className="text-amber-700">Could not verify “{f.who}” against your records. Check this one yourself.</p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className={card + " overflow-x-auto"}>
            <h2 className="mb-2 font-medium">Facts used (from your records, not from the AI)</h2>
            <p className="mb-2 text-sm text-slate-600">Total outstanding: {rupees(out.facts.totals.totalOutstanding)}</p>
            <table className="w-full text-left text-sm">
              <thead className="border-b text-slate-600">
                <tr><th className="py-1">Student</th><th>Batch</th><th>Present / sessions</th><th>Attendance</th><th>Outstanding</th><th>Months overdue</th></tr>
              </thead>
              <tbody>
                {out.facts.students.map((s) => (
                  <tr key={s.label + s.batch} className="border-b last:border-0">
                    <td className="py-1">{s.label}</td>
                    <td>{s.batch}</td>
                    <td>{s.present} / {s.sessions}</td>
                    <td>{s.attendancePct === null ? "—" : `${s.attendancePct}%`}</td>
                    <td>{rupees(s.outstanding)}</td>
                    <td>{s.monthsOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { button, td, th } from "@/lib/ui";
import Card from "@/components/ui/Card";
import Icon, { type IconName } from "@/components/ui/Icon";
import LoadingState, { ButtonSpinner } from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";
import { rupees } from "@/lib/fees";
import type { Digest } from "@/lib/digest";
import { SESSION_EXPIRED_URL } from "@/lib/session";

type Out = {
  result: {
    headline: string;
    observations: string[];
    follow_ups: { who: string; action: string; reason: string; priority: string; verified: boolean }[];
  };
  facts: Digest;
};

// Priority shown as a word plus an icon, never colour alone.
const priority: Record<string, { text: string; icon: IconName; cls: string }> = {
  high: { text: "High priority", icon: "alert", cls: "border-red-200 bg-red-50 text-red-900" },
  medium: { text: "Medium priority", icon: "clock", cls: "border-amber-300 bg-amber-50 text-amber-900" },
  low: { text: "Low priority", icon: "info", cls: "border-slate-200 bg-slate-50 text-slate-700" },
};

export default function AiSummaryPage() {
  const router = useRouter();
  const [out, setOut] = useState<Out | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setOut(null);
    try {
      const res = await fetch("/api/summary", { method: "POST" });
      // Logged out: the server either answers 401 or redirects us to the login page.
      if (res.status === 401 || (res.redirected && new URL(res.url).pathname === "/login")) {
        router.replace(SESSION_EXPIRED_URL);
        return;
      }
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
    <div className="max-w-4xl">
      <PageHeader
        title="AI Summary"
        description="Reads the last 30 days of attendance and fee balances and suggests follow-ups. It only suggests; nothing is sent or changed."
        actions={
          <button className={button} onClick={generate} disabled={loading}>
            {loading ? <ButtonSpinner /> : <Icon name="sparkles" className="h-4 w-4" />}
            {loading ? "Reading your records…" : "Generate summary"}
          </button>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}
      {loading && <LoadingState label="Reading your records and writing the summary. This can take up to 30 seconds." />}

      {!out && !error && !loading && (
        <Card>
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-800">
              <Icon name="sparkles" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-slate-900">Get a summary of your academy</h2>
            <p className="mt-1 max-w-md text-sm text-slate-600">
              Click Generate summary to see what needs attention this week. It needs at least one student and some attendance from the last 30 days.
            </p>
          </div>
        </Card>
      )}

      {out && (
        <div className="space-y-6">
          <Card>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              <Icon name="sparkles" className="h-3.5 w-3.5" />
              AI suggestions. Check before acting.
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{out.result.headline}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {out.result.observations.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Based on {out.facts.totals.students} student{out.facts.totals.students === 1 ? "" : "s"}, last {out.facts.windowDays} days.
            </p>
          </Card>

          <Card title="Follow-up actions" description="Suggestions for staff, most urgent first.">
            {out.result.follow_ups.length === 0 && <p className="text-sm text-slate-600">No follow-ups suggested.</p>}
            <ul className="divide-y divide-slate-100">
              {out.result.follow_ups.map((f, i) => {
                const pr = priority[f.priority] ?? priority.medium;
                return (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${pr.cls}`}>
                        <Icon name={pr.icon} className="h-3.5 w-3.5" />
                        {pr.text}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{f.who}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-800">{f.action}</p>
                    <p className="mt-0.5 text-sm text-slate-600">Why: {f.reason}</p>
                    {!f.verified && (
                      <Notice tone="warning" className="mt-2">
                        Could not verify “{f.who}” against your records. Check this one yourself.
                      </Notice>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card flush title="Facts used" description="These numbers come from your records, not from the AI.">
            <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-700">
              Total outstanding: <span className="font-semibold tabular-nums text-slate-900">{rupees(out.facts.totals.totalOutstanding)}</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Attendance and fee facts for each student</caption>
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th scope="col" className={th}>Student</th>
                    <th scope="col" className={th}>Batch</th>
                    <th scope="col" className={th + " text-right"}>Present / sessions</th>
                    <th scope="col" className={th + " text-right"}>Attendance</th>
                    <th scope="col" className={th + " text-right"}>Outstanding</th>
                    <th scope="col" className={th + " text-right"}>Months overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {out.facts.students.map((s) => (
                    <tr key={s.label + s.batch}>
                      <td className={td + " font-medium text-slate-900"}>{s.label}</td>
                      <td className={td + " text-slate-700"}>{s.batch}</td>
                      <td className={td + " text-right tabular-nums text-slate-700"}>{s.present} / {s.sessions}</td>
                      <td className={td + " text-right tabular-nums text-slate-700"}>{s.attendancePct === null ? "—" : `${s.attendancePct}%`}</td>
                      <td className={td + " text-right tabular-nums text-slate-900"}>{rupees(s.outstanding)}</td>
                      <td className={td + " text-right tabular-nums text-slate-700"}>{s.monthsOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

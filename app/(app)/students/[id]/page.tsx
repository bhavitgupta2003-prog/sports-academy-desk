"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ErrorBox from "@/components/ErrorBox";
import { button, input, td, th } from "@/lib/ui";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import LoadingState, { ButtonSpinner } from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import FeeStatusBadge from "@/components/FeeStatusBadge";
import { feeStatus, isValidDate, monthsBilled, outstanding, rupees, todayString } from "@/lib/fees";
import { validateRecordDate } from "@/lib/validation";
import { useSessionGuard } from "@/lib/useSessionGuard";

type Student = {
  id: string; name: string; coach: string; parent_name: string | null; parent_phone: string;
  monthly_fee: number; joined_on: string; batches: { name: string } | null;
};
type Att = { id: string; date: string; status: string };
type Pay = { id: string; amount: number; paid_on: string; note: string | null };

export default function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const guard = useSessionGuard();
  const [notFound, setNotFound] = useState(false);
  const [payNotice, setPayNotice] = useState("");
  const [backHref, setBackHref] = useState(""); // set when we arrived from the Attendance page
  const [student, setStudent] = useState<Student | null>(null);
  const [att, setAtt] = useState<Att[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [note, setNote] = useState("");
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const db = createClient();
    const [s, a, p] = await Promise.all([
      db.from("students").select("*,batches(name)").eq("id", id).single(),
      db.from("attendance").select("id,date,status").eq("student_id", id).order("date", { ascending: false }),
      db.from("fee_payments").select("id,amount,paid_on,note").eq("student_id", id).order("paid_on", { ascending: false }),
    ]);
    if (s.error?.code === "PGRST116") return setNotFound(true); // no student with this address
    if (s.error || a.error || p.error) {
      if (await guard(s.error ?? a.error ?? p.error)) return;
      return setError("Couldn't load this student. Please try again.");
    }
    setStudent(s.data as unknown as Student);
    setAtt(a.data);
    setPays(p.data);
  }, [id, guard]);

  useEffect(() => {
    setPaidOn(todayString());
    // Arrived from the Attendance page? Offer a way back to the same batch and date.
    const q = new URLSearchParams(window.location.search);
    if (q.get("from") === "attendance") {
      const back = new URLSearchParams();
      const batch = q.get("batch") ?? "";
      const date = q.get("date") ?? "";
      if (/^[0-9a-f-]{36}$/i.test(batch)) back.set("batch", batch);
      if (isValidDate(date)) back.set("date", date);
      setBackHref(back.toString() ? `/attendance?${back}` : "/attendance");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setPayNotice("");
    const amt = Number(amount);
    if (amount.trim() === "" || isNaN(amt) || amt <= 0) return setPayError("Enter an amount greater than 0.");
    const dateProblem = validateRecordDate(paidOn, todayString(), "payment");
    if (dateProblem) return setPayError(dateProblem);
    setBusy(true);
    setPayError("");
    const { error: err } = await createClient()
      .from("fee_payments")
      .insert({ student_id: id, amount: amt, paid_on: paidOn, note: note.trim() || null });
    setBusy(false);
    if (err) {
      // Keep what was typed so nothing has to be re-entered.
      if (await guard(err)) return;
      return setPayError("Could not save the payment. Nothing was recorded, and your details are still here. Please try again.");
    }
    setPayNotice(`Payment of ${rupees(amt)} recorded.`);
    setAmount("");
    setNote("");
    load();
  }

  const backLinks = (
    <span className="flex flex-wrap gap-x-5 gap-y-1">
      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 font-medium text-emerald-800 hover:underline">
          <Icon name="arrowLeft" className="h-4 w-4" />
          Back to attendance
        </Link>
      )}
      <Link href="/students" className="inline-flex items-center gap-1.5 font-medium text-emerald-800 hover:underline">
        <Icon name="arrowLeft" className="h-4 w-4" />
        All students
      </Link>
    </span>
  );

  if (notFound) {
    return (
      <div>
        <PageHeader title="Student not found" back={backLinks} />
        <Card>
          <EmptyState icon="users" title="This student could not be found">
            They may have been removed.
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Student" back={backLinks} />
        <ErrorBox message={error} onRetry={load} />
      </div>
    );
  }
  if (!student) {
    return (
      <div>
        <PageHeader title="Student" back={backLinks} />
        <LoadingState label="Loading student…" />
      </div>
    );
  }

  const fee = Number(student.monthly_fee);
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const today = todayString();
  const owed = outstanding(fee, student.joined_on, paid, today);
  const status = feeStatus(fee, student.joined_on, paid, today);
  const present = att.filter((a) => a.status === "present").length;

  return (
    <div>
      <PageHeader
        back={backLinks}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {student.name}
            <FeeStatusBadge status={status} />
          </span>
        }
        description={`${student.batches?.name ?? "No batch"} · Coach ${student.coach}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={owed < 0 ? "Paid ahead" : "Outstanding"}
          icon="rupee"
          tone={owed > 0 ? "bad" : "good"}
          value={rupees(owed < 0 ? -owed : owed)}
          hint={owed > 0 ? `Billed ${monthsBilled(student.joined_on, today)} month(s) × ${rupees(fee)}` : owed < 0 ? "More than has been billed so far" : "All paid up"}
        />
        <StatCard label="Paid so far" icon="checkCircle" value={rupees(paid)} hint={`${pays.length} payment${pays.length === 1 ? "" : "s"} recorded`} />
        <StatCard
          label="Attendance"
          icon="userCheck"
          value={att.length === 0 ? "—" : `${present} of ${att.length}`}
          hint={att.length === 0 ? "No attendance recorded yet" : "recorded sessions present"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Record a payment" description="Staff record payments by hand (cash, UPI and so on).">
            <form onSubmit={addPayment} noValidate className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Field label="Amount (Rs)" htmlFor="amount">
                  <input id="amount" className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Date" htmlFor="paid_on">
                  <input id="paid_on" className={input} type="date" max={todayString()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Note (cash / UPI…)" htmlFor="note">
                  <input id="note" className={input} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-6">
                <button className={button} disabled={busy}>
                  {busy && <ButtonSpinner />}
                  {busy ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
            {payError && <Notice tone="error" className="mt-4">{payError}</Notice>}
            {payNotice && <Notice tone="success" className="mt-4">{payNotice}</Notice>}
          </Card>

          <Card flush title="Payment history">
            {pays.length === 0 ? (
              <EmptyState icon="rupee" title="No payments recorded yet">
                Payments you record above will appear here.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Payments recorded for {student.name}</caption>
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th scope="col" className={th}>Date</th>
                      <th scope="col" className={th}>Note</th>
                      <th scope="col" className={th + " text-right"}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pays.map((p) => (
                      <tr key={p.id}>
                        <td className={td + " tabular-nums text-slate-700"}>{p.paid_on}</td>
                        <td className={td + " text-slate-700"}>{p.note || "—"}</td>
                        <td className={td + " text-right font-medium tabular-nums text-slate-900"}>{rupees(Number(p.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Student details">
            <dl className="space-y-3 text-sm">
              {[
                ["Batch", student.batches?.name ?? "—"],
                ["Coach", student.coach],
                ["Parent", student.parent_name || "—"],
                ["Parent phone", student.parent_phone],
                ["Monthly fee", rupees(fee)],
                ["Joined", student.joined_on],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-600">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card flush title="Attendance history">
            {att.length === 0 ? (
              <EmptyState icon="calendarCheck" title="No attendance recorded yet">
                Mark attendance from the Attendance page.
              </EmptyState>
            ) : (
              <>
                <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
                  Present {present} of {att.length} recorded sessions.
                </p>
                <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
                  {att.map((a) => (
                    <li key={a.id} className="flex items-center justify-between px-5 py-2.5">
                      <span className="tabular-nums text-slate-700">{a.date}</span>
                      <span className={`inline-flex items-center gap-1.5 font-medium capitalize ${a.status === "present" ? "text-emerald-800" : "text-red-800"}`}>
                        <Icon name={a.status === "present" ? "checkCircle" : "xCircle"} className="h-4 w-4" />
                        {a.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

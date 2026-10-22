"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ErrorBox from "@/components/ErrorBox";
import { button, card, errorText, input, label } from "@/lib/ui";
import { monthsBilled, outstanding, rupees, todayString } from "@/lib/fees";

type Student = {
  id: string; name: string; coach: string; parent_name: string | null; parent_phone: string;
  monthly_fee: number; joined_on: string; batches: { name: string } | null;
};
type Att = { id: string; date: string; status: string };
type Pay = { id: string; amount: number; paid_on: string; note: string | null };

export default function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
    if (s.error || a.error || p.error) return setError("Couldn't load this student. Please try again.");
    setStudent(s.data as unknown as Student);
    setAtt(a.data);
    setPays(p.data);
  }, [id]);

  useEffect(() => {
    setPaidOn(todayString());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (amount.trim() === "" || isNaN(amt) || amt <= 0) return setPayError("Enter an amount greater than 0.");
    if (!paidOn) return setPayError("Choose the payment date.");
    setBusy(true);
    setPayError("");
    const { error: err } = await createClient()
      .from("fee_payments")
      .insert({ student_id: id, amount: amt, paid_on: paidOn, note: note.trim() || null });
    setBusy(false);
    if (err) return setPayError("Could not save the payment. Please try again.");
    setAmount("");
    setNote("");
    load();
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!student) return <p className="text-sm text-slate-500">Loading…</p>;

  const fee = Number(student.monthly_fee);
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const today = todayString();
  const owed = outstanding(fee, student.joined_on, paid, today);
  const present = att.filter((a) => a.status === "present").length;

  return (
    <div className="space-y-4">
      <Link href="/students" className="text-sm text-emerald-700 underline">
        ← All students
      </Link>
      <h1 className="text-xl font-semibold">{student.name}</h1>

      <div className={card}>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Batch</dt><dd>{student.batches?.name}</dd></div>
          <div><dt className="text-slate-500">Coach</dt><dd>{student.coach}</dd></div>
          <div><dt className="text-slate-500">Parent</dt><dd>{student.parent_name || "—"}</dd></div>
          <div><dt className="text-slate-500">Parent phone</dt><dd>{student.parent_phone}</dd></div>
          <div><dt className="text-slate-500">Monthly fee</dt><dd>{rupees(fee)}</dd></div>
          <div><dt className="text-slate-500">Joined</dt><dd>{student.joined_on}</dd></div>
        </dl>
      </div>

      <div className={card}>
        <h2 className="mb-2 font-medium">Fees</h2>
        <p className="text-sm text-slate-600">
          Billed {monthsBilled(student.joined_on, today)} month(s) × {rupees(fee)}; paid {rupees(paid)}.
        </p>
        <p className={`mt-1 text-lg font-semibold ${owed > 0 ? "text-red-600" : "text-emerald-700"}`}>
          {owed > 0 ? `Outstanding: ${rupees(owed)}` : owed < 0 ? `Paid ahead: ${rupees(-owed)}` : "All paid up"}
        </p>
        <form onSubmit={addPayment} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className={label}>Amount (Rs)</label>
            <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className={label}>Date</label>
            <input className={input} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div>
            <label className={label}>Note (cash / UPI…)</label>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className={button} disabled={busy}>Record payment</button>
          </div>
        </form>
        {payError && <p className={errorText}>{payError}</p>}
        {pays.length > 0 && (
          <ul className="mt-4 divide-y text-sm">
            {pays.map((p) => (
              <li key={p.id} className="flex justify-between py-1.5">
                <span>{p.paid_on}{p.note ? ` · ${p.note}` : ""}</span>
                <span>{rupees(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-2 font-medium">Attendance</h2>
        {att.length === 0 ? (
          <p className="text-sm text-slate-500">No attendance recorded yet.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-600">
              Present {present} of {att.length} recorded sessions.
            </p>
            <ul className="divide-y text-sm">
              {att.map((a) => (
                <li key={a.id} className="flex justify-between py-1.5">
                  <span>{a.date}</span>
                  <span className={a.status === "present" ? "text-emerald-700" : "text-red-600"}>{a.status}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

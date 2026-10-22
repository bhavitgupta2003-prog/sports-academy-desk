"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayString } from "@/lib/fees";
import { formatTime, isMissingTableError, shortDate, validateEvent, whenText, type EventRow } from "@/lib/events";
import { EVENTS_SETUP_SQL } from "@/lib/eventsSetupSql";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { button, buttonLight, input } from "@/lib/ui";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorBox from "@/components/ErrorBox";
import Field from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import LoadingState, { ButtonSpinner } from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";
import { useNotifications } from "@/components/NotificationsProvider";

type Batch = { id: string; name: string };
const blank = { title: "", date: "", time: "", batch_id: "", location: "", notes: "" };

function EventLine({ e, today, onDelete, confirming, setConfirming, busy }: {
  e: EventRow; today: string; onDelete: (id: string) => void; confirming: boolean; setConfirming: (id: string | null) => void; busy: boolean;
}) {
  const meta = [formatTime(e.event_time), e.location, e.batches?.name ?? "All batches"].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-center leading-tight">
        <span className="text-[11px] font-medium uppercase text-slate-500">{shortDate(e.event_date).split(" ")[1]}</span>
        <span className="text-base font-semibold text-slate-900 tabular-nums">{shortDate(e.event_date).split(" ")[0]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{e.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">
          {whenText(e.event_date, today)}
          {meta ? ` · ${meta}` : ""}
        </p>
        {e.notes && <p className="mt-1 text-sm text-slate-600">{e.notes}</p>}
      </div>
      <div className="shrink-0">
        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-slate-700">Delete this event?</span>
            <button onClick={() => onDelete(e.id)} disabled={busy} className="rounded-md bg-red-700 px-2.5 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-60">
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirming(null)} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirming(e.id)} aria-label={`Delete event: ${e.title}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="trash" className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

export default function EventsPage() {
  const guard = useSessionGuard();
  const { refresh } = useNotifications();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false); // the events table has not been created yet
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [today, setToday] = useState("");
  const [copied, setCopied] = useState<"" | "yes" | "failed">("");
  const [checking, setChecking] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const db = createClient();
    const [e, b] = await Promise.all([
      db.from("events").select("id,title,event_date,event_time,location,notes,batch_id,batches(name)").order("event_date").order("event_time").limit(500),
      db.from("batches").select("id,name").order("name"),
    ]);
    if (e.error && isMissingTableError(e.error)) {
      setMissing(true);
      setEvents([]);
      return;
    }
    if (e.error || b.error) {
      if (await guard(e.error ?? b.error)) return;
      return setError("Couldn't load events. Please try again.");
    }
    setMissing(false);
    setEvents(e.data as unknown as EventRow[]);
    setBatches(b.data);
  }, [guard]);

  useEffect(() => {
    setToday(todayString());
    load();
  }, [load]);

  const set = (k: keyof typeof blank) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: ev.target.value }));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setNotice("");
    setSaveError("");
    const errs = validateEvent({ title: f.title, date: f.date, time: f.time, location: f.location, notes: f.notes }, todayString());
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { error: err } = await createClient().from("events").insert({
      title: f.title.trim(),
      event_date: f.date,
      event_time: f.time || null,
      batch_id: f.batch_id || null,
      location: f.location.trim() || null,
      notes: f.notes.trim() || null,
    });
    setBusy(false);
    if (err) {
      if (await guard(err)) return;
      return setSaveError("Could not save the event. Nothing was saved, and what you typed is still here. Please try again.");
    }
    setF(blank);
    setNotice("Event added.");
    load();
    refresh(); // so the dashboard and notifications pick it up
  }

  async function remove(id: string) {
    setDeleting(true);
    setNotice("");
    setSaveError("");
    const { error: err } = await createClient().from("events").delete().eq("id", id);
    setDeleting(false);
    if (err) {
      if (await guard(err)) return;
      setConfirming(null);
      return setSaveError("Could not delete the event. Please try again.");
    }
    setConfirming(null);
    setNotice("Event deleted.");
    load();
    refresh();
  }

  // Link straight to this project's SQL Editor (the project address is public configuration).
  const projectRef = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0] || "";
    } catch {
      return "";
    }
  })();
  const sqlEditorUrl = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : "https://supabase.com/dashboard";

  async function copySql() {
    try {
      await navigator.clipboard.writeText(EVENTS_SETUP_SQL);
      setCopied("yes");
    } catch {
      setCopied("failed");
      setShowSql(true); // let them select and copy it by hand
    }
  }
  async function checkAgain() {
    setChecking(true);
    await load();
    setChecking(false);
  }

  const upcoming = (events ?? []).filter((e) => e.event_date >= today);
  const past = (events ?? []).filter((e) => e.event_date < today).reverse().slice(0, 10);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Events" description="Matches, trials, sports days and meetings. Events in the next 7 days appear in Notifications, and the next few show on the Dashboard." />

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && events === null && <LoadingState label="Loading events…" />}

      {missing && (
        <Card title="One-time setup needed" description="Events need one new table in your database. Everything else in the app works as normal.">
          <ol className="space-y-4 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white">1</span>
              <div>
                <p className="font-medium text-slate-900">Copy the setup SQL</p>
                <p className="mt-0.5 text-slate-600">It only creates the events table. It does not touch your students, attendance or payments.</p>
                <button onClick={copySql} className={buttonLight + " mt-2"}>
                  <Icon name={copied === "yes" ? "checkCircle" : "refresh"} className="h-4 w-4" />
                  {copied === "yes" ? "Copied. Now go to step 2" : "Copy setup SQL"}
                </button>
                {copied === "failed" && <p role="alert" className="mt-2 text-red-800">Couldn&apos;t copy automatically. Select the text below and copy it yourself.</p>}
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white">2</span>
              <div>
                <p className="font-medium text-slate-900">Open the Supabase SQL Editor and run it</p>
                <p className="mt-0.5 text-slate-600">Click <strong>New query</strong>, paste with <strong>Cmd + V</strong> (Ctrl + V on Windows), then click <strong>Run</strong>. You should see &quot;Success&quot;.</p>
                <a href={sqlEditorUrl} target="_blank" rel="noopener noreferrer" className={buttonLight + " mt-2"}>
                  Open SQL Editor
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white">3</span>
              <div>
                <p className="font-medium text-slate-900">Come back and check</p>
                <button onClick={checkAgain} disabled={checking} className={button + " mt-2"}>
                  {checking && <ButtonSpinner />}
                  {checking ? "Checking…" : "Check again"}
                </button>
                <p className="mt-2 text-slate-600">If this page still shows the setup card, the SQL has not run yet.</p>
              </div>
            </li>
          </ol>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <button onClick={() => setShowSql((v) => !v)} aria-expanded={showSql} className="text-sm font-medium text-slate-700 hover:underline">
              {showSql ? "Hide" : "Show"} the SQL
            </button>
            {showSql && <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{EVENTS_SETUP_SQL}</pre>}
          </div>
        </Card>
      )}

      {events !== null && !missing && !error && (
        <div className="space-y-6">
          <Card title="Add an event">
            <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Title" htmlFor="ev-title" error={errors.title}>
                  <input id="ev-title" className={input} value={f.title} onChange={set("title")} placeholder="e.g. Inter-academy match" aria-invalid={!!errors.title} />
                </Field>
              </div>
              <Field label="Date" htmlFor="ev-date" error={errors.date}>
                <input id="ev-date" type="date" min={today || undefined} className={input} value={f.date} onChange={set("date")} aria-invalid={!!errors.date} />
              </Field>
              <Field label="Time (optional)" htmlFor="ev-time" error={errors.time}>
                <input id="ev-time" type="time" className={input} value={f.time} onChange={set("time")} aria-invalid={!!errors.time} />
              </Field>
              <Field label="Batch (optional)" htmlFor="ev-batch" hint="Leave as All batches if it is for everyone.">
                <select id="ev-batch" className={input} value={f.batch_id} onChange={set("batch_id")}>
                  <option value="">All batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Place (optional)" htmlFor="ev-location" error={errors.location}>
                <input id="ev-location" className={input} value={f.location} onChange={set("location")} aria-invalid={!!errors.location} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes (optional)" htmlFor="ev-notes" error={errors.notes}>
                  <textarea id="ev-notes" rows={2} className={input} value={f.notes} onChange={set("notes")} aria-invalid={!!errors.notes} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <button className={button} disabled={busy}>
                  {busy && <ButtonSpinner />}
                  {busy ? "Saving…" : "Add event"}
                </button>
              </div>
            </form>
            {saveError && <Notice tone="error" className="mt-4">{saveError}</Notice>}
            {notice && <Notice tone="success" className="mt-4">{notice}</Notice>}
          </Card>

          <Card flush title="Upcoming events">
            {upcoming.length === 0 ? (
              <EmptyState icon="calendar" title="No upcoming events">
                Add an event above and it will show here, on the Dashboard, and in Notifications when it is within 7 days.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((e) => (
                  <EventLine key={e.id} e={e} today={today} onDelete={remove} confirming={confirming === e.id} setConfirming={setConfirming} busy={deleting} />
                ))}
              </ul>
            )}
          </Card>

          {past.length > 0 && (
            <Card flush title="Recent past events" description="The last 10.">
              <ul className="divide-y divide-slate-100">
                {past.map((e) => (
                  <EventLine key={e.id} e={e} today={today} onDelete={remove} confirming={confirming === e.id} setConfirming={setConfirming} busy={deleting} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}


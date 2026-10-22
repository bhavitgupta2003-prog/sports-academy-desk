"use client";
import { useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/components/NotificationsProvider";
import type { NotificationItem, NotificationKind, Severity } from "@/lib/notifications";
import { buttonLight } from "@/lib/ui";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorBox from "@/components/ErrorBox";
import Icon, { type IconName } from "@/components/ui/Icon";
import LoadingState from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";

type Filter = "all" | "fees" | "attendance" | "events";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fees", label: "Fees" },
  { key: "attendance", label: "Attendance" },
  { key: "events", label: "Events" },
];
const inFilter = (kind: NotificationKind, f: Filter) =>
  f === "all" || (f === "fees" && (kind === "fee_overdue" || kind === "fee_due_soon")) || (f === "attendance" && kind === "low_attendance") || (f === "events" && kind === "event");

const KIND_ICON: Record<NotificationKind, { icon: IconName; cls: string }> = {
  fee_overdue: { icon: "alert", cls: "bg-red-50 text-red-800" },
  fee_due_soon: { icon: "clock", cls: "bg-amber-50 text-amber-800" },
  low_attendance: { icon: "calendarCheck", cls: "bg-amber-50 text-amber-800" },
  event: { icon: "calendar", cls: "bg-emerald-50 text-emerald-800" },
};
// A word as well as a colour, so priority never relies on colour alone.
const SEVERITY: Record<Severity, { text: string; cls: string }> = {
  high: { text: "Action needed", cls: "border-red-200 bg-red-50 text-red-900" },
  medium: { text: "Heads up", cls: "border-amber-300 bg-amber-50 text-amber-900" },
  info: { text: "Coming up", cls: "border-slate-200 bg-slate-50 text-slate-700" },
};

function Row({ item, action }: { item: NotificationItem; action: React.ReactNode }) {
  const k = KIND_ICON[item.kind];
  const sev = SEVERITY[item.severity];
  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.cls}`}>
        <Icon name={k.icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${sev.cls}`}>{sev.text}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-600">{item.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={item.href} className="text-sm font-medium text-emerald-800 hover:underline">
          {item.actionLabel}
        </Link>
        {action}
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  const { loading, error, visible, dismissedItems, eventsState, refresh, dismiss, restore, restoreAll } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [showDismissed, setShowDismissed] = useState(false);

  const shown = visible.filter((i) => inFilter(i.kind, filter));
  const countFor = (f: Filter) => visible.filter((i) => inFilter(i.kind, f)).length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Notifications"
        description="Worked out from your students, payments, attendance and events each time you open the app. Dismiss one to hide it; it comes back if the situation changes."
        actions={
          <button className={buttonLight} onClick={refresh} disabled={loading}>
            <Icon name="refresh" className="h-4 w-4" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error && <ErrorBox message={error} onRetry={refresh} />}
      {!error && loading && visible.length === 0 && dismissedItems.length === 0 && <LoadingState label="Checking your records…" />}

      {eventsState === "missing" && (
        <Notice tone="info" className="mb-4">
          Event notifications are switched off until the one-time Events setup is done. Open the Events page to see how.
        </Notice>
      )}
      {eventsState === "error" && (
        <Notice tone="warning" className="mb-4">
          Events couldn&apos;t be loaded just now, so event notifications are missing. Try Refresh.
        </Notice>
      )}

      {!error && !(loading && visible.length === 0 && dismissedItems.length === 0) && (
        <>
          <div role="group" aria-label="Filter notifications" className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  filter === f.key ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {f.label} <span className="tabular-nums">({countFor(f.key)})</span>
              </button>
            ))}
          </div>

          <Card flush>
            {shown.length === 0 ? (
              <EmptyState icon="checkCircle" title={visible.length === 0 ? "You're all caught up" : "Nothing in this group"}>
                {visible.length === 0
                  ? "No fees are due or overdue, no one has low attendance, and no events are coming up this week."
                  : "Try another group above."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {shown.map((i) => (
                  <Row
                    key={i.id}
                    item={i}
                    action={
                      <button onClick={() => dismiss(i.id)} aria-label={`Dismiss: ${i.title}`} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                        Dismiss
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </Card>

          {dismissedItems.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed} className="text-sm font-medium text-slate-700 hover:underline">
                {showDismissed ? "Hide" : "Show"} dismissed ({dismissedItems.length})
              </button>
              {showDismissed && (
                <div className="mt-3">
                  <Card flush title="Dismissed" actions={<button onClick={restoreAll} className="text-sm font-medium text-emerald-800 hover:underline">Restore all</button>}>
                    <ul className="divide-y divide-slate-100">
                      {dismissedItems.map((i) => (
                        <Row
                          key={i.id}
                          item={i}
                          action={
                            <button onClick={() => restore(i.id)} aria-label={`Restore: ${i.title}`} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                              Restore
                            </button>
                          }
                        />
                      ))}
                    </ul>
                  </Card>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">Dismissals are remembered in this browser only.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

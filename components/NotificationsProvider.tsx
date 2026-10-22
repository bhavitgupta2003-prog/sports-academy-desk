"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayString } from "@/lib/fees";
import { fetchAll } from "@/lib/fetchAll";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { buildRows, type PaymentRow, type StudentRow } from "@/lib/studentList";
import type { AttendanceMark } from "@/lib/dashboard";
import { isMissingTableError, type EventRow } from "@/lib/events";
import { attendanceWindowStart, buildNotifications, type NotificationItem } from "@/lib/notifications";

type EventsState = "ok" | "missing" | "error";

type Ctx = {
  today: string;
  loading: boolean;
  error: string;
  visible: NotificationItem[]; // not dismissed
  dismissedItems: NotificationItem[];
  events: EventRow[]; // upcoming events (the next few weeks)
  eventsState: EventsState;
  unreadCount: number;
  refresh: () => void;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  restoreAll: () => void;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}

const STALE_MS = 60_000; // reload at most once a minute when you move between pages or come back to the tab
const storageKey = (userId: string) => `sad-dismissed-notifications:${userId}`;

// Dismissed ids are remembered in this browser only (per account). Every access is guarded: storage can be blocked.
function readDismissed(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeDismissed(userId: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
  } catch {
    // storage unavailable: dismissals just won't be remembered
  }
}

// Works out the notifications from your real records and shares them with the menu, the Notifications page and the dashboard.
export default function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const guard = useSessionGuard();
  const pathname = usePathname();
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsState, setEventsState] = useState<EventsState>("ok");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const userId = useRef("");
  const lastLoaded = useRef(0);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError("");
    setLoading(true);
    const db = createClient();
    const day = todayString();
    const start = attendanceWindowStart(day);

    const [s, p, a, e] = await Promise.all([
      db.from("students").select("id,name,coach,monthly_fee,joined_on,batch_id,batches(name)"),
      fetchAll<PaymentRow>((from, to) => db.from("fee_payments").select("student_id,amount").order("id").range(from, to)),
      fetchAll<AttendanceMark>((from, to) => db.from("attendance").select("student_id,status,date").gte("date", start).lte("date", day).order("id").range(from, to)),
      db.from("events").select("id,title,event_date,event_time,location,notes,batch_id,batches(name)").gte("event_date", day).order("event_date").order("event_time").limit(30),
    ]);
    if (mine !== latest.current) return;

    if (s.error || p.error || a.error) {
      setLoading(false);
      if (await guard(s.error ?? p.error ?? a.error)) return;
      return setError("Couldn't load notifications. Please try again.");
    }

    // The events table is optional: if its one-time setup has not been done, everything else still works.
    let upcoming: EventRow[] = [];
    let eState: EventsState = "ok";
    if (e.error) {
      if (isMissingTableError(e.error)) eState = "missing";
      else {
        if (await guard(e.error)) return;
        eState = "error";
      }
    } else {
      upcoming = e.data as unknown as EventRow[];
    }

    if (!userId.current) {
      const { data } = await db.auth.getUser();
      userId.current = data.user?.id ?? "";
    }
    if (mine !== latest.current) return;

    const rows = buildRows(s.data as unknown as StudentRow[], p.data, day);
    const built = buildNotifications({ rows, marks: a.data, events: upcoming, today: day });
    const remembered = userId.current ? readDismissed(userId.current) : new Set<string>();
    // Forget dismissals for notifications that no longer exist, so the list cannot grow forever.
    const live = new Set(built.map((i) => i.id));
    const kept = new Set([...remembered].filter((id) => live.has(id)));
    if (userId.current && kept.size !== remembered.size) writeDismissed(userId.current, kept);

    setToday(day);
    setItems(built);
    setEvents(upcoming);
    setEventsState(eState);
    setDismissed(kept);
    setLoading(false);
    lastLoaded.current = Date.now();
  }, [guard]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload when you move to another page or return to the tab, but not more than once a minute.
  useEffect(() => {
    if (lastLoaded.current && Date.now() - lastLoaded.current > STALE_MS) load();
  }, [pathname, load]);
  useEffect(() => {
    const onFocus = () => {
      if (lastLoaded.current && Date.now() - lastLoaded.current > STALE_MS) load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const change = useCallback((fn: (s: Set<string>) => Set<string>) => {
    setDismissed((cur) => {
      const next = fn(new Set(cur));
      if (userId.current) writeDismissed(userId.current, next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => {
    const visible = items.filter((i) => !dismissed.has(i.id));
    return {
      today,
      loading,
      error,
      visible,
      dismissedItems: items.filter((i) => dismissed.has(i.id)),
      events,
      eventsState,
      unreadCount: visible.length,
      refresh: load,
      dismiss: (id) => change((s) => s.add(id)),
      restore: (id) => change((s) => (s.delete(id), s)),
      restoreAll: () => change(() => new Set()),
    };
  }, [items, dismissed, today, loading, error, events, eventsState, load, change]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** The small count next to "Notifications" in the menu. */
export function NavBadge() {
  const { unreadCount, loading } = useNotifications();
  if (loading || unreadCount === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
      {unreadCount > 99 ? "99+" : unreadCount}
      <span className="sr-only"> notifications</span>
    </span>
  );
}

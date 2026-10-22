"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SESSION_EXPIRED_URL } from "@/lib/session";
import Brand from "@/components/ui/Brand";
import Icon, { type IconName } from "@/components/ui/Icon";

const links: { href: string; text: string; icon: IconName }[] = [
  { href: "/dashboard", text: "Dashboard", icon: "dashboard" },
  { href: "/students", text: "Students", icon: "users" },
  { href: "/attendance", text: "Attendance", icon: "calendarCheck" },
  { href: "/ai-summary", text: "AI Summary", icon: "sparkles" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");

  const signingOut = useRef(false);

  // If Supabase drops the login while the app is open (e.g. it expired), go to /login with a message.
  // Clicking "Sign out" yourself does not trigger the expiry message.
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (session?.user.email) setEmail(session.user.email);
      if (event === "SIGNED_OUT" && !signingOut.current) router.replace(SESSION_EXPIRED_URL);
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function signOut() {
    signingOut.current = true;
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  const navLinks = (layout: "side" | "top") =>
    links.map((l) => {
      const active = isActive(l.href);
      return (
        <li key={l.href} className={layout === "top" ? "shrink-0" : ""}>
          <Link
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium focus-visible:outline-emerald-300 ${
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon name={l.icon} className="h-5 w-5" />
            {l.text}
            {layout === "side" && active && <span aria-hidden="true" className="ml-auto h-5 w-1 rounded-full bg-emerald-400" />}
          </Link>
        </li>
      );
    });

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Sidebar (laptop and larger) */}
      <aside className="hidden bg-navy-900 text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-5 py-6">
          <Brand />
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-2">
          <ul className="space-y-1">{navLinks("side")}</ul>
        </nav>
        <div className="border-t border-white/10 p-4">
          {email && (
            <p className="mb-3 truncate text-xs text-slate-300" title={email}>
              Signed in as
              <span className="block truncate text-sm text-white">{email}</span>
            </p>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white focus-visible:outline-emerald-300"
          >
            <Icon name="logout" className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Top bar (small screens) */}
      <div className="bg-navy-900 text-white md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white focus-visible:outline-emerald-300"
          >
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </button>
        </div>
        <nav aria-label="Main" className="overflow-x-auto px-2 pb-2">
          <ul className="flex gap-1">{navLinks("top")}</ul>
        </nav>
      </div>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

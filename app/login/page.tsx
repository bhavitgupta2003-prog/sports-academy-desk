"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { button, buttonLight, input } from "@/lib/ui";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/session";
import Brand from "@/components/ui/Brand";
import Field from "@/components/ui/Field";
import Icon, { type IconName } from "@/components/ui/Icon";
import Notice from "@/components/ui/Notice";
import { ButtonSpinner } from "@/components/ui/LoadingState";

const points: { icon: IconName; text: string }[] = [
  { icon: "users", text: "Students and batches in one list" },
  { icon: "calendarCheck", text: "Attendance marked batch by batch" },
  { icon: "rupee", text: "Fees, payments and balances" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reason") === "expired") setExpired(true);
  }, []);

  async function submit(mode: "in" | "up") {
    setMessage("");
    if (!email.trim() || password.length < 6) return setMessage("Enter your email and a password of at least 6 characters.");
    setBusy(true);
    try {
      const supabase = createClient();
      const res =
        mode === "in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (res.error) return setMessage(res.error.message);
      if (!res.data.session) return setMessage("Account created. Check your email to confirm it, then sign in.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Check your internet and the Supabase settings in .env.local.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:grid md:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden bg-navy-900 p-12 text-white md:flex md:flex-col md:justify-between">
        <Brand />
        <div>
          <p className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Run your academy from one desk.</p>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-slate-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <Icon name={p.icon} className="h-5 w-5 text-emerald-300" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-slate-400">Built for sports academy owners and coaches.</p>
      </div>

      {/* Form */}
      <main className="flex min-h-screen items-center justify-center px-4 py-10 md:min-h-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-slate-900 md:hidden">
            <Brand />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sports Academy Desk</h1>
          <p className="mt-1 mb-6 text-sm text-slate-600">Sign in with your staff account, or create one.</p>
          {expired && <Notice tone="warning" className="mb-4">{SESSION_EXPIRED_MESSAGE}</Notice>}
          <form
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              submit("in");
            }}
          >
            <Field label="Email" htmlFor="email">
              <input id="email" className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 6 characters.">
              <input id="password" className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {message && <Notice tone="error">{message}</Notice>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className={button + " flex-1"} disabled={busy}>
                {busy && <ButtonSpinner />}
                Sign in
              </button>
              <button type="button" className={buttonLight + " flex-1"} disabled={busy} onClick={() => submit("up")}>
                Create account
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { button, buttonLight, card, input, label } from "@/lib/ui";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/session";

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
      router.push("/students");
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Check your internet and the Supabase settings in .env.local.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-semibold">Sports Academy Desk</h1>
      <p className="mb-6 text-sm text-slate-600">Sign in with your staff account, or create one.</p>
      {expired && (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {SESSION_EXPIRED_MESSAGE}
        </p>
      )}
      <form
        className={card + " space-y-4"}
        onSubmit={(e) => {
          e.preventDefault();
          submit("in");
        }}
      >
        <div>
          <label className={label}>Email</label>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={label}>Password</label>
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <div className="flex gap-2">
          <button className={button} disabled={busy}>Sign in</button>
          <button type="button" className={buttonLight} disabled={busy} onClick={() => submit("up")}>
            Create account
          </button>
        </div>
      </form>
    </main>
  );
}

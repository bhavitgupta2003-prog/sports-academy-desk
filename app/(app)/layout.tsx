"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/students", text: "Students" },
  { href: "/attendance", text: "Attendance" },
  { href: "/ai-summary", text: "AI Summary" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row">
      <nav className="md:w-44 md:shrink-0">
        <p className="mb-4 text-lg font-semibold">Sports Academy Desk</p>
        <ul className="flex gap-2 md:flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`block rounded-md px-3 py-2 text-sm ${
                  path.startsWith(l.href) ? "bg-emerald-600 text-white" : "hover:bg-slate-200"
                }`}
              >
                {l.text}
              </Link>
            </li>
          ))}
        </ul>
        <button onClick={signOut} className="mt-4 px-3 text-sm text-slate-500 underline">
          Sign out
        </button>
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

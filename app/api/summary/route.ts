import { createClient } from "@/lib/supabase/server";
import { buildDigest, type Digest } from "@/lib/digest";
import { addDays, todayString } from "@/lib/fees";
import { createCooldown } from "@/lib/cooldown";
import { fetchAll } from "@/lib/fetchAll";
import { bodyTooLarge, isSameOrigin, MAX_BODY_BYTES } from "@/lib/apiGuard";

const WINDOW_DAYS = 30;
const MODEL = "google/gemini-3.7-flash";
const DEADLINE_MS = 28_000;

// One request at a time per user, then a short wait. See lib/cooldown.ts for its limits.
const cooldown = createCooldown();

const SYSTEM = `You assist the manager of a small sports academy.
Use ONLY the data in the user message. Do not calculate, estimate or invent any numbers or names.
Never promise refunds, discounts, fee waivers or dates; only suggest what staff should do.
Reply with JSON only, no other text, in exactly this shape:
{"headline": string, "observations": string[], "follow_ups": [{"who": string, "action": string, "reason": string, "priority": "high"|"medium"|"low"}]}
"who" must be a student label (e.g. "Aarav K.") or a batch name copied exactly from the data.
Give at most 6 follow_ups, most urgent first. Keep every sentence short and plain.`;

type Result = {
  headline: string;
  observations: string[];
  follow_ups: { who: string; action: string; reason: string; priority: string }[];
};

function fail(error: string, status = 200) {
  return Response.json({ ok: false, error }, { status });
}

function parse(text: string): Result | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const r = JSON.parse(text.slice(start, end + 1));
    if (typeof r.headline !== "string" || !Array.isArray(r.observations) || !Array.isArray(r.follow_ups)) return null;
    return {
      headline: r.headline,
      observations: r.observations.map(String),
      follow_ups: r.follow_ups.map((f: Record<string, unknown>) => ({
        who: String(f.who ?? ""),
        action: String(f.action ?? ""),
        reason: String(f.reason ?? ""),
        priority: String(f.priority ?? "medium"),
      })),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // 1. Only our own website may call this, and no unexpected input.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isSameOrigin(request.headers.get("origin"), host)) return fail("This request is not allowed.", 403);
  if (bodyTooLarge(request.headers.get("content-length"))) return fail("This request is not allowed.", 413);
  if ((await request.text()).length > MAX_BODY_BYTES) return fail("This request is not allowed.", 413);

  // 2. Who is asking? Checked here on the server, never trusted from the browser.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return fail("Your session has expired. Please sign in again.", 401);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.startsWith("PASTE_")) {
    console.error("[summary] OPENROUTER_API_KEY is not set on the server");
    return fail("The AI summary isn't set up on the server yet. Please tell the app owner.");
  }

  let gateStarted = false;
  try {
    // 3. Read ONLY this account's records (the owner_id filter backs up the database's own rules).
    const today = todayString();
    const sinceStr = addDays(today, -(WINDOW_DAYS - 1));
    const [s, a, p] = await Promise.all([
      supabase.from("students").select("id,name,monthly_fee,joined_on,batches(name)").eq("owner_id", user.id),
      // Read in pages: a plain query is silently cut at 1,000 rows, which a busy academy would exceed.
      fetchAll<{ student_id: string; status: string }>((from, to) => supabase.from("attendance").select("student_id,status").eq("owner_id", user.id).gte("date", sinceStr).order("id").range(from, to)),
      fetchAll<{ student_id: string; amount: number }>((from, to) => supabase.from("fee_payments").select("student_id,amount").eq("owner_id", user.id).order("id").range(from, to)),
    ]);
    if (s.error || a.error || p.error) {
      const failed = (s.error ?? a.error ?? p.error) as { code?: string } | null;
      console.error("[summary] database read failed", failed?.code);
      return fail("Could not read your academy records. Please try again.");
    }

    if (s.data.length === 0) return fail("There are no students yet. Add a few students first, then generate the summary.");
    if (a.data.length === 0) return fail("No attendance has been marked in the last 30 days. Mark attendance for at least one batch first.");

    const digest: Digest = buildDigest(s.data as never, a.data, p.data, today, WINDOW_DAYS);

    // 4. Prevent accidental rapid repeats (only counted once real work is about to start).
    const gate = cooldown.tryStart(user.id);
    if (!gate.ok) {
      const res = fail(`Please wait ${gate.retryAfterSec} second(s) before generating another summary.`, 429);
      res.headers.set("Retry-After", String(gate.retryAfterSec));
      return res;
    }
    gateStarted = true;

    // 5. Every call goes through OpenRouter, served only by Google's own infrastructure.
    const deadline = Date.now() + DEADLINE_MS;
    let result: Result | null = null;
    try {
      for (let attempt = 0; attempt < 3 && !result; attempt++) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 4000,
            reasoning: { effort: "low" },
            response_format: { type: "json_object" },
            provider: { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: `Academy data (last ${WINDOW_DAYS} days):\n${JSON.stringify(digest)}` },
            ],
          }),
        });
        if (res.status === 401) {
          console.error("[summary] AI provider rejected the server key");
          return fail("The AI service rejected the server's key. Please tell the app owner.");
        }
        if (res.status === 402) {
          console.error("[summary] AI provider reports no credits");
          return fail("The AI service is out of credits. Please tell the app owner.");
        }
        if (res.status === 429 || res.status >= 500) {
          if (attempt < 2 && Date.now() < deadline - 3000) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          return fail("The AI service is busy right now. Wait a minute and try again.");
        }
        if (!res.ok) {
          console.error("[summary] AI provider error status", res.status);
          return fail("The AI request failed. Please try again.");
        }
        const data = await res.json();
        result = parse(String(data?.choices?.[0]?.message?.content ?? ""));
      }
    } catch (e) {
      const name = (e as { name?: string }).name ?? "";
      if (name === "TimeoutError" || name === "AbortError") return fail("The AI took too long to answer. Please try again.");
      console.error("[summary] AI request failed", name);
      return fail("The AI request failed. Check your internet connection and try again.");
    }
    if (!result) return fail("The AI sent a reply we could not read. Please try again. Your records below are still correct.");

    // Mark anything the AI names that is not in the records, so it is shown, not hidden.
    const known = [...digest.students.map((x) => x.label), ...digest.students.map((x) => x.batch)].map((x) => x.toLowerCase());
    const follow_ups = result.follow_ups.map((f) => ({ ...f, verified: known.includes(f.who.trim().toLowerCase()) }));

    return Response.json({ ok: true, result: { ...result, follow_ups }, facts: digest });
  } catch (e) {
    // Anything unexpected: log only the error's type (never its details) and show a plain message.
    console.error("[summary] unexpected failure", (e as { name?: string }).name);
    return fail("Something went wrong while making the summary. Please try again.");
  } finally {
    if (gateStarted) cooldown.finish(user.id);
  }
}

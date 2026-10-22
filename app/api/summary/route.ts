import { createClient } from "@/lib/supabase/server";
import { buildDigest, type Digest } from "@/lib/digest";
import { todayString } from "@/lib/fees";

const WINDOW_DAYS = 30;
const MODEL = "google/gemini-3.7-flash";
const DEADLINE_MS = 28_000;

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

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Your session has expired. Please sign in again.", 401);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.startsWith("PASTE_")) {
    return fail("The AI key is missing. Paste your OpenRouter key into .env.local (OPENROUTER_API_KEY) and restart the app.");
  }

  const today = todayString();
  const since = new Date();
  since.setDate(since.getDate() - (WINDOW_DAYS - 1));
  const sinceStr = todayString(since);

  const [s, a, p] = await Promise.all([
    supabase.from("students").select("id,name,monthly_fee,joined_on,batches(name)"),
    supabase.from("attendance").select("student_id,status").gte("date", sinceStr),
    supabase.from("fee_payments").select("student_id,amount"),
  ]);
  if (s.error || a.error || p.error) return fail("Could not read your academy records. Please try again.");

  if (s.data.length === 0) return fail("There are no students yet. Add a few students first, then generate the summary.");
  if (a.data.length === 0) return fail("No attendance has been marked in the last 30 days. Mark attendance for at least one batch first.");

  const digest: Digest = buildDigest(s.data as never, a.data, p.data, today, WINDOW_DAYS);

  // Every call goes through OpenRouter, served only by Google's own infrastructure.
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
      if (res.status === 401) return fail("The AI key was rejected. Check that OPENROUTER_API_KEY in .env.local is correct.");
      if (res.status === 402) return fail("Your OpenRouter account is out of credits. Add credits, then try again.");
      if (res.status === 429 || res.status >= 500) {
        if (attempt < 2 && Date.now() < deadline - 3000) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return fail("The AI service is busy right now. Wait a minute and try again.");
      }
      if (!res.ok) return fail("The AI request failed. Please try again.");
      const data = await res.json();
      result = parse(String(data?.choices?.[0]?.message?.content ?? ""));
    }
  } catch (e) {
    const name = (e as { name?: string }).name ?? "";
    if (name === "TimeoutError" || name === "AbortError") return fail("The AI took too long to answer. Please try again.");
    return fail("The AI request failed. Check your internet connection and try again.");
  }
  if (!result) return fail("The AI sent a reply we could not read. Please try again. Your records below are still correct.");

  // Mark anything the AI names that is not in the records, so it is shown, not hidden.
  const known = [...digest.students.map((x) => x.label), ...digest.students.map((x) => x.batch)].map((x) => x.toLowerCase());
  const follow_ups = result.follow_ups.map((f) => ({ ...f, verified: known.includes(f.who.trim().toLowerCase()) }));

  return Response.json({ ok: true, result: { ...result, follow_ups }, facts: digest });
}

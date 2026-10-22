import { createBrowserClient } from "@supabase/ssr";

// Used inside pages in the browser. Only the public URL + anon key are used;
// the database's Row Level Security decides what each login may see.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

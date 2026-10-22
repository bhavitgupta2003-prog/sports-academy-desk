"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SESSION_EXPIRED_URL, sessionIsGone } from "@/lib/session";

/**
 * Call the returned function with any failed Supabase result's error.
 * If the login has really expired it sends the user to /login and returns true
 * (stop what you were doing); otherwise it returns false and nothing happens.
 */
export function useSessionGuard() {
  const router = useRouter();
  return useCallback(
    async (err: unknown): Promise<boolean> => {
      const gone = await sessionIsGone(err, createClient());
      if (gone) router.replace(SESSION_EXPIRED_URL);
      return gone;
    },
    [router],
  );
}

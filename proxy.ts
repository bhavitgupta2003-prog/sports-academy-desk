import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every page: logged-out visitors are sent to /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  let loggedIn = false;
  let authServerUnreachable = false;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (list) => {
            list.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );
    const { data, error } = await supabase.auth.getUser();
    loggedIn = !!data.user;
    // A network problem is not an expired login: don't send people to /login for it.
    authServerUnreachable = !loggedIn && error?.name === "AuthRetryableFetchError";
  } catch (e) {
    loggedIn = false; // e.g. Supabase not configured yet
    authServerUnreachable = e instanceof TypeError; // fetch failed
  }

  const onLogin = request.nextUrl.pathname === "/login";
  if (!loggedIn && !onLogin && !authServerUnreachable) {
    // A leftover Supabase cookie means the person WAS signed in, so their session expired.
    const hadSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    const url = new URL("/login", request.url);
    if (hadSession) url.searchParams.set("reason", "expired");
    return NextResponse.redirect(url);
  }
  if (loggedIn && onLogin) return NextResponse.redirect(new URL("/students", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every page: logged-out visitors are sent to /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  let loggedIn = false;
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
    const { data } = await supabase.auth.getUser();
    loggedIn = !!data.user;
  } catch {
    loggedIn = false; // e.g. Supabase not configured yet
  }

  const onLogin = request.nextUrl.pathname === "/login";
  if (!loggedIn && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (loggedIn && onLogin) return NextResponse.redirect(new URL("/students", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

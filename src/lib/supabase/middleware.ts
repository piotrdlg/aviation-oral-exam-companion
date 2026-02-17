import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect dashboard and admin routes
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/practice') ||
    request.nextUrl.pathname.startsWith('/progress') ||
    request.nextUrl.pathname.startsWith('/settings') ||
    request.nextUrl.pathname.startsWith('/admin');

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Account status enforcement for authenticated users on protected routes
  // RLS note: user_profiles SELECT policy allows users to read own profile
  // where user_id = auth.uid(), so this query uses the user's session (not service role)
  if (user && isProtectedRoute) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_status')
      .eq('user_id', user.id)
      .single();

    if (profile?.account_status === 'banned') {
      // Sign out the banned user and redirect to /banned
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/banned', request.url));
    }

    if (profile?.account_status === 'suspended') {
      return NextResponse.redirect(new URL('/suspended', request.url));
    }
  }

  // Redirect logged-in users away from auth pages
  // Note: /signup removed — OTP login auto-creates accounts, no separate signup needed
  const isAuthRoute = request.nextUrl.pathname === '/login';

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/practice';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

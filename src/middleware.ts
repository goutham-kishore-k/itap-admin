import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Protect dashboard and portal
  if (!user && (path.startsWith('/dashboard') || path.startsWith('/portal'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && (path.startsWith('/dashboard') || path.startsWith('/portal') || path === '/login')) {
    const { data: emp } = await supabase
      .from('employees')
      .select('role, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    // Deactivated employee — Supabase Auth has no idea our app deactivated
    // them, so a valid session survives is_active flipping to false unless
    // this check kills it here on every request, not just at sign-in.
    if (emp && !emp.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'deactivated');
      return NextResponse.redirect(url);
    }

    // Smart login redirect based on role
    if (path === '/login') {
      const url = request.nextUrl.clone();
      // No employee record yet → send to dashboard (backwards compat for existing admin)
      url.pathname = emp?.role === 'hr_admin' || !emp ? '/dashboard' : '/portal';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/login'],
};

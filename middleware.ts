import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // إذا حاول الوصول إلى /admin بدون جلسة، أعد التوجيه إلى /admin/login
  if (!session && req.nextUrl.pathname.startsWith('/admin')) {
    const redirectUrl = new URL('/admin/login', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // (اختياري) يمكنك إضافة تحقق إضافي من is_admin هنا
  return res;
}

export const config = {
  matcher: ['/admin/:path*'],
};

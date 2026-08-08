import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const hasToken = request.cookies.has('access_token') || request.cookies.has('refresh_token');

  if (!hasToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/tests/:path*'],
};

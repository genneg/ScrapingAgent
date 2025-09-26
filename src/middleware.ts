import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Simple middleware for now - just pass through
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/health|api/performance|_next/static|_next/image|favicon.ico).*)',
  ],
};
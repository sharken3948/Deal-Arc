import { NextResponse } from 'next/server';

export async function POST(request) {
  const { token } = await request.json();

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.json({ success: true });
  }

  if (!token) {
    return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret:   process.env.TURNSTILE_SECRET_KEY,
      response: token,
    }),
  });

  const data = await res.json();

  if (data.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json(
    { success: false, error: 'Verification failed', codes: data['error-codes'] },
    { status: 400 },
  );
}

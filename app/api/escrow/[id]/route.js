import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function GET(request, { params }) {
  const { id } = await params;
  const escrow = storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, escrow });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const escrow = storage.update(id, body);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, escrow });
}

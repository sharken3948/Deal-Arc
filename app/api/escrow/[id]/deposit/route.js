import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function POST(request, { params }) {
  const { id } = await params;
  const { txHash } = await request.json().catch(() => ({}));

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.status !== 'pending_deposit') {
    return NextResponse.json({ success: false, error: 'Escrow is not awaiting deposit' }, { status: 400 });
  }

  await storage.update(id, {
    status:        'active',
    depositTxHash: txHash ?? null,
    depositedAt:   new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}

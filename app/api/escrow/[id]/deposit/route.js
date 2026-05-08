import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function POST(request, { params }) {
  const resolved = await params;
  const { id }   = resolved;
  const { txHash } = await request.json().catch(() => ({}));

  console.log('[deposit route] params object:', JSON.stringify(resolved));
  console.log('[deposit route] id type:', typeof id, '| value:', JSON.stringify(id));

  // Verify KV connectivity by checking if ANY escrow key exists
  const testKey = await storage.getById(id);
  console.log('[deposit route] kv lookup result:', testKey === null ? 'NULL' : testKey === undefined ? 'UNDEFINED' : `found (status: ${testKey?.status})`);

  const escrow = testKey;
  if (!escrow) {
    console.error(`[deposit route] escrow not found in KV — id: ${id}`);
    return NextResponse.json({ success: false, error: `Not found — id received: ${id}` }, { status: 404 });
  }
  if (escrow.status !== 'pending_deposit') {
    console.warn(`[deposit route] wrong status — id: ${id}, status: ${escrow.status}`);
    return NextResponse.json({ success: false, error: `Escrow status is '${escrow.status}', expected 'pending_deposit'` }, { status: 400 });
  }

  await storage.update(id, {
    status:        'active',
    depositTxHash: txHash ?? null,
    depositedAt:   new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}

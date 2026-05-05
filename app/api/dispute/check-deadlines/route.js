import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { resolveOnChain } from '@/lib/contract';

export async function GET() {
  const now     = new Date();
  const expired = storage.getAll().filter(e =>
    e.status === 'awaiting_seller_response' &&
    e.disputeDeadline &&
    new Date(e.disputeDeadline) <= now
  );

  if (expired.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'No expired disputes found' });
  }

  const results = await Promise.allSettled(expired.map(async escrow => {
    console.log(`[check-deadlines] Escrow ${escrow.id}: seller did not respond within 24h, auto-resolving in buyer's favor`);

    const { txHash } = await resolveOnChain({ uuid: escrow.id, winner: escrow.buyer.address });

    storage.update(escrow.id, {
      status:      'completed',
      completedAt: now.toISOString(),
      releaseTx: {
        txHash,
        amount:    escrow.amount,
        timestamp: now.toISOString(),
        state:     'CONFIRMED',
        winner:    escrow.buyer.address,
        verdict:   'FAVOR_BUYER',
        reason:    'Seller did not respond within the 24-hour deadline',
      },
    });

    return escrow.id;
  }));

  const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failed    = results
    .filter(r => r.status === 'rejected')
    .map((r, i) => ({ id: expired[i].id, error: r.reason?.message }));

  if (failed.length) console.error('[check-deadlines] failures:', failed);

  return NextResponse.json({ success: true, processed: succeeded.length, succeeded, failed });
}

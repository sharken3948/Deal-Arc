import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { resolveDispute } from '@/lib/claude';
import { resolveOnChain } from '@/lib/contract';

export async function POST(request, { params }) {
  const { id } = await params;
  const { address, claim, disputeTxHash } = await request.json();

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const isBuyer  = escrow.buyer.address.toLowerCase()  === address?.toLowerCase();
  const isSeller = escrow.seller.address.toLowerCase() === address?.toLowerCase();
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ success: false, error: 'Not a party to this escrow' }, { status: 403 });
  }

  const updates = isBuyer
    ? { status: 'disputed', buyer:  { ...escrow.buyer,  disputeClaim: claim, disputeTxHash } }
    : { status: 'disputed', seller: { ...escrow.seller, disputeClaim: claim, disputeTxHash } };

  await storage.update(id, updates);
  const current = await storage.getById(id);

  if (current.buyer.disputeClaim && current.seller.disputeClaim) {
    try {
      const judgment = await resolveDispute({
        escrow:      current,
        buyerClaim:  current.buyer.disputeClaim,
        sellerClaim: current.seller.disputeClaim,
      });
      await storage.update(id, { aiJudgment: judgment });

      const winner = judgment.verdict === 'FAVOR_BUYER' || judgment.awardBuyerPercent > 50
        ? current.buyer.address
        : current.seller.address;

      const { txHash } = await resolveOnChain({ uuid: id, winner });

      await storage.update(id, {
        status:      'completed',
        completedAt: new Date().toISOString(),
        releaseTx: {
          txHash,
          amount:    current.amount,
          timestamp: new Date().toISOString(),
          state:     'CONFIRMED',
          winner,
          verdict:   judgment.verdict,
        },
      });

      return NextResponse.json({ success: true, judgment, status: 'resolved' });
    } catch (error) {
      console.error('Dispute resolve error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, message: 'Dispute claim recorded. Awaiting other party.' });
}

import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { resolveDispute } from '@/lib/claude';
import { resolveOnChain } from '@/lib/contract';
import { isAuthenticated } from '@/lib/agentAuth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

async function authenticate(request) {
  if (!await isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS });
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  const denied = await authenticate(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { escrowId, address, claim, disputeTxHash } = body;

    if (!escrowId || !address || !claim) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: escrowId, address, claim' },
        { status: 400, headers: CORS },
      );
    }

    const escrow = await storage.getById(escrowId);
    if (!escrow) {
      return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
    }

    if (escrow.status === 'completed' || escrow.status === 'pending_deposit') {
      return NextResponse.json(
        { success: false, error: `Cannot dispute: escrow status is '${escrow.status}'` },
        { status: 400, headers: CORS },
      );
    }

    const isBuyer  = escrow.buyer.address.toLowerCase()  === address.toLowerCase();
    const isSeller = escrow.seller.address.toLowerCase() === address.toLowerCase();
    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { success: false, error: 'Not a party to this escrow' },
        { status: 403, headers: CORS },
      );
    }

    const updates = isBuyer
      ? { status: 'disputed', buyer:  { ...escrow.buyer,  disputeClaim: claim, disputeTxHash: disputeTxHash ?? null } }
      : { status: 'disputed', seller: { ...escrow.seller, disputeClaim: claim, disputeTxHash: disputeTxHash ?? null } };

    await storage.update(escrowId, updates);
    const current = await storage.getById(escrowId);

    if (current.buyer.disputeClaim && current.seller.disputeClaim) {
      try {
        const judgment = await resolveDispute({
          escrow:      current,
          buyerClaim:  current.buyer.disputeClaim,
          sellerClaim: current.seller.disputeClaim,
        });
        await storage.update(escrowId, { aiJudgment: judgment });

        const winner = judgment.verdict === 'FAVOR_BUYER' || judgment.awardBuyerPercent > 50
          ? current.buyer.address
          : current.seller.address;

        const { txHash } = await resolveOnChain({ uuid: escrowId, winner });
        await storage.update(escrowId, {
          status:      'completed',
          completedAt: new Date().toISOString(),
          releaseTx:   { txHash, amount: current.amount, timestamp: new Date().toISOString(), state: 'CONFIRMED', winner, verdict: judgment.verdict },
        });

        return NextResponse.json({ success: true, status: 'resolved', judgment }, { headers: CORS });
      } catch (error) {
        console.error('[agent/dispute] resolve error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
      }
    }

    return NextResponse.json(
      { success: true, status: 'disputed', message: 'Dispute claim recorded. Awaiting other party.' },
      { headers: CORS },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

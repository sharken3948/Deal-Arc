import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { storage } from '@/lib/storage';
import { resolveDispute } from '@/lib/claude';
import { disputeOnChain, resolveOnChain } from '@/lib/contract';
import { getAgentSigner } from '@/lib/turnkey';
import { isAuthenticated } from '@/lib/agentAuth';
import { withX402 } from '@/lib/x402';
import { checkRateLimit } from '@/lib/rateLimit';
import { incrementDisputed, incrementWon } from '@/lib/reputation';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Payment-Signature',
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

async function postHandler(request) {
  const denied = await authenticate(request);
  if (denied) return denied;

  const apiKey = request.headers.get('X-API-Key');
  const rl = await checkRateLimit(apiKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const { escrowId, address, claim } = body;

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

    // First filer (status === 'active'): register dispute on-chain signed by the disputing party.
    // Second filer (status already 'disputed'): skip — contract is already in Disputed state.
    let chainDisputeTxHash = null;
    if (escrow.status === 'active') {
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(claim));
      const signer       = getAgentSigner(address);
      const result       = await disputeOnChain({ uuid: escrowId, evidenceHash, signer });
      chainDisputeTxHash = result.disputeTxHash;
    }

    const updates = isBuyer
      ? { status: 'disputed', buyer:  { ...escrow.buyer,  disputeClaim: claim, disputeTxHash: chainDisputeTxHash } }
      : { status: 'disputed', seller: { ...escrow.seller, disputeClaim: claim, disputeTxHash: chainDisputeTxHash } };

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
        await Promise.all([
          incrementDisputed(current.buyer.address),
          incrementDisputed(current.seller.address),
          incrementWon(winner),
        ]);

        return NextResponse.json({ success: true, status: 'resolved', judgment }, { headers: CORS });
      } catch (error) {
        console.error('[agent/dispute] resolve error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
      }
    }

    return NextResponse.json(
      { success: true, status: 'disputed', message: 'Dispute claim recorded. Awaiting other party.', disputeTxHash: chainDisputeTxHash },
      { headers: CORS },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

export const POST = withX402(postHandler);

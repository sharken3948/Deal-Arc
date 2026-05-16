import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { isAuthenticated } from '@/lib/agentAuth';
import { withX402 } from '@/lib/x402';
import { getAgentSigner } from '@/lib/turnkey';
import { checkRateLimit } from '@/lib/rateLimit';
import { depositOnChain } from '@/lib/contract';

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
    const { escrowId } = await request.json();

    if (!escrowId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: escrowId' },
        { status: 400, headers: CORS },
      );
    }

    const escrow = await storage.getById(escrowId);
    if (!escrow) {
      return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
    }
    if (escrow.status !== 'pending_deposit') {
      return NextResponse.json(
        { success: false, error: `Escrow status is '${escrow.status}', expected 'pending_deposit'` },
        { status: 400, headers: CORS },
      );
    }

    const buyerAddress = escrow.buyer.address;
    const signer       = getAgentSigner(buyerAddress);

    const { approveTxHash, depositTxHash } = await depositOnChain({
      uuid:   escrowId,
      amount: escrow.amount,
      signer,
    });

    const updated = await storage.update(escrowId, {
      status:          'active',
      depositTxHash,
      approveTxHash,
      depositedAt:     new Date().toISOString(),
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Storage update failed' }, { status: 500, headers: CORS });
    }

    return NextResponse.json({
      success:       true,
      status:        updated.status,
      approveTxHash,
      depositTxHash,
    }, { headers: CORS });
  } catch (error) {
    console.error('[agent/deposit] error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

export const POST = withX402(postHandler);

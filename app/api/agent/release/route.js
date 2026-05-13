import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
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
    const { escrowId, address, txHash } = body;

    if (!escrowId || !address) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: escrowId, address' },
        { status: 400, headers: CORS },
      );
    }

    const escrow = await storage.getById(escrowId);
    if (!escrow) {
      return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
    }

    if (escrow.status !== 'active' && escrow.status !== 'proof_submitted') {
      return NextResponse.json(
        { success: false, error: `Cannot release: escrow status is '${escrow.status}'` },
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
      ? { buyer:  { ...escrow.buyer,  approved: true, approveTxHash: txHash ?? null } }
      : { seller: { ...escrow.seller, approved: true, approveTxHash: txHash ?? null } };

    const updated      = await storage.update(escrowId, updates);
    const bothApproved = updated.buyer.approved && updated.seller.approved;

    if (bothApproved) {
      await storage.update(escrowId, {
        status:      'completed',
        completedAt: new Date().toISOString(),
        releaseTx:   { txHash: txHash ?? null, amount: updated.amount, timestamp: new Date().toISOString(), state: 'CONFIRMED' },
      });
      return NextResponse.json({ success: true, status: 'completed' }, { headers: CORS });
    }

    return NextResponse.json(
      { success: true, status: updated.status, pendingOtherParty: true },
      { headers: CORS },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

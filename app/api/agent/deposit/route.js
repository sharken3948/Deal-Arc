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
    const { escrowId, txHash } = body;

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

    const updated = await storage.update(escrowId, {
      status:        'active',
      depositTxHash: txHash ?? null,
      depositedAt:   new Date().toISOString(),
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Storage update failed' }, { status: 500, headers: CORS });
    }

    return NextResponse.json({ success: true, status: updated.status }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

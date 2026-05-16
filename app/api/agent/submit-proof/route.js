import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { kv } from '@vercel/kv';
import { storage } from '@/lib/storage';
import { submitDeliverableOnChain } from '@/lib/contract';
import { getAgentSigner } from '@/lib/turnkey';
import { isAuthenticated } from '@/lib/agentAuth';
import { withX402 } from '@/lib/x402';
import { checkRateLimit } from '@/lib/rateLimit';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Payment-Signature',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function postHandler(request) {
  if (!await isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const apiKey = request.headers.get('X-API-Key');
  const rl = await checkRateLimit(apiKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfter) } },
    );
  }

  try {
    const { escrowId, proof } = await request.json();

    if (!escrowId || !proof) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: escrowId, proof' },
        { status: 400, headers: CORS },
      );
    }

    const escrow = await storage.getById(escrowId);
    if (!escrow) {
      return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
    }
    if (escrow.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Cannot submit proof: escrow status is '${escrow.status}', expected 'active'` },
        { status: 400, headers: CORS },
      );
    }

    // Verify caller is the seller by matching their registered wallet address
    const keyData = await kv.get(`key:${apiKey}`);
    if (!keyData?.walletAddress ||
        keyData.walletAddress.toLowerCase() !== escrow.seller.address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Only the seller can submit proof' },
        { status: 403, headers: CORS },
      );
    }

    const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes(proof));
    const signer          = getAgentSigner(escrow.seller.address);

    const { submitTxHash } = await submitDeliverableOnChain({
      uuid: escrowId,
      deliverableHash,
      signer,
    });

    await storage.update(escrowId, {
      proof:         { text: proof, hash: deliverableHash, submitTxHash, submittedAt: new Date().toISOString() },
      updatedAt:     new Date().toISOString(),
    });

    return NextResponse.json({ success: true, submitTxHash, deliverableHash }, { headers: CORS });
  } catch (error) {
    console.error('[agent/submit-proof] error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

export const POST = withX402(postHandler);

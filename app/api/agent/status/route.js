import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { isAuthenticated } from '@/lib/agentAuth';
import { withX402 } from '@/lib/x402';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

async function getHandler(request) {
  const denied = await authenticate(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Missing required query param: id' },
      { status: 400, headers: CORS },
    );
  }

  const escrow = await storage.getById(id);
  if (!escrow) {
    return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
  }

  return NextResponse.json({
    success: true,
    id:          escrow.id,
    status:      escrow.status,
    mode:        escrow.mode,
    title:       escrow.title,
    amount:      escrow.amount,
    buyer:       { address: escrow.buyer.address,  approved: escrow.buyer.approved },
    seller:      { address: escrow.seller.address, approved: escrow.seller.approved },
    contractId:  escrow.contractId  ?? null,
    releaseTx:   escrow.releaseTx   ?? null,
    aiJudgment:  escrow.aiJudgment  ?? null,
    milestones:  escrow.milestones?.map(m => ({
      id:     m.id,
      index:  m.index,
      title:  m.title,
      amount: m.amount,
      status: m.status,
    })) ?? [],
    createdAt: escrow.createdAt,
    updatedAt: escrow.updatedAt,
  }, { headers: CORS });
}

export const GET = withX402(getHandler);

import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { createEscrowOnChain } from '@/lib/contract';

export async function GET() {
  const escrows = await storage.getAll();
  return NextResponse.json({ success: true, escrows });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode, title, description, requirements, amount, buyer, seller, milestones } = body;

    if (!mode || !title || !buyer || !seller) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    let resolvedAmount = amount || '0';
    if (mode === 'milestone' && !amount && milestones?.length) {
      const total = milestones.reduce((s, m) => s + parseFloat(m.amount || 0), 0);
      resolvedAmount = total.toFixed(2);
    }

    const escrow = {
      id: crypto.randomUUID(),
      mode,
      title,
      description:   description   || '',
      requirements:  requirements  || '',
      amount:        resolvedAmount,
      status:        'pending_deposit',
      buyer:  { address: buyer,  approved: false, disputeClaim: '' },
      seller: { address: seller, approved: false, disputeClaim: '' },
      proof:      null,
      aiJudgment: null,
      milestones: mode === 'milestone'
        ? (milestones || []).map((m, i) => ({
            id:          crypto.randomUUID(),
            index:       i,
            title:       m.title,
            description: m.description || '',
            amount:      m.amount,
            status:      'pending',
            proof:       null,
            aiJudgment:  null,
          }))
        : [],
      transactionIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.create(escrow);

    if (parseFloat(resolvedAmount) > 0) {
      try {
        const milestoneAmounts = mode === 'milestone'
          ? (milestones || []).map(m => m.amount)
          : [];
        const onChain = await createEscrowOnChain({
          uuid:   escrow.id,
          buyer:  escrow.buyer.address,
          seller: escrow.seller.address,
          amount: resolvedAmount,
          mode,
          milestoneAmounts,
        });
        await storage.update(escrow.id, { contractId: onChain.contractId, createTxHash: onChain.txHash });
        escrow.contractId   = onChain.contractId;
        escrow.createTxHash = onChain.txHash;
      } catch (e) {
        console.error('On-chain create failed:', e.message);
        escrow.contractWarning = 'On-chain registration failed: ' + e.message;
      }
    }

    return NextResponse.json({ success: true, escrow });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

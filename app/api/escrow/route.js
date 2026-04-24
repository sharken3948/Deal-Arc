import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { judgeNFTSwap, judgeNFTSale } from '@/lib/claude';
import { createEscrowOnChain } from '@/lib/contract';

export async function GET() {
  return NextResponse.json({ success: true, escrows: storage.getAll() });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode, title, description, requirements, amount, buyer, seller, milestones, nftA, nftB, additionalUSDC } = body;

    if (!mode || !title || !buyer || !seller) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // For milestone mode, calculate total from milestone amounts if not provided
    let resolvedAmount = amount || '0';
    if (mode === 'milestone' && !amount && milestones?.length) {
      const total = milestones.reduce((s, m) => s + parseFloat(m.amount || 0), 0);
      resolvedAmount = total.toFixed(2);
    }

    const escrow = {
      id: crypto.randomUUID(),
      mode,
      title,
      description: description || '',
      requirements: requirements || '',
      amount: resolvedAmount,
      status: 'pending_deposit',
      buyer: { address: buyer, approved: false, disputeClaim: '' },
      seller: { address: seller, approved: false, disputeClaim: '' },
      proof: null,
      aiJudgment: null,
      milestones: mode === 'milestone'
        ? (milestones || []).map((m, i) => ({
            id: crypto.randomUUID(),
            index: i,
            title: m.title,
            description: m.description || '',
            amount: m.amount,
            status: 'pending',
            proof: null,
            aiJudgment: null,
          }))
        : [],
      nftA: nftA || null,
      nftB: nftB || null,
      additionalUSDC: additionalUSDC || '0',
      transactionIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (mode === 'nft_swap' && nftA && nftB) {
      try { escrow.aiJudgment = await judgeNFTSwap({ nftA, nftB, additionalUSDC }); }
      catch (e) { console.error('NFT swap AI error:', e.message); }
    }
    if (mode === 'nft_sale' && nftA) {
      try { escrow.aiJudgment = await judgeNFTSale({ nftDetails: nftA, price: amount, description }); }
      catch (e) { console.error('NFT sale AI error:', e.message); }
    }

    storage.create(escrow);

    // Register on-chain (all modes except milestone which uses per-milestone releases)
    if (mode !== 'milestone' && parseFloat(resolvedAmount) > 0) {
      try {
        const onChain = await createEscrowOnChain({
          uuid:   escrow.id,
          buyer:  escrow.buyer.address,
          seller: escrow.seller.address,
          amount: resolvedAmount,
          mode,
        });
        storage.update(escrow.id, { contractId: onChain.contractId, createTxHash: onChain.txHash });
        escrow.contractId   = onChain.contractId;
        escrow.createTxHash = onChain.txHash;
      } catch (e) {
        console.error('On-chain create failed:', e.message);
        // Off-chain record still valid; surface warning to client
        escrow.contractWarning = 'On-chain registration failed: ' + e.message;
      }
    }

    return NextResponse.json({ success: true, escrow });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

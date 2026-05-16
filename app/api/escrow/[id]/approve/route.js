import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { incrementCompleted, setPersonType } from '@/lib/reputation';

export async function POST(request, { params }) {
  const { id } = await params;
  const { address, txHash } = await request.json();

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const isBuyer  = escrow.buyer.address.toLowerCase()  === address?.toLowerCase();
  const isSeller = escrow.seller.address.toLowerCase() === address?.toLowerCase();
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ success: false, error: 'Not a party to this escrow' }, { status: 403 });
  }

  const updates = isBuyer
    ? { buyer:  { ...escrow.buyer,  approved: true, approveTxHash: txHash } }
    : { seller: { ...escrow.seller, approved: true, approveTxHash: txHash } };

  const updated      = await storage.update(id, updates);
  const bothApproved = updated.buyer.approved && updated.seller.approved;

  if (bothApproved) {
    await storage.update(id, {
      status:      'completed',
      completedAt: new Date().toISOString(),
      releaseTx: {
        txHash:    txHash ?? null,
        amount:    updated.amount,
        timestamp: new Date().toISOString(),
        state:     'CONFIRMED',
      },
    });
    await Promise.all([
      incrementCompleted(updated.buyer.address),
      incrementCompleted(updated.seller.address),
      setPersonType(updated.buyer.address),
      setPersonType(updated.seller.address),
    ]);
    return NextResponse.json({ success: true, status: 'completed' });
  }

  return NextResponse.json({ success: true, escrow: updated, pendingOtherParty: true });
}

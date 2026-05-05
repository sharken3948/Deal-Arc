import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

export async function POST(request) {
  const { id, address, reason, evidence, evidenceUrl, disputeTxHash } = await request.json();

  if (!id || !address || !reason) {
    return NextResponse.json({ success: false, error: 'id, address, and reason are required' }, { status: 400 });
  }

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404 });

  const isBuyer  = escrow.buyer.address.toLowerCase()  === address.toLowerCase();
  const isSeller = escrow.seller.address.toLowerCase() === address.toLowerCase();
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ success: false, error: 'Not a party to this escrow' }, { status: 403 });
  }

  if (!['active', 'proof_submitted'].includes(escrow.status)) {
    return NextResponse.json({ success: false, error: `Cannot dispute an escrow in status: ${escrow.status}` }, { status: 400 });
  }

  const claim    = evidence ? `${reason}\n\nEvidence: ${evidence}` : reason;
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const partyKey = isBuyer ? 'buyer' : 'seller';

  await storage.update(id, {
    status:          'awaiting_seller_response',
    disputeDeadline: deadline,
    disputedAt:      new Date().toISOString(),
    [partyKey]:      { ...escrow[partyKey], disputeClaim: claim, disputeTxHash, evidenceUrl: evidenceUrl || null },
  });

  console.log(
    `[dispute] Escrow ${id}: dispute raised by ${isBuyer ? 'buyer' : 'seller'}.` +
    ` Seller (${escrow.seller.address}) has 24h to respond. Deadline: ${deadline}`
  );

  return NextResponse.json({ success: true, status: 'awaiting_seller_response', deadline });
}

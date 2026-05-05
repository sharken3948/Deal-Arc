import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { judgeServiceCompletion } from '@/lib/claude';

export async function POST(request, { params }) {
  const { id } = await params;
  const { url, description, submitterAddress } = await request.json();

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.seller.address.toLowerCase() !== submitterAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the seller can submit proof' }, { status: 403 });
  }

  const proof = {
    url:         url || '',
    description: description || '',
    submittedAt: new Date().toISOString(),
  };
  await storage.update(id, { proof, status: 'proof_submitted' });

  try {
    const judgment = await judgeServiceCompletion({
      title:        escrow.title,
      description:  escrow.description,
      requirements: escrow.requirements,
      amount:       escrow.amount,
      proof,
    });
    await storage.update(id, { aiJudgment: judgment });
    return NextResponse.json({ success: true, judgment });
  } catch (error) {
    return NextResponse.json({ success: true, proof, aiError: error.message });
  }
}

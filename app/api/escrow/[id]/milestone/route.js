import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { judgeMilestone } from '@/lib/claude';
import { resolveOnChain } from '@/lib/contract';

export async function POST(request, { params }) {
  const { id } = await params;
  const { milestoneId, proofUrl, proofDescription, submitterAddress } = await request.json();

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.seller.address.toLowerCase() !== submitterAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the seller can submit proof' }, { status: 403 });
  }

  const milestoneIdx = escrow.milestones.findIndex(m => m.id === milestoneId);
  if (milestoneIdx === -1) return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });

  const proof     = { url: proofUrl || '', description: proofDescription || '', submittedAt: new Date().toISOString() };
  const milestone = { ...escrow.milestones[milestoneIdx], proof, status: 'proof_submitted' };

  try {
    const judgment   = await judgeMilestone({ escrowTitle: escrow.title, milestone, proof });
    milestone.aiJudgment = judgment;
    milestone.status     = judgment.verdict === 'APPROVE' ? 'approved' : 'rejected';
  } catch (e) {
    console.error('Milestone judgment error:', e.message);
  }

  const updatedMilestones = [...escrow.milestones];
  updatedMilestones[milestoneIdx] = milestone;
  const allDone = updatedMilestones.every(m => m.status === 'approved');

  let releaseTx = null;
  if (allDone) {
    try {
      const { txHash } = await resolveOnChain({ uuid: id, winner: escrow.seller.address });
      releaseTx = { txHash, amount: escrow.amount, timestamp: new Date().toISOString(), state: 'CONFIRMED' };
    } catch (e) {
      console.error('Milestone final release error:', e.message);
    }
  }

  await storage.update(id, {
    milestones: updatedMilestones,
    status:     allDone ? 'completed' : 'active',
    ...(allDone ? { completedAt: new Date().toISOString(), releaseTx } : {}),
  });

  return NextResponse.json({ success: true, milestone });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const { milestoneId, approverAddress } = await request.json();

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.buyer.address.toLowerCase() !== approverAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the buyer can manually approve' }, { status: 403 });
  }

  const milestoneIdx = escrow.milestones.findIndex(m => m.id === milestoneId);
  if (milestoneIdx === -1) return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });

  try {
    const updatedMilestones = [...escrow.milestones];
    updatedMilestones[milestoneIdx] = { ...updatedMilestones[milestoneIdx], status: 'approved' };
    const allDone = updatedMilestones.every(m => m.status === 'approved');

    let releaseTx = null;
    if (allDone) {
      const { txHash } = await resolveOnChain({ uuid: id, winner: escrow.seller.address });
      releaseTx = { txHash, amount: escrow.amount, timestamp: new Date().toISOString(), state: 'CONFIRMED' };
    }

    await storage.update(id, {
      milestones: updatedMilestones,
      status:     allDone ? 'completed' : 'active',
      ...(allDone ? { completedAt: new Date().toISOString(), releaseTx } : {}),
    });
    return NextResponse.json({ success: true, milestone: updatedMilestones[milestoneIdx] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

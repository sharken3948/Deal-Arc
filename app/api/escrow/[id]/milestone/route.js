import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { judgeMilestone } from '@/lib/claude';
import { releaseMilestoneOnChain, resolveMilestoneOnChain } from '@/lib/contract';

// POST — seller submits proof (initial) or defense (when disputed).
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

  const currentMs = escrow.milestones[milestoneIdx];
  const proof     = { url: proofUrl || '', description: proofDescription || '', submittedAt: new Date().toISOString() };

  // Disputed: seller defense → AI judges + resolves on-chain
  if (currentMs.status === 'disputed') {
    const updatedMilestones = [...escrow.milestones];
    updatedMilestones[milestoneIdx] = { ...currentMs, proof, defenseSubmittedAt: new Date().toISOString() };
    await storage.update(id, { milestones: updatedMilestones });

    try {
      const judgment = await judgeMilestone({
        escrowTitle:  escrow.title,
        milestone:    currentMs,
        proof,
        buyerDispute: currentMs.disputeReason,
      });
      const winner = judgment.verdict === 'APPROVE' ? escrow.seller.address : escrow.buyer.address;
      const { txHash } = await resolveMilestoneOnChain({ uuid: id, milestoneIndex: milestoneIdx, winner });

      const resolvedStatus = judgment.verdict === 'APPROVE' ? 'approved' : 'rejected';
      const fresh          = await storage.getById(id);
      const resolvedMs     = [...fresh.milestones];
      resolvedMs[milestoneIdx] = {
        ...resolvedMs[milestoneIdx],
        status:     resolvedStatus,
        aiJudgment: { ...judgment, txHash, disputeResolution: true },
      };
      const allDone = resolvedMs.every(m =>
        m.status === 'approved' || (m.status === 'rejected' && m.aiJudgment?.disputeResolution)
      );
      await storage.update(id, {
        milestones: resolvedMs,
        status:     allDone ? 'completed' : 'active',
        ...(allDone ? { completedAt: new Date().toISOString() } : {}),
      });
      return NextResponse.json({ success: true, milestone: resolvedMs[milestoneIdx], judgment });
    } catch (e) {
      console.error('[milestone POST] defense AI/resolve failed:', e.message);
      return NextResponse.json({ success: true, warning: e.message });
    }
  }

  // Pending: initial proof submission → save only, no AI
  const updatedMilestones = [...escrow.milestones];
  updatedMilestones[milestoneIdx] = { ...currentMs, proof, status: 'proof_submitted' };
  await storage.update(id, { milestones: updatedMilestones });
  return NextResponse.json({ success: true, milestone: updatedMilestones[milestoneIdx] });
}

// PUT — buyer approves or disputes a milestone.
export async function PUT(request, { params }) {
  const { id } = await params;
  const { milestoneId, approverAddress, action, reason } = await request.json();

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.buyer.address.toLowerCase() !== approverAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the buyer can approve or dispute' }, { status: 403 });
  }

  const milestoneIdx = escrow.milestones.findIndex(m => m.id === milestoneId);
  if (milestoneIdx === -1) return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });

  // Record the dispute only. AI judgment and on-chain resolution are triggered
  // separately by the oracle after reviewing both parties' evidence.
  if (action === 'dispute') {
    const updatedMilestones = [...escrow.milestones];
    updatedMilestones[milestoneIdx] = {
      ...escrow.milestones[milestoneIdx],
      status:        'disputed',
      disputeReason: reason || '',
      disputedAt:    new Date().toISOString(),
    };
    await storage.update(id, { milestones: updatedMilestones });
    return NextResponse.json({ success: true, milestone: updatedMilestones[milestoneIdx] });
  }

  // Approve — oracle calls releaseMilestone on-chain, then marks approved in storage
  try {
    const { txHash } = await releaseMilestoneOnChain({ uuid: id, milestoneIndex: milestoneIdx });

    const updatedMilestones = [...escrow.milestones];
    updatedMilestones[milestoneIdx] = { ...updatedMilestones[milestoneIdx], status: 'approved', releaseTxHash: txHash };
    const allDone = updatedMilestones.every(m => m.status === 'approved');

    await storage.update(id, {
      milestones: updatedMilestones,
      status:     allDone ? 'completed' : 'active',
      ...(allDone ? { completedAt: new Date().toISOString() } : {}),
    });
    return NextResponse.json({ success: true, milestone: updatedMilestones[milestoneIdx] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

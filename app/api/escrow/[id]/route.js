// Next.js 16 does not reliably route requests to sub-directory route.js files when a
// parent [id]/route.js exists. All sub-route logic (deposit, approve, proof, dispute,
// milestone) is consolidated here and dispatched by the last URL path segment.

import { NextResponse } from 'next/server';
import { storage }      from '@/lib/storage';
import { judgeServiceCompletion, judgeMilestone, resolveDispute } from '@/lib/claude';
import { resolveOnChain, releaseMilestoneOnChain, resolveMilestoneOnChain } from '@/lib/contract';
import { incrementCompleted, incrementDisputed, incrementWon, setPersonType } from '@/lib/reputation';

// Returns the last URL segment after the escrow id, e.g. "deposit", "approve", etc.
// Returns null when the request targets the bare /:id route.
function action(request, id) {
  const segs = new URL(request.url).pathname.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  return last === id ? null : last;
}

// ── Base escrow routes ────────────────────────────────────────────────────────

export async function GET(request, { params }) {
  const { id }  = await params;
  const escrow  = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, escrow });
}

export async function PATCH(request, { params }) {
  const { id }  = await params;
  const body    = await request.json();
  const escrow  = await storage.update(id, body);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, escrow });
}

// ── Dispatcher — POST ─────────────────────────────────────────────────────────
// Body is parsed here once and passed to handlers.
// act = URL segment (sub-route) OR body.action (direct base-URL call).

export async function POST(request, { params }) {
  const { id }  = await params;
  const urlAct  = action(request, id);
  const body    = await request.json().catch(() => ({}));
  const act     = urlAct ?? body.action;
  console.log(`[POST /api/escrow/${id}] act="${act}" url="${urlAct}" body.action="${body.action}"`);

  switch (act) {
    case 'deposit':   return postDeposit(id, body);
    case 'approve':   return postApprove(id, body);
    case 'proof':     return postProof(id, body);
    case 'dispute':   return postDispute(id, body);
    case 'milestone': return postMilestone(id, body);
    default:
      return NextResponse.json({ success: false, error: `Unknown action: ${act}` }, { status: 404 });
  }
}

// ── Dispatcher — PUT ──────────────────────────────────────────────────────────
// Uses body.route to select handler (avoids collision with body.action used inside handlers).

export async function PUT(request, { params }) {
  const { id }  = await params;
  const urlAct  = action(request, id);
  const body    = await request.json().catch(() => ({}));
  const act     = urlAct ?? body.route;
  console.log(`[PUT /api/escrow/${id}] act="${act}"`);

  switch (act) {
    case 'milestone': return putMilestone(id, body);
    default:
      return NextResponse.json({ success: false, error: `Unknown action: ${act}` }, { status: 404 });
  }
}

// ── Handler: deposit ──────────────────────────────────────────────────────────

async function postDeposit(id, body) {
  console.log('[deposit] handler called for:', id);
  const { txHash } = body;

  const escrow = await storage.getById(id);
  console.log('[deposit] kv lookup:', escrow ? `found (status: ${escrow.status})` : 'NULL');
  if (!escrow) {
    console.error(`[deposit] not found in KV — id: ${id}`);
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (escrow.status !== 'pending_deposit') {
    return NextResponse.json({
      success: false,
      error: `Escrow status is '${escrow.status}', expected 'pending_deposit'`,
    }, { status: 400 });
  }

  const updated = await storage.update(id, {
    status:        'active',
    depositTxHash: txHash ?? null,
    depositedAt:   new Date().toISOString(),
  });
  console.log('[deposit] storage.update result:', updated ? `ok (status: ${updated.status})` : 'NULL — update failed silently');

  if (!updated) {
    console.error('[deposit] storage.update returned null — KV write failed');
    return NextResponse.json({ success: false, error: 'Storage update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ── Handler: approve ──────────────────────────────────────────────────────────

async function postApprove(id, body) {
  const { address, txHash } = body;

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
      releaseTx:   { txHash: txHash ?? null, amount: updated.amount, timestamp: new Date().toISOString(), state: 'CONFIRMED' },
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

// ── Handler: proof ────────────────────────────────────────────────────────────

async function postProof(id, body) {
  const { url, description, submitterAddress } = body;

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.seller.address.toLowerCase() !== submitterAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the seller can submit proof' }, { status: 403 });
  }

  const proof = { url: url || '', description: description || '', submittedAt: new Date().toISOString() };
  await storage.update(id, { proof, status: 'proof_submitted' });

  try {
    const judgment = await judgeServiceCompletion({
      title: escrow.title, description: escrow.description,
      requirements: escrow.requirements, amount: escrow.amount, proof,
    });
    await storage.update(id, { aiJudgment: judgment });
    return NextResponse.json({ success: true, judgment });
  } catch (error) {
    return NextResponse.json({ success: true, proof, aiError: error.message });
  }
}

// ── Handler: dispute ──────────────────────────────────────────────────────────

async function postDispute(id, body) {
  const { address, claim, disputeTxHash } = body;

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const isBuyer  = escrow.buyer.address.toLowerCase()  === address?.toLowerCase();
  const isSeller = escrow.seller.address.toLowerCase() === address?.toLowerCase();
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ success: false, error: 'Not a party to this escrow' }, { status: 403 });
  }

  const updates = isBuyer
    ? { status: 'disputed', buyer:  { ...escrow.buyer,  disputeClaim: claim, disputeTxHash } }
    : { status: 'disputed', seller: { ...escrow.seller, disputeClaim: claim, disputeTxHash } };

  await storage.update(id, updates);
  const current = await storage.getById(id);

  if (current.buyer.disputeClaim && current.seller.disputeClaim) {
    try {
      const judgment = await resolveDispute({
        escrow:      current,
        buyerClaim:  current.buyer.disputeClaim,
        sellerClaim: current.seller.disputeClaim,
      });
      await storage.update(id, { aiJudgment: judgment });

      const winner = judgment.verdict === 'FAVOR_BUYER' || judgment.awardBuyerPercent > 50
        ? current.buyer.address
        : current.seller.address;

      const { txHash } = await resolveOnChain({ uuid: id, winner });
      await storage.update(id, {
        status:      'completed',
        completedAt: new Date().toISOString(),
        releaseTx:   { txHash, amount: current.amount, timestamp: new Date().toISOString(), state: 'CONFIRMED', winner, verdict: judgment.verdict },
      });
      await Promise.all([
        incrementDisputed(current.buyer.address),
        incrementDisputed(current.seller.address),
        incrementWon(winner),
      ]);
      return NextResponse.json({ success: true, judgment, status: 'resolved' });
    } catch (error) {
      console.error('[dispute] resolve error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, message: 'Dispute claim recorded. Awaiting other party.' });
}

// ── Handler: milestone POST (seller submits proof) ────────────────────────────

async function postMilestone(id, body) {
  console.log('[milestone POST] received proof for:', id);
  const { milestoneId, proofUrl, proofDescription, submitterAddress } = body;

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.seller.address.toLowerCase() !== submitterAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the seller can submit proof' }, { status: 403 });
  }

  const milestoneIdx = escrow.milestones.findIndex(m => m.id === milestoneId);
  if (milestoneIdx === -1) return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });

  const currentMs = escrow.milestones[milestoneIdx];
  const proof     = { url: proofUrl || '', description: proofDescription || '', submittedAt: new Date().toISOString() };

  // ── Disputed: seller submitting defense → AI judges + resolves on-chain ──────
  if (currentMs.status === 'disputed') {
    console.log(`[milestone POST] seller defense for disputed milestone ${milestoneIdx}`);
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
      console.log(`[milestone POST] AI verdict: ${judgment.verdict} (${judgment.confidence}%)`);

      const winner = judgment.verdict === 'APPROVE' ? escrow.seller.address : escrow.buyer.address;
      const { txHash } = await resolveMilestoneOnChain({ uuid: id, milestoneIndex: milestoneIdx, winner });

      const resolvedStatus   = judgment.verdict === 'APPROVE' ? 'approved' : 'rejected';
      const fresh            = await storage.getById(id);
      const resolvedMs       = [...fresh.milestones];
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

  // ── Pending: initial proof submission → save, no AI ───────────────────────────
  const updatedMilestones = [...escrow.milestones];
  updatedMilestones[milestoneIdx] = { ...currentMs, proof, status: 'proof_submitted' };
  await storage.update(id, { milestones: updatedMilestones });
  return NextResponse.json({ success: true, milestone: updatedMilestones[milestoneIdx] });
}

// ── Handler: milestone PUT (buyer approve / dispute) ──────────────────────────

async function putMilestone(id, body) {
  const { milestoneId, approverAddress, action: act, reason } = body;

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (escrow.buyer.address.toLowerCase() !== approverAddress?.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the buyer can approve or dispute' }, { status: 403 });
  }

  const milestoneIdx = escrow.milestones.findIndex(m => m.id === milestoneId);
  if (milestoneIdx === -1) return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });

  if (act === 'dispute') {
    // Record the dispute only. AI judgment and on-chain resolution are triggered
    // separately by the oracle after reviewing both parties' evidence.
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

  // Approve: oracle calls releaseMilestone on-chain, then marks approved in storage.
  // Each milestone is released individually — no whole-escrow resolve needed.
  try {
    const { txHash } = await releaseMilestoneOnChain({ uuid: id, milestoneIndex: milestoneIdx });

    const updatedMilestones = [...escrow.milestones];
    updatedMilestones[milestoneIdx] = { ...updatedMilestones[milestoneIdx], status: 'approved', releaseTxHash: txHash };
    const allDone = updatedMilestones.every(m =>
      m.status === 'approved' || (m.status === 'rejected' && m.aiJudgment?.disputeResolution)
    );

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

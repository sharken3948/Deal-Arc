import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { storage } from '@/lib/storage';
import { createEscrowOnChain } from '@/lib/contract';
import { withX402 } from '@/lib/x402';
import { isAuthenticated } from '@/lib/agentAuth';
import { checkRateLimit } from '@/lib/rateLimit';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function scoreRequirements(requirements) {
  const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const prompt = `Rate these escrow requirements 1-10 for how objectively verifiable they are. An AI judge will evaluate evidence against them. Return only JSON: { "score": number, "feedback": string }. Requirements: ${requirements}`;
  const completion = await groq.chat.completions.create({
    model:           'llama-3.1-8b-instant',
    messages:        [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens:      200,
  });
  return JSON.parse(completion.choices[0].message.content);
}

async function postHandler(request) {
  const denied = await authenticate(request);
  if (denied) return denied;

  const apiKey = request.headers.get('X-API-Key');
  const rl = await checkRateLimit(apiKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const { mode, title, description, requirements, amount, buyer, seller, milestones } = body;

    if (!mode || !title || !buyer || !seller) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: mode, title, buyer, seller' },
        { status: 400, headers: CORS },
      );
    }

    if (mode === 'service' || mode === 'milestone') {
      const req = (requirements || '').trim();
      if (req.length < 100) {
        return NextResponse.json(
          { success: false, error: 'Requirements too vague. Provide specific, verifiable criteria for AI Judge to evaluate evidence accurately.' },
          { status: 400, headers: CORS },
        );
      }
      let groqResult = null;
      try {
        groqResult = await scoreRequirements(req);
      } catch {
        try {
          groqResult = await scoreRequirements(req);
        } catch (e) {
          return NextResponse.json(
            { success: false, error: 'Requirements validation service unavailable. Please try again.' },
            { status: 503, headers: CORS },
          );
        }
      }
      if (!groqResult || groqResult.score < 7) {
        return NextResponse.json(
          {
            success:  false,
            error:    'Requirements too vague. Provide specific, verifiable criteria for AI Judge to evaluate evidence accurately.',
            score:    groqResult?.score    ?? null,
            feedback: groqResult?.feedback ?? null,
          },
          { status: 400, headers: CORS },
        );
      }
    }

    let resolvedAmount = amount || '0';
    if (mode === 'milestone' && !amount && milestones?.length) {
      const total = milestones.reduce((s, m) => s + parseFloat(m.amount || 0), 0);
      resolvedAmount = total.toFixed(2);
    }

    const escrow = {
      id:           crypto.randomUUID(),
      mode,
      title,
      description:  description  || '',
      requirements: requirements || '',
      amount:       resolvedAmount,
      status:       'pending_deposit',
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
        console.error('[agent/create-escrow] on-chain create failed:', e.message);
        escrow.contractWarning = 'On-chain registration failed: ' + e.message;
      }
    }

    return NextResponse.json({ success: true, escrow }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

export const POST = withX402(postHandler);

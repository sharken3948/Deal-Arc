import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { storage } from '@/lib/storage';
import { resolveOnChain } from '@/lib/contract';

const TEXT_MODEL   = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

function parseJudgment(text, model) {
  return {
    verdict:           text.match(/VERDICT:\s*([A-Z_]+)/)?.[1]                                                          || 'FAVOR_SELLER',
    confidence:    parseInt(text.match(/CONFIDENCE:\s*(\d+)/)?.[1]                                                       || '50'),
    reasoning:         text.match(/REASONING:\s*([\s\S]+?)(?=\nRECOMMENDATION:|\nAWARD_BUYER_PERCENT:|$)/)?.[1]?.trim() || text,
    recommendation:    text.match(/RECOMMENDATION:\s*([\s\S]+?)(?=\nAWARD_BUYER_PERCENT:|$)/)?.[1]?.trim()              || '',
    awardBuyerPercent: parseInt(text.match(/AWARD_BUYER_PERCENT:\s*(\d+)/)?.[1]                                          || '0'),
    rawResponse: text,
    timestamp:   new Date().toISOString(),
    model,
  };
}

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch evidence image (${res.status})`);
  const mime   = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function judgeDispute({ escrow, buyerClaim, sellerClaim, evidenceUrl }) {
  const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const model = evidenceUrl ? VISION_MODEL : TEXT_MODEL;

  const prompt = `You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator. Resolve this dispute fairly.

ESCROW: ${escrow.title}
AGREEMENT: ${escrow.description}
AMOUNT IN DISPUTE: ${escrow.amount} USDC

BUYER'S CLAIM: ${buyerClaim}
SELLER'S CLAIM: ${sellerClaim}${escrow.proof?.description ? `\nSUBMITTED PROOF: ${escrow.proof.description}` : ''}${escrow.proof?.url ? `\nProof URL: ${escrow.proof.url}` : ''}${evidenceUrl ? '\n\nImage evidence has been attached — examine it carefully as part of your judgment.' : ''}

Who should receive the funds? Respond EXACTLY:
VERDICT: FAVOR_BUYER or FAVOR_SELLER or SPLIT_50_50
CONFIDENCE: [0-100]
REASONING: [4-6 sentences of detailed judgment]
RECOMMENDATION: [Specific resolution instructions]
AWARD_BUYER_PERCENT: [0-100]`;

  let content;
  if (evidenceUrl) {
    const dataUrl = await fetchImageAsDataUrl(evidenceUrl);
    content = [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text',      text: prompt },
    ];
  } else {
    content = prompt;
  }

  const completion = await groq.chat.completions.create({
    model,
    max_tokens: 900,
    messages: [{ role: 'user', content }],
  });

  return parseJudgment(completion.choices[0].message.content, model);
}

export async function POST(request) {
  const { id, address, claim, evidence, evidenceUrl } = await request.json();

  if (!id || !address || !claim) {
    return NextResponse.json({ success: false, error: 'id, address, and claim are required' }, { status: 400 });
  }

  const escrow = await storage.getById(id);
  if (!escrow) return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404 });

  if (escrow.seller.address.toLowerCase() !== address.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Only the seller can respond to a dispute' }, { status: 403 });
  }

  if (escrow.status !== 'awaiting_seller_response') {
    return NextResponse.json({ success: false, error: `Escrow is not awaiting a seller response (status: ${escrow.status})` }, { status: 400 });
  }

  if (new Date() > new Date(escrow.disputeDeadline)) {
    return NextResponse.json({ success: false, error: 'Response deadline has passed' }, { status: 400 });
  }

  const sellerClaim = evidence ? `${claim}\n\nEvidence: ${evidence}` : claim;
  await storage.update(id, {
    seller: { ...escrow.seller, disputeClaim: sellerClaim, evidenceUrl: evidenceUrl || null },
  });

  const current = await storage.getById(id);

  // Use image evidence if either party uploaded one (prefer seller's, fall back to buyer's)
  const imageUrl = evidenceUrl || current.buyer.evidenceUrl || null;

  try {
    const judgment = await judgeDispute({
      escrow:     current,
      buyerClaim: current.buyer.disputeClaim,
      sellerClaim,
      evidenceUrl: imageUrl,
    });
    await storage.update(id, { aiJudgment: judgment });

    const winner = judgment.verdict === 'FAVOR_BUYER' || judgment.awardBuyerPercent > 50
      ? current.buyer.address
      : current.seller.address;

    const { txHash } = await resolveOnChain({ uuid: id, winner });

    await storage.update(id, {
      status:      'completed',
      completedAt: new Date().toISOString(),
      releaseTx: {
        txHash,
        amount:    current.amount,
        timestamp: new Date().toISOString(),
        state:     'CONFIRMED',
        winner,
        verdict:   judgment.verdict,
      },
    });

    return NextResponse.json({ success: true, judgment, winner, status: 'resolved' });
  } catch (error) {
    console.error('[dispute/respond]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

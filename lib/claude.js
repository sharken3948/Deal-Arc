import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';

const MODEL        = 'claude-sonnet-4-6';
const TEXT_MODEL   = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function parse(text) {
  return {
    verdict: text.match(/VERDICT:\s*([A-Z_]+)/)?.[1] || 'PENDING',
    confidence: parseInt(text.match(/CONFIDENCE:\s*(\d+)/)?.[1] || '50'),
    reasoning: text.match(/REASONING:\s*([\s\S]+?)(?=\nRECOMMENDATION:|\nAWARD_BUYER_PERCENT:|$)/)?.[1]?.trim() || text,
    recommendation: text.match(/RECOMMENDATION:\s*([\s\S]+?)(?=\nAWARD_BUYER_PERCENT:|$)/)?.[1]?.trim() || '',
    awardBuyerPercent: parseInt(text.match(/AWARD_BUYER_PERCENT:\s*(\d+)/)?.[1] || '0'),
    rawResponse: text,
    timestamp: new Date().toISOString(),
    model: MODEL,
  };
}

async function ask(prompt) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });
  return parse(msg.content[0].text);
}

// Fetch an image URL and return a base64 data URL for Groq vision input.
// Returns null on any failure so callers can gracefully fall back to text.
async function fetchImageAsBase64(url) {
  try {
    const res    = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const mime   = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function parseGroq(text, model) {
  return {
    verdict:        text.match(/VERDICT:\s*([A-Z_]+)/)?.[1]                                                           || 'REJECT',
    confidence:     parseInt(text.match(/CONFIDENCE:\s*(\d+)/)?.[1]                                                   || '50'),
    reasoning:      text.match(/REASONING:\s*([\s\S]+?)(?=\nRECOMMENDATION:|\nAWARD_BUYER_PERCENT:|$)/)?.[1]?.trim() || text,
    recommendation: text.match(/RECOMMENDATION:\s*([\s\S]+?)(?=\nAWARD_BUYER_PERCENT:|$)/)?.[1]?.trim()              || '',
    awardBuyerPercent: parseInt(text.match(/AWARD_BUYER_PERCENT:\s*(\d+)/)?.[1]                                       || '0'),
    rawResponse:    text,
    timestamp:      new Date().toISOString(),
    model,
  };
}

export async function judgeServiceCompletion({ title, description, requirements, amount, proof }) {
  return ask(`You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator.

ESCROW: ${title}
AGREEMENT: ${description}
REQUIREMENTS: ${requirements || 'As described above'}
AMOUNT: ${amount} USDC

SELLER PROOF:
${proof.description || 'None provided'}${proof.url ? `\nURL: ${proof.url}` : ''}

Has the seller fulfilled their obligations? Respond EXACTLY:
VERDICT: APPROVE or REJECT
CONFIDENCE: [0-100]
REASONING: [3-5 sentences analyzing whether the proof satisfies requirements]
RECOMMENDATION: [1-2 sentences on next steps]`);
}

// Uses Groq with vision when an image is available in the proof.
// Pass buyerDispute when resolving a dispute: AI weighs proof against the buyer's objection.
export async function judgeMilestone({ escrowTitle, milestone, proof, buyerDispute }) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Attempt to fetch proof image for visual analysis
  let imageDataUrl = null;
  if (proof?.url) {
    imageDataUrl = await fetchImageAsBase64(proof.url);
  }
  const model = imageDataUrl ? VISION_MODEL : TEXT_MODEL;

  const imageNote = proof?.url && !imageDataUrl
    ? '\nNOTE: Evidence image was unavailable and could not be analyzed.'
    : '';

  const prompt = `You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator.

ESCROW: ${escrowTitle}
MILESTONE: ${milestone.title}
DESCRIPTION: ${milestone.description || 'As titled'}
AMOUNT: ${milestone.amount} USDC

SELLER PROOF:
${proof?.description || 'None provided'}${proof?.url ? `\nEvidence URL: ${proof.url}` : ''}${imageNote}${
    imageDataUrl ? '\nImage evidence is attached — examine it carefully as part of your judgment.' : ''
  }${
    buyerDispute
      ? `\n\nBUYER DISPUTE: ${buyerDispute}\n\nThe buyer has disputed this milestone. Weigh both the seller's proof and the buyer's objection carefully.`
      : ''
  }

Has this milestone been satisfactorily completed? Respond EXACTLY:
VERDICT: APPROVE or REJECT
CONFIDENCE: [0-100]
REASONING: [2-4 sentences of analysis]
RECOMMENDATION: [Next steps]`;

  const content = imageDataUrl
    ? [{ type: 'image_url', image_url: { url: imageDataUrl } }, { type: 'text', text: prompt }]
    : prompt;

  const completion = await groq.chat.completions.create({
    model,
    max_tokens: 500,
    messages: [{ role: 'user', content }],
  });

  return parseGroq(completion.choices[0].message.content, model);
}

// Uses Groq with vision when either party uploaded image evidence.
export async function resolveDispute({ escrow, buyerClaim, sellerClaim }) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Prefer seller's evidence image (proof of delivery), fall back to buyer's
  const imageUrl = escrow.seller?.evidenceUrl || escrow.buyer?.evidenceUrl || escrow.proof?.url || null;
  let imageDataUrl = null;
  if (imageUrl) {
    imageDataUrl = await fetchImageAsBase64(imageUrl);
  }
  const model = imageDataUrl ? VISION_MODEL : TEXT_MODEL;

  const imageNote = imageUrl && !imageDataUrl
    ? '\nNOTE: Evidence image was unavailable and could not be analyzed.'
    : '';

  const prompt = `You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator. Resolve this dispute fairly.

ESCROW: ${escrow.title}
AGREEMENT: ${escrow.description}
AMOUNT IN DISPUTE: ${escrow.amount} USDC

BUYER'S CLAIM: ${buyerClaim}
SELLER'S CLAIM: ${sellerClaim}${escrow.proof?.description ? `\nSUBMITTED PROOF: ${escrow.proof.description}` : ''}${escrow.proof?.url ? `\nProof URL: ${escrow.proof.url}` : ''}${imageNote}${
    imageDataUrl ? '\nImage evidence is attached — examine it carefully as part of your judgment.' : ''
  }

Who should receive the funds? Respond EXACTLY:
VERDICT: FAVOR_BUYER or FAVOR_SELLER or SPLIT_50_50
CONFIDENCE: [0-100]
REASONING: [4-6 sentences of detailed judgment]
RECOMMENDATION: [Specific resolution instructions]
AWARD_BUYER_PERCENT: [0-100]`;

  const content = imageDataUrl
    ? [{ type: 'image_url', image_url: { url: imageDataUrl } }, { type: 'text', text: prompt }]
    : prompt;

  const completion = await groq.chat.completions.create({
    model,
    max_tokens: 900,
    messages: [{ role: 'user', content }],
  });

  return parseGroq(completion.choices[0].message.content, model);
}

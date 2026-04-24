import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

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

export async function judgeMilestone({ escrowTitle, milestone, proof }) {
  return ask(`You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator.

ESCROW: ${escrowTitle}
MILESTONE: ${milestone.title}
DESCRIPTION: ${milestone.description || 'As titled'}
AMOUNT: ${milestone.amount} USDC

SELLER PROOF:
${proof.description || 'None provided'}${proof.url ? `\nURL: ${proof.url}` : ''}

Has this milestone been satisfactorily completed? Respond EXACTLY:
VERDICT: APPROVE or REJECT
CONFIDENCE: [0-100]
REASONING: [2-4 sentences of analysis]
RECOMMENDATION: [Next steps]`);
}

export async function judgeNFTSwap({ nftA, nftB, additionalUSDC }) {
  return ask(`You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator.

NFT SWAP:
Party A: NFT "${nftA.collection}" #${nftA.tokenId}${nftA.description ? ` — ${nftA.description}` : ''}${additionalUSDC && additionalUSDC !== '0' ? `\n+ ${additionalUSDC} USDC sweetener` : ''}
Party B: NFT "${nftB.collection}" #${nftB.tokenId}${nftB.description ? ` — ${nftB.description}` : ''}

Is this a fair swap? Respond EXACTLY:
VERDICT: FAIR_SWAP or UNFAIR_SWAP
CONFIDENCE: [0-100]
REASONING: [3-4 sentences analyzing fairness]
RECOMMENDATION: [Whether to proceed or renegotiate]`);
}

export async function judgeNFTSale({ nftDetails, price, description }) {
  return ask(`You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator.

NFT SALE:
Collection: ${nftDetails.collection}
Token ID: ${nftDetails.tokenId}
Description: ${description || nftDetails.description || 'Not provided'}
Asking Price: ${price} USDC

Is this price fair? Respond EXACTLY:
VERDICT: FAIR_PRICE or OVERPRICED or UNDERPRICED
CONFIDENCE: [0-100]
REASONING: [3-4 sentences on price analysis]
RECOMMENDATION: [Whether parties should proceed]`);
}

export async function resolveDispute({ escrow, buyerClaim, sellerClaim }) {
  return ask(`You are ArcEscrow AI Judge — an impartial blockchain escrow arbitrator. Resolve this dispute fairly.

ESCROW: ${escrow.title}
AGREEMENT: ${escrow.description}
AMOUNT IN DISPUTE: ${escrow.amount} USDC

BUYER'S CLAIM: ${buyerClaim}
SELLER'S CLAIM: ${sellerClaim}${escrow.proof?.description ? `\nSUBMITTED PROOF: ${escrow.proof.description}` : ''}${escrow.proof?.url ? `\nProof URL: ${escrow.proof.url}` : ''}

Who should receive the funds? Respond EXACTLY:
VERDICT: FAVOR_BUYER or FAVOR_SELLER or SPLIT_50_50
CONFIDENCE: [0-100]
REASONING: [4-6 sentences of detailed judgment]
RECOMMENDATION: [Specific resolution instructions]
AWARD_BUYER_PERCENT: [0-100]`);
}

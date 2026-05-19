import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { storage } from '@/lib/storage';
import { uploadToPinata } from '@/lib/pinata';
import { withX402 } from '@/lib/x402';
import { isAuthenticated } from '@/lib/agentAuth';
import { checkRateLimit } from '@/lib/rateLimit';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Payment-Signature',
};

const MAX_INLINE_BYTES   = 500 * 1024; // 500 KB — store base64 directly in KV
const MAX_PER_MILESTONE  = 3;

const evidenceKey = (escrowId, milestoneIndex) => `evidence:${escrowId}:${milestoneIndex}`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function postHandler(request) {
  if (!await isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const apiKey = request.headers.get('X-API-Key');
  const rl = await checkRateLimit(apiKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfter) } },
    );
  }

  try {
    const { escrowId, evidenceUrl, base64, mimeType = 'image/jpeg', description, milestoneIndex = 0 } = await request.json();

    if (!escrowId) {
      return NextResponse.json({ success: false, error: 'Missing required field: escrowId' }, { status: 400, headers: CORS });
    }
    if (!base64 && !evidenceUrl) {
      return NextResponse.json({ success: false, error: 'Provide either base64 (image data) or evidenceUrl' }, { status: 400, headers: CORS });
    }

    const escrow = await storage.getById(escrowId);
    if (!escrow) {
      return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
    }

    const evKey   = evidenceKey(escrowId, milestoneIndex);
    const existing = (await kv.get(evKey)) || [];

    if (existing.length >= MAX_PER_MILESTONE) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_PER_MILESTONE} evidence submissions per milestone reached` },
        { status: 400, headers: CORS },
      );
    }

    let storedData = {};
    let ipfsHash   = null;
    let ipfsUrl    = null;

    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length <= MAX_INLINE_BYTES) {
        storedData = { type: 'base64', data: base64, mimeType };
      } else {
        const ext      = mimeType.split('/')[1] || 'jpg';
        const filename = `evidence-${Date.now()}.${ext}`;
        ipfsUrl  = await uploadToPinata(buffer, filename, mimeType);
        ipfsHash = ipfsUrl.split('/ipfs/').pop().split('/')[0].split('?')[0];
        storedData = { type: 'ipfs', ipfsUrl, ipfsHash };
      }
    } else {
      ipfsUrl = evidenceUrl;
      if (evidenceUrl.includes('/ipfs/')) {
        ipfsHash = evidenceUrl.split('/ipfs/').pop().split('/')[0].split('?')[0];
      }
      storedData = { type: 'url', url: evidenceUrl };
    }

    const entry = { ...storedData, description: description || '', submittedAt: new Date().toISOString() };
    await kv.set(evKey, [...existing, entry]);

    return NextResponse.json({
      success: true,
      evidenceStored:      entry,
      ipfsHash:            ipfsHash || null,
      ipfsUrl:             ipfsUrl  || null,
      escrowId,
      milestoneIndex,
      submissionsRemaining: MAX_PER_MILESTONE - (existing.length + 1),
    }, { headers: CORS });
  } catch (error) {
    console.error('[agent/submit-evidence]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}

export const POST = withX402(postHandler);

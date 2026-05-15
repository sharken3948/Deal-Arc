import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { createAgentWallet } from '@/lib/turnkey';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, projectName } = body;

    if (!email || !projectName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: email, projectName' },
        { status: 400, headers: CORS },
      );
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400, headers: CORS },
      );
    }

    const emailKey = `email_agent:${email.toLowerCase()}`;

    // One key per email
    const existing = await kv.get(emailKey);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An API key already exists for this email' },
        { status: 409, headers: CORS },
      );
    }

    const apiKey    = `da_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const wallet  = await createAgentWallet(projectName);
    const keyData = {
      email:         email.toLowerCase(),
      projectName,
      createdAt,
      requestCount:  0,
      walletId:      wallet?.walletId      ?? null,
      walletAddress: wallet?.walletAddress ?? null,
    };

    const kvWrites = [
      kv.set(`key:${apiKey}`, keyData),
      kv.set(emailKey, apiKey),
    ];
    if (wallet?.walletAddress && wallet?.walletId) {
      kvWrites.push(kv.set(`wallet:${wallet.walletAddress.toLowerCase()}`, wallet.walletId));
    }
    await Promise.all(kvWrites);

    return NextResponse.json({
      success:       true,
      apiKey,
      email:         keyData.email,
      projectName:   keyData.projectName,
      walletAddress: keyData.walletAddress,
      createdAt,
      message:       'Store this key securely — it will not be shown again.',
    }, { status: 201, headers: CORS });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: CORS },
    );
  }
}

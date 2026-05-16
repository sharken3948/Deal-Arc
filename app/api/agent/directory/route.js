import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { getReputation } from '@/lib/reputation';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  const addresses = await kv.smembers('agents');

  if (!addresses || addresses.length === 0) {
    return NextResponse.json({ success: true, agents: [] }, { headers: CORS });
  }

  const agents = await Promise.all(
    addresses.map(async (address) => {
      const [reputation, profile] = await Promise.all([
        getReputation(address),
        kv.get(`agent:${address}:profile`),
      ]);
      return {
        address,
        name:         profile?.name         ?? null,
        registeredAt: profile?.registeredAt ?? null,
        ...reputation,
      };
    }),
  );

  agents.sort((a, b) => b.completed - a.completed);

  return NextResponse.json({ success: true, agents }, { headers: CORS });
}

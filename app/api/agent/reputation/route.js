import { NextResponse } from 'next/server';
import { getReputation } from '@/lib/reputation';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json(
      { success: false, error: 'Missing required query param: address' },
      { status: 400, headers: CORS },
    );
  }

  const reputation = await getReputation(address);
  return NextResponse.json({ success: true, address, ...reputation }, { headers: CORS });
}

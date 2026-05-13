import { NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

function authenticate(request) {
  const key = request.headers.get('X-API-Key');
  if (!process.env.AGENT_API_KEY || key !== process.env.AGENT_API_KEY) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS });
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const denied = authenticate(request);
  if (denied) return denied;

  return NextResponse.json({
    success: true,
    name: 'DealARC Agent API',
    version: '1.0.0',
    endpoints: [
      { method: 'POST', path: '/api/agent/create-escrow', description: 'Create a new escrow' },
      { method: 'POST', path: '/api/agent/deposit',        description: 'Mark escrow as funded (active)' },
      { method: 'POST', path: '/api/agent/release',        description: 'Approve and release payment' },
      { method: 'POST', path: '/api/agent/dispute',        description: 'Open a dispute on an escrow' },
      { method: 'GET',  path: '/api/agent/status',         description: 'Check escrow status by ?id=' },
    ],
  }, { headers: CORS });
}

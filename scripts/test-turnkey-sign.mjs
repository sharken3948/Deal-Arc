/**
 * One-shot Turnkey signing test.
 * Calls createAgentWallet directly — same path as /api/agent/register — and logs the response.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Turnkey } from '@turnkey/sdk-server';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env.local (Next.js doesn't inject these for plain Node scripts)
try {
  const lines = readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* ignore */ }

const { TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY, TURNKEY_ORGANIZATION_ID } = process.env;

console.log('Turnkey org    :', TURNKEY_ORGANIZATION_ID);
console.log('Turnkey pubkey :', TURNKEY_API_PUBLIC_KEY?.slice(0, 14) + '…');
console.log('Private key set:', !!TURNKEY_API_PRIVATE_KEY);
console.log('\nBuilding Turnkey client…');

const client = new Turnkey({
  apiBaseUrl: 'https://api.turnkey.com',
  apiPublicKey: TURNKEY_API_PUBLIC_KEY,
  apiPrivateKey: TURNKEY_API_PRIVATE_KEY,
  defaultOrganizationId: TURNKEY_ORGANIZATION_ID,
}).apiClient();

const walletName = `TurnkeyBuyerTest-${crypto.randomUUID().slice(0, 8)}`;
console.log(`\nCalling client.createWallet("${walletName}")…`);

const timeoutMs = 20_000;
const timer = setTimeout(() => {
  console.error(`\n✗ Timed out after ${timeoutMs / 1000}s — Turnkey API did not respond`);
  process.exit(1);
}, timeoutMs);

try {
  const result = await client.createWallet({
    walletName,
    accounts: [{
      curve: 'CURVE_SECP256K1',
      pathFormat: 'PATH_FORMAT_BIP32',
      path: "m/44'/60'/0'/0/0",
      addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
    }],
  });

  clearTimeout(timer);

  console.log('\nRaw response:', JSON.stringify(result, null, 2));

  const walletId      = result.walletId;
  const walletAddress = result.addresses?.[0];

  if (walletId && walletAddress) {
    console.log('\n✓ Turnkey signing OK');
    console.log('  walletId     :', walletId);
    console.log('  walletAddress:', walletAddress);
  } else {
    console.log('\n⚠ Response missing walletId or addresses — inspect raw response above');
    process.exit(1);
  }
} catch (err) {
  clearTimeout(timer);
  console.error('\n✗ createWallet threw:', err.message);
  if (err.response) {
    try { console.error('  HTTP body:', JSON.stringify(await err.response.json(), null, 2)); }
    catch { console.error('  HTTP status:', err.response.status); }
  }
  process.exit(1);
}

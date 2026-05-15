import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/ethers';
import { ethers } from 'ethers';

function createClient() {
  return new Turnkey({
    apiBaseUrl:            'https://api.turnkey.com',
    apiPublicKey:          process.env.TURNKEY_API_PUBLIC_KEY,
    apiPrivateKey:         process.env.TURNKEY_API_PRIVATE_KEY,
    defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID,
  }).apiClient();
}

export async function createAgentWallet(agentName) {
  try {
    const client     = createClient();
    const uniqueName = `${agentName}-${crypto.randomUUID().slice(0, 8)}`;
    const result = await client.createWallet({
      walletName: uniqueName,
      accounts: [{
        curve:         'CURVE_SECP256K1',
        pathFormat:    'PATH_FORMAT_BIP32',
        path:          "m/44'/60'/0'/0/0",
        addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
      }],
    });
    return {
      walletId:      result.walletId,
      walletAddress: result.addresses[0],
    };
  } catch (err) {
    console.error('[turnkey] createAgentWallet failed:', err.message);
    return null;
  }
}

// Returns an ethers Signer backed by Turnkey for the given EVM wallet address.
// signWith accepts the wallet account address directly — no walletId lookup needed.
export function getAgentSigner(walletAddress) {
  const client   = createClient();
  const provider = new ethers.JsonRpcProvider(
    process.env.NEXT_PUBLIC_ARC_RPC ?? 'https://rpc.testnet.arc.network',
  );
  return new TurnkeySigner(
    {
      client,
      organizationId: process.env.TURNKEY_ORGANIZATION_ID,
      signWith:       walletAddress,
    },
    provider,
  );
}

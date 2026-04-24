import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'crypto';

function createClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_W3S_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

async function generateEntitySecretCiphertext(client) {
  const res = await client.getPublicKey({});
  const publicKey = res.data?.publicKey;
  if (!publicKey) throw new Error('Failed to fetch Circle public key');

  const entitySecretBytes = Buffer.from(process.env.CIRCLE_ENTITY_SECRET, 'hex');
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    entitySecretBytes
  );
  return encrypted.toString('base64');
}

export async function getWalletInfo() {
  const client = createClient();
  const walletId = process.env.CIRCLE_ESCROW_WALLET_ID;

  let balance = '0.00';
  let tokenId = null;
  let blockchain = 'ETH-SEPOLIA';
  let address = process.env.CIRCLE_ESCROW_ADDRESS || '';

  try {
    const walletRes = await client.getWallet({ id: walletId });
    blockchain = walletRes.data?.wallet?.blockchain || blockchain;
    address = walletRes.data?.wallet?.address || address;
  } catch (e) {
    console.warn('Wallet fetch error:', e.message);
  }

  try {
    const balRes = await client.getWalletTokenBalance({ id: walletId });
    const tokenBalances = balRes.data?.tokenBalances || [];
    const usdc = tokenBalances.find(b =>
      b.token?.symbol === 'USDC' || b.token?.name?.toLowerCase().includes('usd coin')
    );
    if (usdc) {
      balance = usdc.amount;
      tokenId = usdc.token?.id;
    }
  } catch (e) {
    console.warn('Balance fetch error:', e.message);
  }

  return { id: walletId, address, blockchain, balance, tokenId };
}

export async function releaseUSDC({ destinationAddress, amount, idempotencyKey }) {
  const client = createClient();
  const walletId = process.env.CIRCLE_ESCROW_WALLET_ID;

  const balRes = await client.getWalletTokenBalance({ id: walletId });
  const tokenBalances = balRes.data?.tokenBalances || [];
  const usdc = tokenBalances.find(b =>
    b.token?.symbol === 'USDC' || b.token?.name?.toLowerCase().includes('usd coin')
  );
  if (!usdc?.token?.id) throw new Error('No USDC token found in escrow wallet');

  const entitySecretCiphertext = await generateEntitySecretCiphertext(client);

  const res = await client.createTransaction({
    walletId,
    tokenId: usdc.token.id,
    amounts: [parseFloat(amount).toFixed(6)],
    destinationAddress,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: idempotencyKey || crypto.randomUUID(),
    entitySecretCiphertext,
  });

  // SDK returns { data: { transaction: {...} } } or { data: {...} }
  return res.data?.transaction ?? res.data;
}

const { ethers } = require('ethers');

const CONTRACT_ADDRESS  = '0x12b2018BAaA60862c00d083B531d54Ce5317B928';
const PLATFORM_WALLET   = '0x9BB9a98478949c6734f7Ca62066C587403b80584';
const RPC_URL           = process.env.NEXT_PUBLIC_ARC_RPC || 'https://rpc.testnet.arc.network';
const DEPLOYER_KEY      = process.env.DEPLOYER_PRIVATE_KEY;

const ABI = [
  'function setPlatformWallet(address wallet)',
  'function setPlatformFee(uint256 fee)',
];

async function main() {
  if (!DEPLOYER_KEY) throw new Error('DEPLOYER_PRIVATE_KEY not set in environment');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(DEPLOYER_KEY, provider);

  console.log('Caller  :', signer.address);
  console.log('Contract:', CONTRACT_ADDRESS);
  console.log('Wallet  :', PLATFORM_WALLET);

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  console.log('\nCalling setPlatformWallet...');
  const tx = await contract.setPlatformWallet(PLATFORM_WALLET);
  console.log('tx hash :', tx.hash);
  const receipt = await tx.wait();
  console.log('Confirmed in block', receipt.blockNumber, '— status:', receipt.status === 1 ? 'OK' : 'FAILED');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

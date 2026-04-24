import { ethers } from 'ethers';
import { ESCROW_ABI, MODE_ID } from './contractABI.js';

function getContract() {
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_ARC_RPC ?? 'https://rpc.testnet.arc.network');
  const signer   = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  return new ethers.Contract(process.env.ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
}

// Deterministic bytes32 ID from the off-chain UUID
export function toBytes32(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

// Called by the API oracle immediately after the off-chain escrow record is saved.
// USDC amount is a human-readable string (e.g. "100.00").
export async function createEscrowOnChain({ uuid, buyer, seller, amount, mode }) {
  const contract  = getContract();
  const bytes32Id = toBytes32(uuid);
  const amountWei = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), 6);
  const modeUint  = MODE_ID[mode] ?? 3;

  const tx      = await contract.createEscrow(bytes32Id, buyer, seller, amountWei, modeUint);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, contractId: bytes32Id };
}

// Called by the API oracle after AI judgment to release USDC to the winner.
export async function resolveOnChain({ uuid, winner }) {
  const contract  = getContract();
  const bytes32Id = toBytes32(uuid);

  const tx      = await contract.resolve(bytes32Id, winner);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

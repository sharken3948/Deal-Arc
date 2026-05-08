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
// USDC amounts are human-readable strings (e.g. "100.00").
export async function createEscrowOnChain({ uuid, buyer, seller, amount, mode, milestoneAmounts = [] }) {
  const contract  = getContract();
  const bytes32Id = toBytes32(uuid);
  const amountWei = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), 6);
  const modeUint  = MODE_ID[mode] ?? 0;
  const msAmounts = milestoneAmounts.map(a => ethers.parseUnits(String(parseFloat(a).toFixed(6)), 6));

  const tx      = await contract.createEscrow(bytes32Id, buyer, seller, amountWei, modeUint, msAmounts);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, contractId: bytes32Id };
}

// Called by the API oracle when the buyer approves a milestone directly (no dispute).
export async function releaseMilestoneOnChain({ uuid, milestoneIndex }) {
  const contract  = getContract();
  const bytes32Id = toBytes32(uuid);

  console.log(`[releaseMilestoneOnChain] escrow=${bytes32Id} index=${milestoneIndex}`);
  const tx      = await contract.releaseMilestone(bytes32Id, milestoneIndex);
  console.log(`[releaseMilestoneOnChain] tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[releaseMilestoneOnChain] confirmed in block ${receipt.blockNumber}`);
  return { txHash: receipt.hash };
}

// Called by the API oracle to resolve a disputed milestone. winner = buyer or seller address.
export async function resolveMilestoneOnChain({ uuid, milestoneIndex, winner }) {
  const contract  = getContract();
  const bytes32Id = toBytes32(uuid);

  console.log(`[resolveMilestoneOnChain] escrow=${bytes32Id} index=${milestoneIndex} winner=${winner}`);
  const tx      = await contract.resolveMilestone(bytes32Id, milestoneIndex, winner);
  console.log(`[resolveMilestoneOnChain] tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[resolveMilestoneOnChain] confirmed in block ${receipt.blockNumber}`);
  return { txHash: receipt.hash };
}

// Called by the API oracle after AI judgment to release USDC to the winner.
export async function resolveOnChain({ uuid, winner }) {
  const contract  = getContract();
  const bytes32Id = toBytes32(uuid);

  console.log(`[resolveOnChain] bytes32Id=${bytes32Id} winner=${winner}`);
  console.log(`[resolveOnChain] contract=${process.env.ESCROW_CONTRACT_ADDRESS} oracle=${(await contract.runner.getAddress?.() ?? 'unknown')}`);

  const onChain = await contract.getEscrow(bytes32Id).catch(e => { throw new Error(`getEscrow failed: ${e.message}`); });
  console.log(`[resolveOnChain] on-chain status=${onChain.status} deliverableHash=${onChain.deliverableHash}`);

  const tx      = await contract.resolve(bytes32Id, winner);
  console.log(`[resolveOnChain] tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[resolveOnChain] confirmed in block ${receipt.blockNumber}`);
  return { txHash: receipt.hash };
}

import { ethers } from 'ethers';
import { ESCROW_ABI, USDC_ABI, USDC_ADDRESS, MODE_ID } from './contractABI.js';

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

// Called by the deposit route: buyer's Turnkey signer approves then deposits USDC.
// signer must be connected to the ARC Testnet provider and backed by the buyer's wallet.
export async function depositOnChain({ uuid, amount, signer }) {
  const bytes32Id = toBytes32(uuid);
  const amountWei = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), 6);
  const escrowAddr = process.env.ESCROW_CONTRACT_ADDRESS;
  const usdcAddr   = process.env.NEXT_PUBLIC_USDC_ADDRESS ?? USDC_ADDRESS;

  const usdc   = new ethers.Contract(usdcAddr,   USDC_ABI,   signer);
  const escrow = new ethers.Contract(escrowAddr,  ESCROW_ABI, signer);

  console.log(`[depositOnChain] approve ${amountWei} USDC to ${escrowAddr}`);
  const approveTx      = await usdc.approve(escrowAddr, amountWei);
  const approveReceipt = await approveTx.wait();
  console.log(`[depositOnChain] approve confirmed: ${approveReceipt.hash}`);

  console.log(`[depositOnChain] deposit escrow ${bytes32Id}`);
  const depositTx      = await escrow.deposit(bytes32Id);
  const depositReceipt = await depositTx.wait();
  console.log(`[depositOnChain] deposit confirmed: ${depositReceipt.hash}`);

  return { approveTxHash: approveReceipt.hash, depositTxHash: depositReceipt.hash };
}

// Called by the submit-proof route: seller registers deliverable hash on-chain before a dispute.
// signer must be the seller's Turnkey-backed wallet.
export async function submitDeliverableOnChain({ uuid, deliverableHash, signer }) {
  const contract  = new ethers.Contract(process.env.ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
  const bytes32Id = toBytes32(uuid);

  console.log(`[submitDeliverableOnChain] escrow=${bytes32Id} deliverableHash=${deliverableHash}`);
  const tx      = await contract.submitDeliverable(bytes32Id, deliverableHash);
  console.log(`[submitDeliverableOnChain] tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[submitDeliverableOnChain] confirmed in block ${receipt.blockNumber}`);
  return { submitTxHash: receipt.hash };
}

// Called by the dispute route when the first party opens a dispute.
// signer must be the disputing party's Turnkey-backed wallet.
export async function disputeOnChain({ uuid, evidenceHash, signer }) {
  const contract  = new ethers.Contract(process.env.ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
  const bytes32Id = toBytes32(uuid);

  console.log(`[disputeOnChain] escrow=${bytes32Id} evidenceHash=${evidenceHash}`);
  const tx      = await contract.dispute(bytes32Id, evidenceHash);
  console.log(`[disputeOnChain] tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[disputeOnChain] confirmed in block ${receipt.blockNumber}`);
  return { disputeTxHash: receipt.hash };
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

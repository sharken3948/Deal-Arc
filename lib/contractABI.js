// Shared between server (lib/contract.js) and client (page components via ethers BrowserProvider)

export const ESCROW_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
  ?? process.env.ESCROW_CONTRACT_ADDRESS;

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
export const ARC_RPC      = 'https://rpc.testnet.arc.network';
export const ARC_CHAIN_ID = 5042002;

// Maps frontend mode strings → contract Mode enum uint8
export const MODE_ID = {
  service:   0, // Mode.Service
  simple:    1, // Mode.Simple
  milestone: 2, // Mode.Milestone
};

// Human-readable ABI used by both server (ethers.JsonRpcProvider) and client (BrowserProvider)
export const ESCROW_ABI = [
  // Write — core
  'function createEscrow(bytes32 id, address buyer, address seller, uint256 amount, uint8 mode, uint256[] milestoneAmounts)',
  'function deposit(bytes32 id)',
  'function approve(bytes32 id)',
  'function dispute(bytes32 id, bytes32 disputeEvidenceHash)',
  'function resolve(bytes32 id, address winner)',
  // Write — ERC-8183
  'function submitDeliverable(bytes32 id, bytes32 deliverableHash)',
  'function submitMilestoneDeliverable(bytes32 id, uint256 index, bytes32 deliverableHash)',
  'function completeJob(bytes32 id)',
  'function rejectJob(bytes32 id)',
  // Write — evidence
  'function submitInitialEvidence(bytes32 id, bytes32 evidenceHash)',
  'function submitDefense(bytes32 id, bytes32 defenseHash)',
  'function submitMilestoneDefense(bytes32 id, uint256 index, bytes32 defenseHash)',
  // Write — milestone
  'function releaseMilestone(bytes32 id, uint256 index)',
  'function disputeMilestone(bytes32 id, uint256 index, bytes32 disputeEvidenceHash)',
  'function resolveMilestone(bytes32 id, uint256 index, address winner)',
  // Write — admin
  'function setPlatformFee(uint256 fee)',
  'function setPlatformWallet(address wallet)',
  // View
  'function getEscrow(bytes32 id) view returns (tuple(bytes32 id, address buyer, address seller, uint256 amount, uint8 mode, uint8 status, bool buyerApproved, bool sellerApproved, bytes32 deliverableHash, bytes32 initialEvidenceHash, bytes32 disputeEvidenceHash, bytes32 defenseEvidenceHash, address disputeInitiator, uint256[] milestoneAmounts, uint8[] milestoneStatuses, bytes32[] milestoneDisputeEvidence, address[] milestoneDisputeInitiators, bytes32[] milestoneDefenseHashes))',
  'function escrowExists(bytes32) view returns (bool)',
  // Events — V1
  'event EscrowCreated(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, uint8 mode)',
  'event Deposited(bytes32 indexed id, address indexed buyer, uint256 amount)',
  'event Approved(bytes32 indexed id, address indexed party, bool buyerApproved, bool sellerApproved)',
  'event Released(bytes32 indexed id, address indexed seller, uint256 amount)',
  'event Disputed(bytes32 indexed id, address indexed initiator)',
  'event Resolved(bytes32 indexed id, address indexed winner, uint256 amount)',
  // Events — V2
  'event DeliverableSubmitted(bytes32 indexed id, bytes32 deliverableHash)',
  'event JobCompleted(bytes32 indexed id, address indexed seller, uint256 amount)',
  'event JobRejected(bytes32 indexed id, address indexed buyer, uint256 amount)',
  'event MilestoneDeliverableSubmitted(bytes32 indexed id, uint256 index, bytes32 deliverableHash)',
  'event MilestoneReleased(bytes32 indexed id, uint256 index, address indexed seller, uint256 amount)',
  'event MilestoneDisputed(bytes32 indexed id, uint256 index, address indexed initiator)',
  'event MilestoneResolved(bytes32 indexed id, uint256 index, address indexed winner, uint256 amount)',
  'event InitialEvidenceSubmitted(bytes32 indexed id, bytes32 evidenceHash)',
  'event DefenseSubmitted(bytes32 indexed id, address indexed party, bytes32 defenseHash)',
  'event MilestoneDefenseSubmitted(bytes32 indexed id, uint256 index, bytes32 defenseHash)',
];

// Returns Rabby's dedicated window.rabby provider, falling back to window.ethereum.
// window.rabby is injected by Rabby separately from window.ethereum and cannot be
// overwritten by other extensions, which avoids the "a[c].bind is not a function" corruption.
export function getRabbyProvider() {
  if (typeof window === 'undefined') return null;
  return window.rabby ?? window.ethereum ?? null;
}

// ARC native USDC (0x3600…) does not implement allowance(); approve + transferFrom work fine.
export const USDC_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

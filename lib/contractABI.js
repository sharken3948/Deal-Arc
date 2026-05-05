// Shared between server (lib/contract.js) and client (page components via ethers BrowserProvider)

export const ESCROW_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
  ?? process.env.ESCROW_CONTRACT_ADDRESS;

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
export const ARC_RPC      = 'https://rpc.testnet.arc.network';
export const ARC_CHAIN_ID = 5042002;

// Maps frontend mode strings → contract Mode enum uint8
export const MODE_ID = {
  service:   0, // Mode.Service
  milestone: 1, // Mode.Milestone
  nft_swap:  2, // Mode.NftSwap
  nft_sale:  0, // no dedicated enum value; treated as Service
  simple:    3, // Mode.Simple
};

// Human-readable ABI used by both server (ethers.JsonRpcProvider) and client (BrowserProvider)
export const ESCROW_ABI = [
  'function createEscrow(bytes32 id, address buyer, address seller, uint256 amount, uint8 mode)',
  'function deposit(bytes32 id)',
  'function approve(bytes32 id)',
  'function dispute(bytes32 id)',
  'function resolve(bytes32 id, address winner)',
  'function getEscrow(bytes32 id) view returns (tuple(bytes32 id, address buyer, address seller, uint256 amount, uint8 mode, uint8 status, bool buyerApproved, bool sellerApproved))',
  'function escrowExists(bytes32) view returns (bool)',
  'event EscrowCreated(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, uint8 mode)',
  'event Deposited(bytes32 indexed id, address indexed buyer, uint256 amount)',
  'event Approved(bytes32 indexed id, address indexed party, bool buyerApproved, bool sellerApproved)',
  'event Released(bytes32 indexed id, address indexed seller, uint256 amount)',
  'event Disputed(bytes32 indexed id, address indexed initiator)',
  'event Resolved(bytes32 indexed id, address indexed winner, uint256 amount)',
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

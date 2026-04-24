# DealARC

> *"Set your terms. Lock assets. Shake hands on-chain. Disagree? AI judge rules no exceptions."*

DealARC is an AI-powered escrow platform built on ARC Testnet. Parties lock USDC and NFTs into a trustless smart contract, and Claude AI evaluates delivery, judges fairness, and resolves disputes — all on-chain.

---

## Features

- **5 escrow modes** for different deal structures
- **Claude AI judge** evaluates proof of delivery and resolves disputes automatically
- **On-chain settlement** via a deployed Solidity escrow contract
- **MetaMask integration** with automatic ARC Testnet network switching
- **Full transaction history** — every on-chain event linked to the block explorer

---

## Escrow Modes

| Mode | Description |
|---|---|
| **Service & Product** | Buyer locks USDC. Seller submits proof of delivery. Claude AI evaluates completion and both parties approve to release. |
| **NFT Swap** | Two parties exchange NFTs with an optional USDC sweetener. Claude AI evaluates swap fairness at creation. |
| **NFT Sale** | Seller lists an NFT, buyer pays USDC. Claude AI assesses price fairness at creation. |
| **Milestone** | Full USDC amount locked upfront. Seller submits proof per milestone. Claude releases payments progressively as milestones are approved. |
| **Simple Transfer** | Buyer locks USDC. Both parties approve to release. No AI judge — pure mutual agreement. |

### Escrow Lifecycle

```
pending_deposit → active → proof_submitted → completed
                                           ↘ disputed → resolved
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Smart Contract | Solidity 0.8.20, OpenZeppelin v5, Hardhat |
| Wallet | ethers.js v6, MetaMask (EIP-1193) |
| AI Judge | Claude AI via Anthropic SDK (`claude-sonnet-4-6`) |
| Wallet Infrastructure | Circle Developer Controlled Wallets (W3S) |
| Blockchain | ARC Testnet (Chain ID: 5042002) |
| Data | File-based JSON store (`data/escrows.json`) |

---

## Smart Contract

| | |
|---|---|
| **Address** | [`0x60E3684a851C18f0586472E5dc26437456DaEE61`](https://testnet.arcscan.app/address/0x60E3684a851C18f0586472E5dc26437456DaEE61) |
| **Network** | ARC Testnet |
| **USDC** | `0x3600000000000000000000000000000000000000` (native system contract) |
| **Explorer** | [testnet.arcscan.app](https://testnet.arcscan.app) |

The contract manages escrow lifecycle on-chain: creation, USDC deposit, dual-party approval, dispute flagging, and oracle-driven resolution. The Next.js API routes act as a trusted oracle — calling `resolve()` on-chain after Claude AI delivers a verdict.

---

## Prerequisites

- Node.js 18+
- MetaMask (or any EIP-1193 wallet) with ARC Testnet added
- A [Circle Developer account](https://console.circle.com) with a Developer Controlled Wallet set up
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Circle Developer Controlled Wallets
CIRCLE_W3S_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret_hex
CIRCLE_WALLET_SET_ID=your_wallet_set_id
CIRCLE_ESCROW_WALLET_ID=your_escrow_wallet_id
CIRCLE_ESCROW_ADDRESS=your_escrow_wallet_address
NEXT_PUBLIC_ESCROW_ADDRESS=your_escrow_wallet_address

# Claude AI Judge
ANTHROPIC_API_KEY=your_anthropic_api_key

# Smart Contract (ARC Testnet)
ESCROW_CONTRACT_ADDRESS=0x60E3684a851C18f0586472E5dc26437456DaEE61
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x60E3684a851C18f0586472E5dc26437456DaEE61

# ARC Testnet (public — safe to commit)
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_CHAIN_ID=5042002

# Deployer key (only needed to redeploy the contract)
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
```

### 3. One-time cipher setup (Circle W3S)

```bash
node generate-cipher.mjs
node get-cipher.mjs
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying the Contract

To deploy a new instance of `ArcEscrow.sol` to ARC Testnet:

```bash
npx hardhat run scripts/deploy.js --network arc_testnet
```

The script automatically updates `ESCROW_CONTRACT_ADDRESS` and `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` in `.env.local`. Restart the dev server after deployment.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `CIRCLE_W3S_API_KEY` | Yes | Circle Developer Controlled Wallets API key |
| `CIRCLE_ENTITY_SECRET` | Yes | Circle entity secret (hex) for signing transactions |
| `CIRCLE_WALLET_SET_ID` | Yes | Circle wallet set ID |
| `CIRCLE_ESCROW_WALLET_ID` | Yes | Circle escrow wallet ID |
| `CIRCLE_ESCROW_ADDRESS` | Yes | Escrow wallet blockchain address |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | Yes | Same as above, exposed to the client |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude AI judge |
| `ESCROW_CONTRACT_ADDRESS` | Yes | Deployed `ArcEscrow` contract address (server) |
| `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` | Yes | Deployed `ArcEscrow` contract address (client) |
| `NEXT_PUBLIC_USDC_ADDRESS` | Yes | ARC native USDC contract address |
| `NEXT_PUBLIC_ARC_RPC` | Yes | ARC Testnet RPC URL |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | Yes | ARC Testnet chain ID (`5042002`) |
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Private key of the contract deployer wallet |

---

## Project Structure

```
├── app/
│   ├── api/escrow/          # REST API routes (escrow CRUD, deposit, approve, dispute)
│   ├── components/          # Shared UI components (Navbar, EscrowCard, AIJudgmentPanel…)
│   ├── contexts/            # WalletContext (MetaMask state, chain switching)
│   ├── escrow/
│   │   ├── [id]/page.js     # Escrow detail page (overview, actions, history tabs)
│   │   └── create/page.js   # Multi-step escrow creation form
│   └── page.js              # Dashboard
├── contracts/
│   └── ArcEscrow.sol        # Solidity escrow contract
├── lib/
│   ├── circle.js            # Circle W3S SDK wrapper
│   ├── claude.js            # Claude AI judge functions
│   ├── contract.js          # ethers.js server-side contract calls (oracle)
│   ├── contractABI.js       # Shared ABI + chain constants
│   └── storage.js           # JSON file-based escrow store
├── scripts/
│   └── deploy.js            # Hardhat deploy script
└── data/
    └── escrows.json         # Persistent escrow data (created on first run)
```

---

## License

MIT

# DealARC

> *"Set your terms. Lock assets. Shake hands onchain. Disagree? AI judge rules no exceptions."*

DealARC is an AI-powered escrow platform built on ARC Testnet. Parties lock USDC and NFTs into a trustless smart contract, and Claude AI evaluates delivery, judges fairness, and resolves disputes — all onchain.

---

## Features

- **5 escrow modes** for different deal structures
- **Claude AI judge** evaluates proof of delivery and resolves disputes automatically
- **Onchain settlement** via a deployed Solidity escrow contract
- **MetaMask integration** with automatic ARC Testnet network switching
- **Full transaction history** — every onchain event linked to the block explorer

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
| Vision AI | Groq (vision-capable model for image evidence) |
| Agent Wallet Infrastructure | Turnkey secure enclave (EVM wallets) |
| Blockchain | ARC Testnet (Chain ID: 5042002) |
| Proof Storage | IPFS via Pinata |
| Off-chain State | Upstash KV |
| Data | File-based JSON store (`data/escrows.json`) |

---

## Smart Contract

| | |
|---|---|
| **Address** | [`0x12b2018BAaA60862c00d083B531d54Ce5317B928`](https://testnet.arcscan.app/address/0x12b2018BAaA60862c00d083B531d54Ce5317B928) |
| **Network** | ARC Testnet |
| **USDC** | `0x3600000000000000000000000000000000000000` (native system contract) |
| **Explorer** | [testnet.arcscan.app](https://testnet.arcscan.app) |

The contract manages escrow lifecycle onchain: creation, USDC deposit, dual-party approval, dispute flagging, and oracle-driven resolution. The Next.js API routes act as a trusted oracle — calling `resolve()` onchain after Claude AI delivers a verdict.

---

## Agent API

DealARC exposes a full agent API for autonomous A2A commerce. Agents register via API, receive a Turnkey-provisioned EVM wallet, and transact in USDC without human intervention. All agent endpoints are protected by x402 micropayments.

- **Full documentation:** https://deal-arc.vercel.app/docs
- **Service manifest:** https://deal-arc.vercel.app/agent.json

---

## Prerequisites

- Node.js 18+
- MetaMask (or any EIP-1193 wallet) with ARC Testnet added
- A [Turnkey account](https://app.turnkey.com) for agent wallet provisioning
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
# Turnkey (agent wallet provisioning)
TURNKEY_API_PUBLIC_KEY=your_turnkey_api_public_key
TURNKEY_API_PRIVATE_KEY=your_turnkey_api_private_key
TURNKEY_ORGANIZATION_ID=your_turnkey_organization_id

# Claude AI Judge
ANTHROPIC_API_KEY=your_anthropic_api_key

# Groq (vision evidence)
GROQ_API_KEY=your_groq_api_key

# Pinata (IPFS proof storage)
PINATA_JWT=your_pinata_jwt

# Upstash KV (off-chain state)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Smart Contract (ARC Testnet)
ESCROW_CONTRACT_ADDRESS=0x12b2018BAaA60862c00d083B531d54Ce5317B928
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x12b2018BAaA60862c00d083B531d54Ce5317B928

# ARC Testnet (public — safe to commit)
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_CHAIN_ID=5042002

# Deployer key (only needed to redeploy the contract)
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
```

### 3. Run the development server

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
| `TURNKEY_API_PUBLIC_KEY` | Yes | Turnkey API public key for agent wallet provisioning |
| `TURNKEY_API_PRIVATE_KEY` | Yes | Turnkey API private key for signing wallet requests |
| `TURNKEY_ORGANIZATION_ID` | Yes | Turnkey organization ID |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude AI judge |
| `GROQ_API_KEY` | Yes | Groq API key for vision-based evidence analysis |
| `PINATA_JWT` | Yes | Pinata JWT for IPFS proof storage |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash KV REST URL for off-chain state |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash KV REST token |
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
│   ├── api/agent/           # Agent API routes (register, create-escrow, dispute, upload…)
│   ├── components/          # Shared UI components (Navbar, EscrowCard, AIJudgmentPanel…)
│   ├── contexts/            # WalletContext (MetaMask state, chain switching)
│   ├── escrow/
│   │   ├── [id]/page.js     # Escrow detail page (overview, actions, history tabs)
│   │   └── create/page.js   # Multi-step escrow creation form
│   └── page.js              # Dashboard
├── contracts/
│   └── ArcEscrow.sol        # Solidity escrow contract
├── lib/
│   ├── turnkey.js           # Turnkey SDK wrapper (agent wallet provisioning)
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

# DealARC

> *"Set your terms. Lock USDC. Shake hands onchain. Disagree? AI Judge rules — no exceptions."*

DealARC is an onchain escrow protocol for P2P and A2A commerce built on Arc Testnet. Buyers lock USDC into a smart contract, sellers submit proof of delivery, and an AI Judge resolves disputes automatically. Both humans and autonomous AI agents can participate.

---

## Features

- **P2P escrow** — simple, milestone, and service modes for human-to-human deals
- **A2A escrow** — AI agents register via API, receive Turnkey-provisioned EVM wallets, and transact autonomously in USDC
- **AI Judge** — Claude (Anthropic) evaluates text-based claims; Groq analyses image evidence
- **x402 micropayments** — all agent API endpoints are pay-per-call via Circle x402
- **IPFS proof storage** — delivery proof anchored to IPFS via Pinata
- **Workers Directory** — public registry of agents and persons at `/workers` with onchain reputation scores
- **Reputation system** — completed deals, success rate, and dispute rate tracked per wallet address
- **Developer docs** — full API reference at `/docs`
- **Machine-readable manifest** — service discovery at `/agent.json`

---

## Escrow Modes

| Mode | Description |
|---|---|
| **Service** | Buyer locks USDC. Seller submits proof of delivery. Both approve to release or either party disputes. |
| **Milestone** | Full amount locked upfront. Seller submits proof per milestone. Funds released progressively as each milestone is approved. |
| **Simple** | Buyer locks USDC. Both parties approve to release. No AI judge — pure mutual agreement. |

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
| Blockchain | Arc Testnet (Chain ID: 5042002) |
| Wallet | ethers.js v6, MetaMask (EIP-1193) |
| Agent Wallets | Turnkey secure enclave (Turnkey-provisioned EVM wallets) |
| AI Judge — Text | Claude via Anthropic SDK (`claude-sonnet-4-6`) |
| AI Judge — Vision | Groq (vision-capable model for image evidence) |
| Agent Payments | x402 micropayments |
| Proof Storage | IPFS via Pinata |
| Off-chain State | Upstash KV |
| Deployment | Vercel |

---

## Smart Contract

| | |
|---|---|
| **Address** | [`0x12b2018BAaA60862c00d083B531d54Ce5317B928`](https://testnet.arcscan.app/address/0x12b2018BAaA60862c00d083B531d54Ce5317B928) |
| **Network** | Arc Testnet |
| **USDC** | `0x3600000000000000000000000000000000000000` (native system contract) |
| **Explorer** | [testnet.arcscan.app](https://testnet.arcscan.app) |

The contract manages the full escrow lifecycle onchain: creation, USDC deposit, dual-party approval, dispute flagging, and oracle-driven resolution. The Next.js API routes act as a trusted oracle — calling `resolve()` onchain after the AI Judge delivers a verdict.

---

## Agent API

DealARC exposes a full REST API for autonomous A2A commerce. Agents register via API, receive a Turnkey-provisioned EVM wallet, and transact in USDC without human intervention. All agent endpoints require an API key and are protected by x402 micropayments.

| Endpoint | Description |
|---|---|
| `POST /api/agent/register` | Register an agent, receive API key + EVM wallet |
| `POST /api/agent/create-escrow` | Create a simple or milestone escrow |
| `POST /api/agent/deposit` | Mark escrow as funded |
| `POST /api/agent/submit-proof` | Submit IPFS-backed proof of delivery |
| `POST /api/agent/release` | Approve fund release |
| `POST /api/agent/dispute` | File a dispute for AI Judge resolution |
| `GET /api/agent/status` | Get escrow status and AI judgment |
| `POST /api/upload` | Upload image evidence to IPFS |
| `GET /api/agent/reputation` | Get reputation stats for any address (no auth) |
| `GET /api/agent/directory` | Get all registered workers (no auth) |

- **Full documentation:** https://deal-arc.vercel.app/docs
- **Service manifest:** https://deal-arc.vercel.app/agent.json

---

## Security

**P2P (Human users)**
- Cloudflare Turnstile captcha on escrow creation — prevents bot spam

**A2A (AI Agents)**
- API key authentication on all agent endpoints
- x402 micropayment enforcement per request
- Rate limiting: 30 requests/minute, 200 requests/hour per API key (Upstash KV)

**Env vars required:**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key (public)
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret key (server only)

---

## Workers Directory

DealARC maintains a public registry of all workers — both AI agents and human persons — at `/workers`. Each entry shows:

- Wallet address (shortened, copyable)
- Worker type: **AI Agent** (registered via API) or **Person** (participated via UI)
- Completed deals, success rate, dispute rate, disputes won
- Registration date

Type is assigned automatically: agents who register via the API are typed `agent`; wallet-connected humans who complete escrows via the UI are typed `person`. Search by wallet address to verify reputation history.

**Reputation API:** `GET /api/agent/reputation?address=0x...` — no authentication required.

---

## Prerequisites

- Node.js 18+
- MetaMask (or any EIP-1193 wallet) with Arc Testnet added
- A [Turnkey account](https://app.turnkey.com) for agent wallet provisioning
- An [Anthropic API key](https://console.anthropic.com)
- A [Groq API key](https://console.groq.com)
- A [Pinata account](https://pinata.cloud) for IPFS storage
- An [Upstash](https://upstash.com) Redis database

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

# Upstash KV (off-chain state + reputation)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Smart Contract (Arc Testnet)
ESCROW_CONTRACT_ADDRESS=0x12b2018BAaA60862c00d083B531d54Ce5317B928
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x12b2018BAaA60862c00d083B531d54Ce5317B928

# Arc Testnet (public — safe to commit)
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

To deploy a new instance of `ArcEscrow.sol` to Arc Testnet:

```bash
npx hardhat run scripts/deploy.js --network arc_testnet
```

Update `ESCROW_CONTRACT_ADDRESS` and `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` in `.env.local` with the new address, then restart the dev server.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `TURNKEY_API_PUBLIC_KEY` | Yes | Turnkey API public key |
| `TURNKEY_API_PRIVATE_KEY` | Yes | Turnkey API private key |
| `TURNKEY_ORGANIZATION_ID` | Yes | Turnkey organization ID |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude AI Judge |
| `GROQ_API_KEY` | Yes | Groq API key for vision evidence analysis |
| `PINATA_JWT` | Yes | Pinata JWT for IPFS proof storage |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash KV REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash KV REST token |
| `ESCROW_CONTRACT_ADDRESS` | Yes | Deployed `ArcEscrow` contract address (server) |
| `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` | Yes | Deployed `ArcEscrow` contract address (client) |
| `NEXT_PUBLIC_USDC_ADDRESS` | Yes | Arc native USDC contract address |
| `NEXT_PUBLIC_ARC_RPC` | Yes | Arc Testnet RPC URL |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | Yes | Arc Testnet chain ID (`5042002`) |
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Private key of the contract deployer |

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── agent/           # Agent API (register, create-escrow, deposit, release, dispute,
│   │   │                    #            submit-proof, upload, status, reputation, directory)
│   │   ├── escrow/          # UI escrow routes ([id]/approve, deposit, dispute, milestone, proof)
│   │   └── dispute/         # Dispute resolution (respond, resolve, check-deadlines)
│   ├── components/          # Shared UI (Navbar, EscrowCard, AIJudgmentPanel, StatusBadge…)
│   ├── contexts/            # WalletContext (MetaMask state, chain switching)
│   ├── docs/                # Developer documentation page
│   ├── workers/             # Workers Directory page (filterable by agent / person)
│   ├── escrow/
│   │   ├── [id]/page.js     # Escrow detail (overview, actions, history)
│   │   └── create/page.js   # Escrow creation form
│   └── page.js              # Home / dashboard
├── contracts/
│   └── ArcEscrow.sol        # Solidity escrow contract
├── lib/
│   ├── turnkey.js           # Turnkey SDK wrapper (agent wallet provisioning)
│   ├── claude.js            # Claude AI Judge functions
│   ├── reputation.js        # Upstash KV reputation helpers (increment, get, setPersonType)
│   ├── contract.js          # ethers.js server-side contract calls (oracle)
│   ├── contractABI.js       # Shared ABI + chain constants
│   ├── agentAuth.js         # API key authentication middleware
│   ├── x402.js              # x402 micropayment wrapper
│   └── storage.js           # JSON file-based escrow store
├── public/
│   └── agent.json           # Machine-readable service manifest
├── scripts/
│   └── deploy.js            # Hardhat deploy script
└── data/
    └── escrows.json         # Persistent escrow data (created on first run)
```

---

## License

MIT

# DealARC /docs Page — Claude Code Prompt

## Komut

Create a new page at `pages/docs.js` (or `app/docs/page.js` depending on project structure) with the following documentation content. Style it professionally — dark theme, monospace fonts for code blocks, clean sidebar navigation. Match DealARC's existing color scheme if possible.

---

## Page Content

### Title
DealARC Developer Documentation

### Subtitle
Onchain escrow infrastructure for AI agents and P2P commerce on Arc Network.

---

## Section 1: Overview

DealARC is an onchain escrow protocol built on Arc Testnet. It enables two parties — human or AI agent — to transact trustlessly using USDC. Funds are locked in a smart contract, released automatically on agreement, or resolved by an AI Judge in case of dispute.

**Key capabilities:**
- Agent registration with instant Turnkey-provisioned EVM wallet
- Simple and milestone-based escrow creation
- IPFS-backed proof of delivery
- AI-powered dispute resolution (Claude + Groq vision)
- x402 pay-per-call micropayments on all agent endpoints
- Automatic dispute deadline enforcement (24h)

**Base URL:** `https://deal-arc.vercel.app`

---

## Section 2: Quick Start

Three steps to create your first escrow as an agent.

**Step 1 — Register and get your API key**

```bash
POST /api/agent/register
Content-Type: application/json

{
  "name": "my-agent",
  "description": "What your agent does"
}
```

Response:
```json
{
  "apiKey": "your-api-key",
  "walletAddress": "0x...",
  "message": "Agent registered successfully"
}
```

**Step 2 — Create an escrow**

```bash
POST /api/agent/create-escrow
x-api-key: your-api-key
Content-Type: application/json

{
  "title": "Logo design project",
  "amount": 100,
  "sellerAddress": "0x...",
  "description": "Design a logo for my startup"
}
```

**Step 3 — Check status**

```bash
GET /api/agent/status?id=escrow-id
x-api-key: your-api-key
```

---

## Section 3: Authentication

All agent endpoints require an API key obtained via `/api/agent/register`.

Include the key in every request header:
```
x-api-key: your-api-key
```

Agent endpoints are also protected by x402 micropayments. A small USDC fee is charged per API call via Circle Gateway. This happens automatically when you use the DealARC SDK or compatible x402 client.

The `/api/agent/register` endpoint is open and does not require a key.

---

## Section 4: Agent Endpoints

### POST /api/agent/register
Register a new agent. Creates a Turnkey-provisioned EVM wallet. Private key never leaves Turnkey's secure enclave.

**Request:**
```json
{
  "name": "string (required)",
  "description": "string (optional)"
}
```

**Response:**
```json
{
  "apiKey": "string",
  "walletAddress": "0x...",
  "message": "Agent registered successfully"
}
```

---

### POST /api/agent/create-escrow
Create a simple or milestone-based escrow on Arc.

**Request:**
```json
{
  "title": "string (required)",
  "amount": "number in USDC (required)",
  "sellerAddress": "0x... (required)",
  "description": "string (optional)",
  "milestones": [
    {
      "title": "string",
      "amount": "number",
      "description": "string"
    }
  ]
}
```

**Response:**
```json
{
  "escrowId": "string",
  "status": "pending_deposit",
  "contractAddress": "0x...",
  "amount": 100,
  "createdAt": "ISO timestamp"
}
```

---

### POST /api/agent/deposit
Mark escrow as funded. Transitions status from `pending_deposit` to `active`.

**Request:**
```json
{
  "escrowId": "string (required)",
  "txHash": "0x... (optional — onchain tx reference)"
}
```

---

### POST /api/agent/submit-proof
Seller submits proof of work. Proof hash is stored on IPFS via Pinata and anchored onchain.

**Request:**
```json
{
  "escrowId": "string (required)",
  "proofText": "string — description of work done",
  "proofUrl": "string — link to deliverable (optional)"
}
```

**Response:**
```json
{
  "ipfsHash": "Qm...",
  "onchainTx": "0x...",
  "status": "proof_submitted"
}
```

---

### POST /api/agent/release
Buyer or seller approves fund release. Escrow completes when both parties approve.

**Request:**
```json
{
  "escrowId": "string (required)",
  "role": "buyer | seller (required)"
}
```

---

### POST /api/agent/dispute
File a dispute. When both parties submit a dispute claim, the AI Judge (Claude + Groq vision) analyzes evidence and resolves onchain automatically.

**Request:**
```json
{
  "escrowId": "string (required)",
  "reason": "string (required)",
  "evidence": "string — additional context or proof (optional)"
}
```

**Response:**
```json
{
  "disputeId": "string",
  "deadline": "ISO timestamp — 24h for seller to respond",
  "status": "dispute_filed"
}
```

---

### GET /api/agent/status
Check escrow status by ID.

**Query:**
```
GET /api/agent/status?id=escrow-id
```

**Response:**
```json
{
  "escrowId": "string",
  "status": "active | pending_deposit | proof_submitted | disputed | completed | resolved",
  "buyer": "0x...",
  "seller": "0x...",
  "amount": 100,
  "milestones": [],
  "aiJudgment": {
    "verdict": "FAVOR_BUYER | FAVOR_SELLER",
    "confidence": 80,
    "reasoning": "string"
  }
}
```

---

## Section 5: Escrow Flow

```
1. Buyer registers → receives wallet + API key
2. Buyer creates escrow → status: pending_deposit
3. Buyer deposits USDC → status: active
4. Seller submits proof → IPFS hash stored onchain
5a. Both approve → escrow completes, funds released
5b. Dispute filed → AI Judge resolves within 24h
```

---

## Section 6: Dispute System

DealARC uses two AI providers for dispute resolution:

**Claude (Anthropic)** handles text-based judgment — reads both parties' claims, weighs evidence, outputs a verdict with confidence score.

**Groq (vision-capable)** analyzes image-based evidence when visual proof is submitted.

**Verdict format:**
```
FAVOR BUYER — 80% confidence
FAVOR SELLER — 91% confidence
```

**Automatic deadline enforcement:**
If the seller does not respond within 24 hours of a dispute being filed, `/api/dispute/check-deadlines` (cron job) auto-resolves in the buyer's favor.

**Resolution is final and executed onchain** via Turnkey-signed transaction.

---

## Section 7: Milestone Escrow

For complex projects, escrows can be broken into milestones.

Each milestone has its own amount and can be approved or disputed independently.

**Create with milestones:**
```json
{
  "title": "Website redesign",
  "amount": 500,
  "sellerAddress": "0x...",
  "milestones": [
    { "title": "Wireframes", "amount": 100, "description": "Initial design mockups" },
    { "title": "Development", "amount": 300, "description": "Full implementation" },
    { "title": "Testing", "amount": 100, "description": "QA and revisions" }
  ]
}
```

**Milestone actions:**
- `POST /api/escrow/[id]/milestone` — seller submits milestone proof
- `PUT /api/escrow/[id]/milestone` — buyer approves or disputes a milestone

---

## Section 8: Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing or invalid parameters |
| 401 | Unauthorized — invalid or missing API key |
| 402 | Payment required — x402 micropayment needed |
| 404 | Escrow not found |
| 409 | Conflict — action not allowed in current status |
| 500 | Internal server error |

---

## Section 9: Stack

| Component | Technology |
|-----------|-----------|
| Network | Arc Testnet |
| Smart contract | Solidity — 0x12b2018BAaA60862c00d083B531d54Ce5317B928 |
| Wallet signing | Turnkey secure enclave |
| Payments | Circle USDC |
| Agent payments | x402 + Circle Gateway |
| Proof storage | IPFS via Pinata |
| AI Judge | Claude (Anthropic) + Groq vision |
| Off-chain state | Upstash KV |
| Framework | Next.js |
| Deployment | Vercel |

---

## Section 10: Links

- Live app: https://deal-arc.vercel.app
- GitHub: https://github.com/sharken3948/Deal-Arc
- Contract: 0x12b2018BAaA60862c00d083B531d54Ce5317B928 on Arc Testnet
- Arc Explorer: https://explorer.arc.io

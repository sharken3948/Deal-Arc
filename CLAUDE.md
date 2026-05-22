# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

**Note:** `npm run dev` automatically sets `NODE_PATH=$(pwd)/node_modules`. This is required because Next.js 16 Turbopack runs its PostCSS worker outside the project directory, and the project is on the Windows filesystem (`/mnt/c/...`) via WSL. The `.next` build directory is symlinked to `/home/gurka/circle-next-dist` on the Linux filesystem to avoid NTFS permission issues.

One-time cipher setup scripts (run with `node`):
```bash
node generate-cipher.mjs
node get-cipher.mjs
```

## Environment Variables (`.env.local`)

| Variable | Purpose |
|---|---|
| `TURNKEY_API_PUBLIC_KEY` | Turnkey API public key |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret for signing |
| `CIRCLE_WALLET_SET_ID` | Circle wallet set ID |
| `CIRCLE_ESCROW_WALLET_ID` | The escrow wallet ID (ARC-TESTNET) |
| `CIRCLE_ESCROW_ADDRESS` | The escrow wallet's blockchain address |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | Same address, exposed to client |
| `ANTHROPIC_API_KEY` | Claude AI judge API key |

## Architecture

Next.js 16 App Router, React 19, Tailwind CSS v4. Data persisted in `data/escrows.json` (created on first run).

### 4 Escrow Modes
1. **Service & Product** (`service`) — Buyer locks USDC, seller submits proof, Claude AI judges completion, both approve to release
2. **NFT Swap** (`nft_swap`) — Two parties swap NFTs with optional USDC sweetener; Claude evaluates fairness at creation
3. **NFT Sale** (`nft_sale`) — Seller lists NFT, buyer pays USDC; Claude evaluates price at creation
4. **Milestone** (`milestone`) — Total USDC locked upfront, seller submits per-milestone proof, Claude releases payments progressively

### Escrow Lifecycle
```
pending_deposit → active → proof_submitted → (disputed | completed)
```
Both parties must approve (or AI auto-approves on milestone/NFT) to trigger `releaseUSDC()`.

### Key Library Modules
- `lib/storage.js` — File-based JSON escrow store (CRUD operations)
- `lib/circle.js` — Circle SDK wrapper: `getWalletInfo()`, `releaseUSDC({ destinationAddress, amount })`
- `lib/claude.js` — Claude AI judge: `judgeServiceCompletion`, `judgeMilestone`, `judgeNFTSwap`, `judgeNFTSale`, `resolveDispute`

### Circle SDK Methods Used
- `client.getWallet({ id })` — wallet info
- `client.getWalletTokenBalance({ id })` → `response.data.tokenBalances[]`
- `client.createTransaction({ walletId, tokenId, amount: [str], destinationAddress, fee: { type:'level', config:{ feeLevel:'MEDIUM' } } })` — transfers USDC

### API Routes
| Route | Methods | Purpose |
|---|---|---|
| `/api/wallet` | GET | Escrow wallet balance + address |
| `/api/escrow` | GET, POST | List / create escrows |
| `/api/escrow/[id]` | GET, PATCH | Get / update escrow |
| `/api/escrow/[id]/deposit` | POST | Mark deposit confirmed, activate escrow |
| `/api/escrow/[id]/proof` | POST | Seller submits proof → triggers Claude judgment |
| `/api/escrow/[id]/approve` | POST | Party approves; both approved → auto-release USDC |
| `/api/escrow/[id]/dispute` | POST | Party raises dispute; both claims in → Claude resolves + releases |
| `/api/escrow/[id]/milestone` | POST (submit), PUT (buyer approve) | Milestone proof → Claude → release |

### UI Pages & Components
- `app/page.js` — Dashboard with stats, wallet balance, escrow list, filters
- `app/escrow/create/page.js` — Multi-step create form (mode select → details → review → deposit instructions)
- `app/escrow/[id]/page.js` — Escrow detail with Overview / Actions / History tabs
- `app/components/AIJudgmentPanel.js` — Verdict display with confidence bar and reasoning
- `app/components/MilestoneList.js` — Collapsible milestone timeline with per-milestone proof submission
- `app/contexts/WalletContext.js` — MetaMask connection state (address, connect, disconnect)

### Design System
Dark theme (`#030309` background). Custom CSS classes: `.glass`, `.glass-hover`, `.gradient-text`, `.btn-primary`, `.shimmer`. Purple-to-blue gradient accents (`#7c3aed` → `#2563eb`).

### USDC Deposit Flow
Turnkey provisions the escrow wallet (agent signing via secure enclave). Users send USDC directly from MetaMask to `CIRCLE_ESCROW_ADDRESS`. After sending, they click "I Have Sent the USDC" which calls `POST /api/escrow/[id]/deposit` to activate the escrow. Releases are signed by the Turnkey-provisioned escrow wallet.

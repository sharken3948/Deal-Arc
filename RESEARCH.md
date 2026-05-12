# Circle Agent Stack Research

## Testing Log — May 12, 2026

## What We Built
- Circle CLI v0.0.1 installed successfully
- Agent Wallet created: 0x9c64a4b718367e1f9ae070d22729a5150642d89e (BASE mainnet)
- Circle skill installed into Claude Code

## Test Results by Chain

### ARC Testnet
- CLI installed, Agent Wallet created, faucet USDC received (20 USDC)
- Gateway deposit not supported — ARC Testnet USDC is native token (isNative: true, 18 decimals), gateway requires ERC-20 USDC
- Note: This is a current limitation of Circle CLI v0.0.1, not a bug

### Base Sepolia (Testnet)
- Wallet funded with 20 USDC via Circle faucet
- Gateway deposit confirmed on-chain
- Balance reflects after ~15-20 minute indexing delay
- Partial success — no x402 services available on testnet

### BASE Mainnet — Full End-to-End Success ✅
- Wallet funded with 2 USDC
- 1 USDC deposited to Gateway via direct method
- ~15-20 minute indexing delay before balance reflected
- Paid $0.004 USDC for StableTravel TAF weather API (KJFK) via x402
- Full flow completed successfully

## Key Learnings
- Gateway balance requires --chain MATIC-AMOY flag to display correctly
- eco deposit method lands on Polygon (domain 7), direct method stays on source chain
- All x402 services currently require mainnet USDC — no testnet support yet
- Circle skill install: `circle skill install --tool claude-code`

## DealARC Integration Plan
- Agent Wallets → autonomous escrow creation
- x402 → DealARC API monetization for agents
- A2A disputes → AI Judge → on-chain verdict

# DealARC MCP Server

Give any MCP-compatible AI assistant — Claude Desktop, Cursor, Windsurf, or your own agent — the ability to create and settle USDC escrows natively on Arc.

---

## Prerequisites

- Node.js 18+
- A DealARC API key (`AGENT_API_KEY`)

---

## Installation

The MCP server lives in the project root as `mcp-server.js`. No separate package install needed — it uses the `@modelcontextprotocol/sdk` and `zod` already installed in the project.

```bash
# From the circle-dapp project root:
npm install   # ensures @modelcontextprotocol/sdk is present
```

---

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "dealarc": {
      "command": "node",
      "args": ["/absolute/path/to/circle-dapp/mcp-server.js"],
      "env": {
        "AGENT_API_KEY": "dealarc-agent-2026",
        "NEXT_PUBLIC_APP_URL": "https://deal-arc.vercel.app"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor / Windsurf

In `.cursor/mcp.json` or `.windsurf/mcp.json` at your project root:

```json
{
  "mcpServers": {
    "dealarc": {
      "command": "node",
      "args": ["./mcp-server.js"],
      "env": {
        "AGENT_API_KEY": "dealarc-agent-2026",
        "NEXT_PUBLIC_APP_URL": "https://deal-arc.vercel.app"
      }
    }
  }
}
```

### Local development (against localhost)

```json
{
  "mcpServers": {
    "dealarc": {
      "command": "node",
      "args": ["/path/to/circle-dapp/mcp-server.js"],
      "env": {
        "AGENT_API_KEY": "dealarc-agent-2026",
        "NEXT_PUBLIC_APP_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Available Tools

Once connected, the assistant has access to four tools:

### `create_escrow`

Create a trustless USDC escrow between two parties.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Short deal title |
| `buyer` | string | yes | Buyer's Ethereum address |
| `seller` | string | yes | Seller's Ethereum address |
| `amount` | string | yes | Total USDC amount, e.g. `"250.00"` |
| `mode` | `"simple"` \| `"milestone"` | no | Default: `"simple"` |
| `description` | string | no | Longer deal description |
| `requirements` | string | no | Acceptance criteria |
| `milestones` | array | no | Required when `mode` is `"milestone"` |

**Returns:** `{ id, status, contractId, amount, mode }`

---

### `check_status`

Check the current state of an escrow.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrow_id` | string | yes | UUID returned by `create_escrow` |

**Returns:** Full escrow record including `status`, `buyer`, `seller`, `milestones`, `aiJudgment`, `releaseTx`.

Possible statuses: `pending_deposit` → `active` → `proof_submitted` → `disputed` → `completed`

---

### `release_payment`

Approve and release payment. Both buyer and seller must call this. USDC is released automatically once both have approved.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrow_id` | string | yes | UUID of the escrow |
| `address` | string | yes | Approving party's address |
| `tx_hash` | string | no | Optional on-chain tx hash |

**Returns:** `{ status: "completed" }` when both parties have approved, or `{ pendingOtherParty: true }` if waiting.

---

### `open_dispute`

File a dispute claim. Once **both** parties have filed claims, Claude AI judges the case automatically and the smart contract executes the verdict — no human required.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrow_id` | string | yes | UUID of the escrow |
| `address` | string | yes | Disputing party's address |
| `claim` | string | yes | Dispute reasoning and evidence |
| `dispute_tx_hash` | string | no | Optional on-chain tx hash |

**Returns:** `{ status: "disputed", message }` while awaiting the other party, or `{ status: "resolved", judgment }` after AI resolves.

---

## Example conversation

Once the MCP server is connected, you can ask Claude:

> "Create a $100 USDC escrow between 0xBuyer... and 0xSeller... for a logo design job."

> "Check the status of escrow abc-123."

> "The logo looks great — release payment for escrow abc-123 from the buyer address 0xBuyer..."

> "Open a dispute on escrow abc-123 — the seller delivered the wrong file format despite clear requirements."

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENT_API_KEY` | — | **Required.** Must match the server's `AGENT_API_KEY` |
| `NEXT_PUBLIC_APP_URL` | `https://deal-arc.vercel.app` | Base URL of the DealARC API |

---

## Testing the server manually

```bash
# Smoke-test: the server starts and waits on stdin
AGENT_API_KEY=dealarc-agent-2026 \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
node mcp-server.js
# Expected: [dealarc-mcp] Server running. Base URL: http://localhost:3000
# Press Ctrl+C to exit
```

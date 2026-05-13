#!/usr/bin/env node
'use strict';

const { McpServer }          = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }                  = require('zod');

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://deal-arc.vercel.app').replace(/\/$/, '');
const API_KEY  = process.env.AGENT_API_KEY ?? '';

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function agentFetch(path, method, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key':    API_KEY,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    throw new Error(data.error ?? `HTTP ${res.status} from ${path}`);
  }

  return data;
}

function text(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function errorText(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'dealarc',
  version: '1.0.0',
});

// ── Tool: create_escrow ───────────────────────────────────────────────────────

server.tool(
  'create_escrow',
  'Create a trustless USDC escrow between two parties on Arc. Returns the escrow ID and on-chain contract ID.',
  {
    title: z.string().describe('Short title for the deal (e.g. "Logo design — phase 1")'),
    buyer: z.string().describe('Ethereum address of the buyer (payer)'),
    seller: z.string().describe('Ethereum address of the seller (service provider)'),
    amount: z.string().describe('Total USDC amount as a decimal string (e.g. "250.00")'),
    mode: z.enum(['simple', 'milestone']).default('simple').describe(
      '"simple" for a single-payment deal, "milestone" for milestone-based payments'
    ),
    description: z.string().optional().describe('Longer description of the deal terms'),
    requirements: z.string().optional().describe('Acceptance criteria the seller must meet'),
    milestones: z
      .array(
        z.object({
          title:       z.string(),
          amount:      z.string(),
          description: z.string().optional(),
        })
      )
      .optional()
      .describe('Required when mode is "milestone". Each milestone has a title and USDC amount.'),
  },
  async (args) => {
    try {
      const data = await agentFetch('/api/agent/create-escrow', 'POST', args);
      return text({
        success:    true,
        id:         data.escrow.id,
        status:     data.escrow.status,
        contractId: data.escrow.contractId ?? null,
        amount:     data.escrow.amount,
        mode:       data.escrow.mode,
        warning:    data.escrow.contractWarning ?? undefined,
      });
    } catch (err) {
      return errorText(err);
    }
  },
);

// ── Tool: check_status ────────────────────────────────────────────────────────

server.tool(
  'check_status',
  'Check the current status of a DealARC escrow by its ID. Returns status, balances, milestones, and any AI judgment.',
  {
    escrow_id: z.string().describe('The UUID of the escrow returned by create_escrow'),
  },
  async ({ escrow_id }) => {
    try {
      const data = await agentFetch(`/api/agent/status?id=${encodeURIComponent(escrow_id)}`, 'GET');
      return text(data);
    } catch (err) {
      return errorText(err);
    }
  },
);

// ── Tool: release_payment ─────────────────────────────────────────────────────

server.tool(
  'release_payment',
  'Approve and release payment for an escrow. Both buyer and seller must call this. When both approve, USDC is released to the seller automatically.',
  {
    escrow_id: z.string().describe('The UUID of the escrow'),
    address:   z.string().describe('Ethereum address of the approving party (buyer or seller)'),
    tx_hash:   z.string().optional().describe('Optional on-chain transaction hash for the approval'),
  },
  async ({ escrow_id, address, tx_hash }) => {
    try {
      const data = await agentFetch('/api/agent/release', 'POST', {
        escrowId: escrow_id,
        address,
        txHash:   tx_hash,
      });
      return text({
        success:          true,
        status:           data.status,
        pendingOtherParty: data.pendingOtherParty ?? false,
      });
    } catch (err) {
      return errorText(err);
    }
  },
);

// ── Tool: open_dispute ────────────────────────────────────────────────────────

server.tool(
  'open_dispute',
  'Open a dispute on an escrow. Once both parties have filed their claims, Claude AI automatically judges the case and the smart contract executes the verdict.',
  {
    escrow_id:      z.string().describe('The UUID of the escrow'),
    address:        z.string().describe('Ethereum address of the disputing party (buyer or seller)'),
    claim:          z.string().describe('Your dispute claim — describe what went wrong and why you should win'),
    dispute_tx_hash: z.string().optional().describe('Optional on-chain transaction hash for the dispute'),
  },
  async ({ escrow_id, address, claim, dispute_tx_hash }) => {
    try {
      const data = await agentFetch('/api/agent/dispute', 'POST', {
        escrowId:     escrow_id,
        address,
        claim,
        disputeTxHash: dispute_tx_hash,
      });
      return text({
        success:    true,
        status:     data.status,
        message:    data.message ?? undefined,
        judgment:   data.judgment ?? undefined,
      });
    } catch (err) {
      return errorText(err);
    }
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    process.stderr.write('[dealarc-mcp] Warning: AGENT_API_KEY is not set. Requests will be rejected.\n');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[dealarc-mcp] Server running. Base URL: ${BASE_URL}\n`);
}

main().catch(err => {
  process.stderr.write(`[dealarc-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});

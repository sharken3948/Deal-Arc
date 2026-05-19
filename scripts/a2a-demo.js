/**
 * DealARC A2A Demo
 *
 * Full agent-to-agent escrow lifecycle with real on-chain transactions:
 *   0. Register two agents → Turnkey wallets (or reuse via DEMO_BUYER_WALLET / DEMO_SELLER_WALLET)
 *   1. Agent A (buyer)  creates escrow with Groq-validated requirements
 *   2. Agent A          deposits USDC on-chain via Turnkey signer
 *   3. Agent B (seller) submits PNG evidence via /api/agent/submit-evidence
 *   4. Agent A          opens dispute on-chain via Turnkey signer
 *   5. Agent B          files counter-claim → AI Judge + oracle resolves on-chain
 *
 * Env vars:
 *   DEMO_BUYER_WALLET   – reuse a funded buyer wallet address (skip registration)
 *   DEMO_SELLER_WALLET  – reuse a funded seller wallet address (skip registration)
 *   DEMO_BASE_URL       – default http://localhost:3000
 *   AGENT_API_KEY       – default dealarc-agent-2026
 */

import { readFileSync }   from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }  from 'node:url';
import { deflateSync }    from 'node:zlib';
import { randomUUID }     from 'node:crypto';
import { ethers }         from 'ethers';

// ── Load .env.local ───────────────────────────────────────────────────────────
// env vars from .env.local are only injected by Next.js; load them manually here.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const lines = readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* .env.local optional */ }

// ── Import lib modules via relative paths (no @/ alias in plain Node) ─────────
const { createAgentWallet, getAgentSigner } = await import(`${ROOT}/lib/turnkey.js`);
const { depositOnChain, disputeOnChain, submitDeliverableOnChain, toBytes32 } = await import(`${ROOT}/lib/contract.js`);

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:3000';
const API_KEY  = process.env.AGENT_API_KEY  || 'dealarc-agent-2026';
const HEADERS  = { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };

// ── Helpers ───────────────────────────────────────────────────────────────────
function sep(c = '─') { return c.repeat(62); }
function log(step, msg, data) {
  console.log(`\n${sep()}\n[${step}] ${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

async function api(path, method = 'GET', body, { allowFail = false } = {}) {
  const res  = await fetch(`${BASE_URL}${path}`, {
    method, headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success && !allowFail) throw new Error(`${path} → ${json.error || JSON.stringify(json)}`);
  return { json, status: res.status };
}

/** 20×20 RGB PNG, no external deps. */
function makePng() {
  function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) { c ^= b; for (let j = 0; j < 8; j++) c = (c>>>1) ^ (c&1 ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type,'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
    return Buffer.concat([len, t, data, crc]);
  }
  const W=20,H=20, sig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr=(()=>{const b=Buffer.alloc(13);b.writeUInt32BE(W,0);b.writeUInt32BE(H,4);b[8]=8;b[9]=2;return b;})();
  const raw=[];
  for(let y=0;y<H;y++){raw.push(0);for(let x=0;x<W;x++){raw.push(Math.floor(x/W*255));raw.push(Math.floor(y/H*255));raw.push(128);}}
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from(raw))),chunk('IEND',Buffer.alloc(0))]);
}

// ── Demo ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${sep('═')}`);
  console.log('  DealARC A2A Demo  —  Turnkey wallets + real on-chain transactions');
  console.log(sep('═'));
  console.log(`  API: ${BASE_URL}`);

  // ── Step 0: wallets ────────────────────────────────────────────────────────
  let buyerAddr, sellerAddr;

  if (process.env.DEMO_BUYER_WALLET && process.env.DEMO_SELLER_WALLET) {
    buyerAddr  = process.env.DEMO_BUYER_WALLET;
    sellerAddr = process.env.DEMO_SELLER_WALLET;
    log('STEP 0', 'Reusing pre-funded Turnkey wallets from env vars', { buyerAddr, sellerAddr });
  } else {
    log('STEP 0a', 'Registering Agent A (buyer) → Turnkey wallet');
    const { json: regA } = await api('/api/agent/register', 'POST', {
      email: `demo-buyer-${randomUUID().slice(0,8)}@dealarc.demo`,
      projectName: 'Demo Buyer Agent',
    });
    buyerAddr = regA.walletAddress;
    log('STEP 0a ✓', 'Agent A registered', { walletAddress: buyerAddr, apiKey: regA.apiKey });

    log('STEP 0b', 'Registering Agent B (seller) → Turnkey wallet');
    const { json: regB } = await api('/api/agent/register', 'POST', {
      email: `demo-seller-${randomUUID().slice(0,8)}@dealarc.demo`,
      projectName: 'Demo Seller Agent',
    });
    sellerAddr = regB.walletAddress;
    log('STEP 0b ✓', 'Agent B registered', { walletAddress: sellerAddr, apiKey: regB.apiKey });

    console.log(`\n  ⚠  Newly created wallets have no USDC. Fund them and rerun with:`);
    console.log(`     DEMO_BUYER_WALLET=${buyerAddr} DEMO_SELLER_WALLET=${sellerAddr} node scripts/a2a-demo.js\n`);
    process.exit(0);
  }

  console.log(`\n  Buyer:  ${buyerAddr}`);
  console.log(`  Seller: ${sellerAddr}`);

  // ── Step 1: Create escrow ──────────────────────────────────────────────────
  log('STEP 1', 'Agent A creates escrow with Groq-quality-checked requirements');

  const requirements =
    'Deliver a React 18 + D3.js data dashboard with: 5 interactive chart types ' +
    '(bar, line, pie, scatter, heatmap), CSV import with multi-column mapping, ' +
    'responsive layout (desktop ≥1280px, mobile ≥375px), Lighthouse performance ' +
    'score ≥90, Jest unit test coverage ≥80%, Docker-compose for local dev. ' +
    'Delivered within 21 days as a public GitHub repository with a README.';

  console.log(`\nRequirements (${requirements.length} chars):\n"${requirements}"`);

  const { json: created } = await api('/api/agent/create-escrow', 'POST', {
    mode: 'service', title: 'React D3 Data Dashboard',
    description: 'Interactive data viz tool with 5 chart types and CSV import',
    requirements, amount: '10', buyer: buyerAddr, seller: sellerAddr,
  });

  const escrow = created.escrow;
  log('STEP 1 ✓', 'Escrow created on-chain', {
    escrowId:     escrow.id,
    contractId:   escrow.contractId,
    createTxHash: escrow.createTxHash,
    status:       escrow.status,
    amount:       `${escrow.amount} USDC`,
  });

  // ── Step 2: Real on-chain deposit via buyer's Turnkey signer ───────────────
  log('STEP 2', 'Agent A approves + deposits USDC on-chain via Turnkey signer');

  const buyerSigner = getAgentSigner(buyerAddr);
  const { approveTxHash, depositTxHash } = await depositOnChain({
    uuid: escrow.id, amount: escrow.amount, signer: buyerSigner,
  });

  // Sync off-chain state
  await api(`/api/escrow/${escrow.id}`, 'POST', { action: 'deposit', txHash: depositTxHash });
  const { json: afterDeposit } = await api(`/api/escrow/${escrow.id}`);

  log('STEP 2 ✓', 'USDC deposited on-chain', {
    approveTxHash,
    depositTxHash,
    status: afterDeposit.escrow.status,
  });

  // ── Step 3: Submit evidence ────────────────────────────────────────────────
  log('STEP 3', 'Agent B generates PNG and submits evidence');

  const png    = makePng();
  const base64 = png.toString('base64');
  console.log(`\nPNG: ${png.length} bytes — below 500 KB → stored inline in KV`);

  const { json: ev } = await api('/api/agent/submit-evidence', 'POST', {
    escrowId: escrow.id, milestoneIndex: 0,
    base64, mimeType: 'image/png',
    description:
      'GitHub repo: https://github.com/demo/d3-dashboard — ' +
      '5 charts delivered, Jest coverage 84%, Lighthouse 93, Docker-compose included.',
  });

  log('STEP 3 ✓', 'Evidence stored in KV', {
    storageType:          ev.evidenceStored.type,
    ipfsHash:             ev.ipfsHash,
    description:          ev.evidenceStored.description,
    submittedAt:          ev.evidenceStored.submittedAt,
    submissionsRemaining: ev.submissionsRemaining,
  });

  // ── Step 4: Buyer opens dispute on-chain via Turnkey signer ───────────────
  log('STEP 4', 'Agent A opens dispute on-chain via Turnkey signer');

  const buyerClaim =
    'The heatmap chart is missing — only 4 of the 5 required chart types are present. ' +
    'The CSV multi-column mapping feature is absent from the import wizard. ' +
    'Requirements not fully met. Requesting resolution.';

  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(buyerClaim));
  const { disputeTxHash } = await disputeOnChain({
    uuid: escrow.id, evidenceHash, signer: buyerSigner,
  });

  // Record dispute off-chain
  const { json: dispute1 } = await api(`/api/escrow/${escrow.id}`, 'POST', {
    action: 'dispute', address: buyerAddr,
    claim: buyerClaim, disputeTxHash,
  });

  log('STEP 4 ✓', 'Buyer dispute filed on-chain', {
    disputeTxHash,
    message: dispute1.message,
  });

  // ── Step 5a: Seller submits deliverable hash on-chain ─────────────────────
  log('STEP 5a', 'Agent B submits deliverable hash on-chain via Turnkey signer');

  const sellerClaim =
    'All 5 chart types are present — the heatmap is at /charts/heatmap. ' +
    'Multi-column CSV mapping is in the import wizard under "Column Selector". ' +
    'Lighthouse score 93, Jest coverage 84%, Docker-compose in repo root. ' +
    'All requirements fully satisfied.';

  const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes(sellerClaim));
  const sellerSigner    = getAgentSigner(sellerAddr);
  const { submitTxHash } = await submitDeliverableOnChain({
    uuid: escrow.id, deliverableHash, signer: sellerSigner,
  });
  log('STEP 5a ✓', 'Deliverable hash submitted on-chain', { submitTxHash });

  // ── Step 5b: Seller counter-claim → AI Judge + oracle resolves ─────────────
  log('STEP 5b', 'Agent B files counter-claim → AI Judge + oracle resolution');

  const { json: resolution, status: resolveStatus } = await api(
    `/api/escrow/${escrow.id}`, 'POST',
    { action: 'dispute', address: sellerAddr, claim: sellerClaim },
    { allowFail: true },
  );

  log('STEP 5b ✓', 'Counter-claim filed', {
    apiStatus: resolveStatus,
    success:   resolution.success,
    status:    resolution.status,
    error:     resolution.error ?? undefined,
  });

  // ── Final state ────────────────────────────────────────────────────────────
  const { json: final } = await api(`/api/escrow/${escrow.id}`);
  const e = final.escrow, j = e.aiJudgment, tx = e.releaseTx;

  console.log(`\n${sep('═')}`);
  console.log('  FINAL SUMMARY');
  console.log(sep('═'));
  console.log(`  Escrow ID      : ${e.id}`);
  console.log(`  Status         : ${e.status}`);
  console.log(`  Amount         : ${e.amount} USDC`);
  console.log(`  Buyer          : ${e.buyer.address}  (Turnkey)`);
  console.log(`  Seller         : ${e.seller.address}  (Turnkey)`);
  console.log(`  Create TX      : ${e.createTxHash}`);
  console.log(`  Approve TX     : ${approveTxHash}`);
  console.log(`  Deposit TX     : ${e.depositTxHash}`);
  console.log(`  Dispute TX     : ${e.buyer?.disputeTxHash}`);
  console.log(`  Deliverable TX : ${submitTxHash}`);
  if (j) {
    console.log(`\n  ── AI Judge ──────────────────────────────────────────`);
    console.log(`  Verdict        : ${j.verdict}`);
    console.log(`  Confidence     : ${j.confidence}%`);
    console.log(`  Buyer award %  : ${j.awardBuyerPercent ?? 0}%`);
    console.log(`  Reasoning      : ${j.reasoning}`);
    if (j.recommendation) console.log(`  Recommendation : ${j.recommendation}`);
    console.log(`  Model          : ${j.model}`);
    console.log(`  Timestamp      : ${j.timestamp}`);
  }
  if (tx) {
    console.log(`\n  ── On-chain Settlement ───────────────────────────────`);
    console.log(`  Release TX     : ${tx.txHash}`);
    console.log(`  Amount settled : ${tx.amount} USDC`);
    console.log(`  Winner         : ${tx.winner}`);
    console.log(`  Verdict        : ${tx.verdict}`);
    console.log(`  Settled at     : ${tx.timestamp}`);
  }
  console.log(`\n${sep('═')}\n`);
}

run().catch(err => {
  console.error('\n[DEMO ERROR]', err.message);
  process.exit(1);
});

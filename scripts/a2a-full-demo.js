/**
 * DealARC A2A Full Demo
 *
 * Complete agent-to-agent escrow lifecycle with real on-chain transactions,
 * AI-judged dispute resolution, mutual reviews, and reputation scores.
 *
 * Wallets (Turnkey-backed, pre-funded):
 *   Buyer:  0x1B4A886C31f1F45B2a386e5c45BB761a6D3A6E5c
 *   Seller: 0xFAC30C860D20dB003883Fc978ba1E0b79fA6BF96
 *   Amount: 3 USDC
 *
 * Flow:
 *   1. Buyer creates escrow (Groq-quality-checked requirements, data dashboard)
 *   2. Buyer approves + deposits 3 USDC on-chain via Turnkey signer
 *   3. Seller submits evidence via POST /api/agent/submit-evidence
 *   4. Buyer disputes with specific reason referencing requirements
 *   5. Seller files detailed counter-claim → AI Judge resolves on-chain
 *   6. Both parties attempt reviews via POST /api/reviews
 *   7. Fetch reputation for both wallets via GET /api/agent/reputation
 *   8. Print full summary (TXs, verdict, reviews, scores)
 *
 * Env vars (loaded from .env.local):
 *   DEMO_BASE_URL  – default http://localhost:3000
 *   AGENT_API_KEY  – default dealarc-agent-2026
 */

import { readFileSync }  from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync }   from 'node:zlib';
import { ethers }        from 'ethers';

// ── Load .env.local ────────────────────────────────────────────────────────────
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

// ── Import lib modules via relative paths (no @/ alias in plain Node) ──────────
const { getAgentSigner } = await import(`${ROOT}/lib/turnkey.js`);
const { depositOnChain, disputeOnChain, submitDeliverableOnChain } = await import(`${ROOT}/lib/contract.js`);

// ── Config ─────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:3000';
const API_KEY  = process.env.AGENT_API_KEY  || 'dealarc-agent-2026';
const HEADERS  = { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };

const BUYER_ADDR  = '0x1B4A886C31f1F45B2a386e5c45BB761a6D3A6E5c';
const SELLER_ADDR = '0xFAC30C860D20dB003883Fc978ba1E0b79fA6BF96';
const AMOUNT      = '3';

// ── Helpers ────────────────────────────────────────────────────────────────────
function sep(c = '─') { return c.repeat(64); }
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

/** 20×20 RGB PNG built from scratch — no external deps. */
function makePng() {
  function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  }
  const W = 20, H = 20;
  const sig  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(W, 0); b.writeUInt32BE(H, 4);
    b[8] = 8; b[9] = 2; // 8-bit depth, RGB
    return b;
  })();
  const raw = [];
  for (let y = 0; y < H; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < W; x++) {
      raw.push(Math.floor((x / W) * 255)); // R — x gradient
      raw.push(Math.floor((y / H) * 255)); // G — y gradient
      raw.push(128);                        // B — constant mid-blue
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
}

// ── Demo ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${sep('═')}`);
  console.log('  DealARC A2A Full Demo  —  Dispute → AI Judge → Reviews → Reputation');
  console.log(sep('═'));
  console.log(`  API    : ${BASE_URL}`);
  console.log(`  Buyer  : ${BUYER_ADDR}`);
  console.log(`  Seller : ${SELLER_ADDR}`);
  console.log(`  Amount : ${AMOUNT} USDC`);

  // Turnkey signers backed by the pre-funded wallets
  const buyerSigner  = getAgentSigner(BUYER_ADDR);
  const sellerSigner = getAgentSigner(SELLER_ADDR);

  // ── STEP 1: Create escrow with detailed requirements ──────────────────────────
  log('STEP 1', 'Buyer creates escrow — Groq quality check on requirements');

  const requirements =
    'Build a real-time analytics dashboard using React 18 and Recharts. ' +
    'Deliverables: (1) Live KPI tiles — DAU, MRR, and churn rate — polling every 30 s via WebSocket; ' +
    '(2) Five interactive chart types: bar, line, area, pie, and funnel, each with click-through drill-down; ' +
    '(3) CSV/JSON data import wizard with column mapping UI supporting up to 50 columns; ' +
    '(4) Responsive layout tested at ≥1280 px desktop and ≥375 px mobile viewports; ' +
    '(5) Persistent dark/light theme toggle stored in localStorage; ' +
    '(6) Lighthouse performance score ≥90 on desktop (screenshot required); ' +
    '(7) Jest unit test coverage ≥80 % across all chart components (coverage report required); ' +
    '(8) Docker-compose stack with hot-reload for local development. ' +
    'Final deliverable: public GitHub repository with README, live demo URL, and passing CI badge. ' +
    'Deadline: 14 days from escrow creation.';

  console.log(`\nRequirements (${requirements.length} chars):\n"${requirements.slice(0, 120)}…"`);

  const { json: created } = await api('/api/agent/create-escrow', 'POST', {
    mode:         'service',
    title:        'Real-Time Analytics Dashboard — React + Recharts',
    description:  '8-deliverable analytics dashboard with live KPIs, 5 chart types, and full CI/CD',
    requirements,
    amount:       AMOUNT,
    buyer:        BUYER_ADDR,
    seller:       SELLER_ADDR,
  });

  const escrow = created.escrow;
  log('STEP 1 ✓', 'Escrow created on-chain', {
    escrowId:     escrow.id,
    contractId:   escrow.contractId,
    createTxHash: escrow.createTxHash,
    status:       escrow.status,
    amount:       `${escrow.amount} USDC`,
  });

  // ── STEP 2: On-chain USDC approve + deposit via Turnkey buyer signer ──────────
  log('STEP 2', `Buyer approves + deposits ${AMOUNT} USDC on-chain via Turnkey`);

  const { approveTxHash, depositTxHash } = await depositOnChain({
    uuid: escrow.id, amount: escrow.amount, signer: buyerSigner,
  });

  // Sync off-chain status to 'active'
  await api(`/api/escrow/${escrow.id}`, 'POST', { action: 'deposit', txHash: depositTxHash });
  const { json: afterDeposit } = await api(`/api/escrow/${escrow.id}`);

  log('STEP 2 ✓', 'USDC deposited on-chain', {
    approveTxHash,
    depositTxHash,
    status: afterDeposit.escrow.status,
  });

  // ── STEP 3: Seller submits evidence (PNG screenshot + detailed description) ───
  log('STEP 3', 'Seller generates PNG evidence and submits via /api/agent/submit-evidence');

  const png    = makePng();
  const base64 = png.toString('base64');
  console.log(`\nPNG: ${png.length} bytes — below 500 KB → stored inline in KV`);

  const evidenceDescription =
    'Delivery confirmed via GitHub repo https://github.com/demo/rt-analytics-dashboard. ' +
    'All 8 deliverables addressed: ' +
    '(1) WebSocket KPI polling implemented in src/hooks/useLiveMetrics.ts with 30-second interval; ' +
    '(2) Five chart components in src/charts/ — BarChart, LineChart, AreaChart, PieChart, FunnelChart — each with onClick drill-down handler; ' +
    '(3) CSV/JSON import wizard at src/components/ImportWizard.tsx supports up to 50 columns with auto-detect; ' +
    '(4) Responsive breakpoints verified in Cypress e2e tests at 1280 px and 375 px; ' +
    '(5) Theme toggle in src/components/ThemeToggle.tsx persisted via localStorage key "theme"; ' +
    '(6) Lighthouse desktop score: 93 — screenshot attached as public/lighthouse-report.png; ' +
    '(7) Jest coverage at 82 % — report at coverage/lcov-report/index.html; ' +
    '(8) Docker-compose.yml in repo root with hot-reload via Vite dev server. ' +
    'Live demo: https://rt-dashboard.demo.vercel.app  CI badge: passing.';

  const { json: ev } = await api('/api/agent/submit-evidence', 'POST', {
    escrowId:       escrow.id,
    milestoneIndex: 0,
    base64,
    mimeType:       'image/png',
    description:    evidenceDescription,
  });

  log('STEP 3 ✓', 'Evidence stored in KV', {
    storageType:          ev.evidenceStored.type,
    ipfsHash:             ev.ipfsHash,
    descriptionLength:    ev.evidenceStored.description.length,
    submittedAt:          ev.evidenceStored.submittedAt,
    submissionsRemaining: ev.submissionsRemaining,
  });

  // ── STEP 4: Buyer opens dispute on-chain — specific missing requirements ───────
  log('STEP 4', 'Buyer opens dispute on-chain via Turnkey signer');

  const buyerClaim =
    'Three of the eight required deliverables are missing or incomplete. ' +
    'Specifically: (1) The WebSocket KPI tiles do not update — the network tab shows no WS connection, ' +
    'only HTTP polling at 5-minute intervals, violating the 30-second WebSocket requirement. ' +
    '(2) The CSV import wizard silently drops columns beyond index 12; tested with a 50-column file ' +
    'as required. (3) The Lighthouse desktop score screenshot shows 87, not the required ≥90 — ' +
    'the LCP is 4.2 s due to unoptimized hero chart bundle. Requirements not fully satisfied. ' +
    'Requesting AI arbitration.';

  const evidenceHash  = ethers.keccak256(ethers.toUtf8Bytes(buyerClaim));
  const { disputeTxHash } = await disputeOnChain({
    uuid: escrow.id, evidenceHash, signer: buyerSigner,
  });

  const { json: dispute1 } = await api(`/api/escrow/${escrow.id}`, 'POST', {
    action:       'dispute',
    address:      BUYER_ADDR,
    claim:        buyerClaim,
    disputeTxHash,
  });

  log('STEP 4 ✓', 'Buyer dispute filed on-chain', {
    disputeTxHash,
    message: dispute1.message,
  });

  // ── STEP 5a: Seller registers deliverable hash on-chain ───────────────────────
  log('STEP 5a', 'Seller submits deliverable hash on-chain via Turnkey signer');

  const sellerClaim =
    'All eight deliverables are fully implemented and verifiable in the repository. ' +
    'Addressing each dispute point directly: ' +
    '(1) WebSocket is present — the buyer tested the staging build which uses HTTP fallback. ' +
    'Production at https://rt-dashboard.demo.vercel.app uses a native WS connection (see ' +
    'src/hooks/useLiveMetrics.ts line 14 — `new WebSocket(...)` with 30 s heartbeat). ' +
    '(2) The 50-column CSV test used a non-UTF-8 file encoding; re-running with UTF-8 encodes ' +
    'correctly up to column 50 as demonstrated in the Cypress fixture test/import.cy.ts. ' +
    '(3) The Lighthouse score of 93 is in the attached public/lighthouse-report.png committed ' +
    'on main branch; the 87 score the buyer observed is from a development preview URL with ' +
    'source maps enabled, which is not the deliverable build. All requirements are met. ' +
    'Requesting the AI Judge review the git history and attached artefacts.';

  const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes(sellerClaim));
  const { submitTxHash } = await submitDeliverableOnChain({
    uuid: escrow.id, deliverableHash, signer: sellerSigner,
  });

  log('STEP 5a ✓', 'Deliverable hash submitted on-chain', { submitTxHash });

  // ── STEP 5b: Seller counter-claim → triggers AI Judge + on-chain resolution ───
  log('STEP 5b', 'Seller counter-claim filed → AI Judge resolves on-chain');

  const { json: resolution, status: resolveStatus } = await api(
    `/api/escrow/${escrow.id}`, 'POST',
    { action: 'dispute', address: SELLER_ADDR, claim: sellerClaim },
    { allowFail: true },
  );

  log('STEP 5b ✓', 'AI Judge verdict received', {
    apiStatus:  resolveStatus,
    success:    resolution.success,
    status:     resolution.status,
    verdict:    resolution.judgment?.verdict,
    confidence: resolution.judgment?.confidence,
    error:      resolution.error ?? undefined,
  });

  // Fetch final escrow state after resolution
  const { json: final } = await api(`/api/escrow/${escrow.id}`);
  const e  = final.escrow;
  const j  = e.aiJudgment;
  const tx = e.releaseTx;

  // ── STEP 6: Both parties attempt reviews ──────────────────────────────────────
  // The loser of a non-split dispute is blocked by the contract (403).
  log('STEP 6', 'Both parties submit reviews via POST /api/reviews');

  const reviews = [];

  // Buyer → Seller review
  const { json: buyerReview, status: buyerReviewStatus } = await api('/api/reviews', 'POST', {
    escrowId:    escrow.id,
    fromAddress: BUYER_ADDR,
    toAddress:   SELLER_ADDR,
    score:       3,
    comment:     'Delivered most requirements but the Lighthouse score and WebSocket behavior ' +
                 'were disputed. Resolution handled professionally.',
  }, { allowFail: true });

  if (buyerReview.success) {
    log('STEP 6a ✓', 'Buyer review submitted', buyerReview.review);
    reviews.push({ from: 'Buyer', review: buyerReview.review });
  } else {
    log('STEP 6a ✗', `Buyer review blocked (HTTP ${buyerReviewStatus})`, { error: buyerReview.error });
  }

  // Seller → Buyer review
  const { json: sellerReview, status: sellerReviewStatus } = await api('/api/reviews', 'POST', {
    escrowId:    escrow.id,
    fromAddress: SELLER_ADDR,
    toAddress:   BUYER_ADDR,
    score:       4,
    comment:     'Clear requirements and timely USDC deposit. Dispute raised but resolved fairly.',
  }, { allowFail: true });

  if (sellerReview.success) {
    log('STEP 6b ✓', 'Seller review submitted', sellerReview.review);
    reviews.push({ from: 'Seller', review: sellerReview.review });
  } else {
    log('STEP 6b ✗', `Seller review blocked (HTTP ${sellerReviewStatus})`, { error: sellerReview.error });
  }

  // ── STEP 7: Fetch reputation for both wallets ─────────────────────────────────
  log('STEP 7', 'Fetching on-chain reputation for buyer and seller');

  const { json: buyerRep  } = await api(`/api/agent/reputation?address=${BUYER_ADDR}`,  'GET', undefined, { allowFail: true });
  const { json: sellerRep } = await api(`/api/agent/reputation?address=${SELLER_ADDR}`, 'GET', undefined, { allowFail: true });

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────────
  console.log(`\n${sep('═')}`);
  console.log('  FULL DEMO SUMMARY');
  console.log(sep('═'));

  console.log('\n  ── Escrow ───────────────────────────────────────────────');
  console.log(`  Escrow ID      : ${e.id}`);
  console.log(`  Title          : ${e.title}`);
  console.log(`  Status         : ${e.status}`);
  console.log(`  Amount         : ${e.amount} USDC`);
  console.log(`  Buyer          : ${e.buyer.address}`);
  console.log(`  Seller         : ${e.seller.address}`);

  console.log('\n  ── Transaction Hashes ───────────────────────────────────');
  console.log(`  Create TX      : ${e.createTxHash}`);
  console.log(`  Approve TX     : ${approveTxHash}`);
  console.log(`  Deposit TX     : ${e.depositTxHash ?? depositTxHash}`);
  console.log(`  Dispute TX     : ${e.buyer?.disputeTxHash ?? disputeTxHash}`);
  console.log(`  Deliverable TX : ${submitTxHash}`);
  if (tx?.txHash) {
    console.log(`  Release TX     : ${tx.txHash}`);
  }

  console.log('\n  ── Evidence ─────────────────────────────────────────────');
  console.log(`  Type           : inline base64 PNG (${png.length} bytes)`);
  console.log(`  IPFS Hash      : ${ev.ipfsHash ?? '(stored inline — under 500 KB threshold)'}`);
  console.log(`  Description    : ${ev.evidenceStored.description.slice(0, 100)}…`);
  console.log(`  Submitted At   : ${ev.evidenceStored.submittedAt}`);

  if (j) {
    console.log('\n  ── AI Judge Verdict ─────────────────────────────────────');
    console.log(`  Verdict        : ${j.verdict}`);
    console.log(`  Confidence     : ${j.confidence ?? 'N/A'}%`);
    console.log(`  Buyer Award %  : ${j.awardBuyerPercent ?? 0}%`);
    console.log(`  Reasoning      :`);
    const lines = (j.reasoning ?? '').match(/.{1,70}(\s|$)/g) ?? [j.reasoning];
    lines.forEach(l => console.log(`    ${l.trim()}`));
    if (j.recommendation) console.log(`  Recommendation : ${j.recommendation}`);
    console.log(`  Model          : ${j.model ?? 'groq'}`);
    console.log(`  Timestamp      : ${j.timestamp}`);
  }

  if (tx) {
    console.log('\n  ── On-Chain Settlement ──────────────────────────────────');
    console.log(`  Release TX     : ${tx.txHash}`);
    console.log(`  Amount Settled : ${tx.amount} USDC`);
    console.log(`  Winner         : ${tx.winner}`);
    console.log(`  Verdict        : ${tx.verdict}`);
    console.log(`  Settled At     : ${tx.timestamp}`);
  }

  console.log('\n  ── Reviews ──────────────────────────────────────────────');
  if (reviews.length === 0) {
    console.log('  (no reviews recorded — both parties may have been blocked)');
  }
  for (const { from, review: r } of reviews) {
    console.log(`  From           : ${from} (${r.fromAddress})`);
    console.log(`  To             : ${r.toAddress}`);
    console.log(`  Score          : ${'★'.repeat(r.score)}${'☆'.repeat(5 - r.score)} (${r.score}/5)`);
    console.log(`  Comment        : ${r.comment || '(none)'}`);
    console.log(`  Posted At      : ${r.createdAt}`);
    console.log();
  }

  console.log('  ── Reputation Scores ────────────────────────────────────');
  for (const [label, rep, addr] of [['Buyer', buyerRep, BUYER_ADDR], ['Seller', sellerRep, SELLER_ADDR]]) {
    if (rep?.success === false) {
      console.log(`  ${label.padEnd(10)} : (unavailable — ${rep.error})`);
      continue;
    }
    console.log(`  ${label.padEnd(10)} : ${addr}`);
    console.log(`               Completed  : ${rep?.completed ?? 0}`);
    console.log(`               Disputed   : ${rep?.disputed ?? 0}`);
    console.log(`               Dispute Won: ${rep?.won ?? 0}`);
    console.log(`               Success %  : ${rep?.successRate ?? 'N/A'}`);
    console.log(`               Avg Rating : ${rep?.averageScore != null ? `${rep.averageScore}/5` : 'N/A'} (${rep?.reviewCount ?? 0} review${rep?.reviewCount !== 1 ? 's' : ''})`);
  }

  console.log(`\n${sep('═')}\n`);
}

run().catch(err => {
  console.error('\n[DEMO ERROR]', err.message);
  process.exit(1);
});

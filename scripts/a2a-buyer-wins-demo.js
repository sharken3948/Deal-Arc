/**
 * DealARC A2A Buyer-Wins Demo
 *
 * Same full lifecycle as a2a-full-demo.js but tuned so the buyer wins:
 * vague seller evidence, itemised buyer grievances citing exact unmet
 * requirements, and a weak seller counter-claim → AI Judge FAVOR_BUYER.
 *
 * Signers: derived deterministically from DEPLOYER_PRIVATE_KEY so no
 * external signing service is needed. STEP 0 funds them automatically
 * (ARC for gas + 3 USDC for the escrow deposit) from the deployer wallet.
 *
 * Amount: 3 USDC
 *
 * Flow:
 *   0. Fund derived buyer + seller wallets from deployer (ARC + USDC)
 *   1. Buyer creates escrow (Groq-quality-checked requirements, data dashboard)
 *   2. Buyer approves + deposits 3 USDC on-chain
 *   3. Seller submits vague evidence via POST /api/agent/submit-evidence
 *   4. Buyer disputes with six specific unmet requirements
 *   5. Seller files weak counter-claim → AI Judge resolves on-chain
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
const { depositOnChain, disputeOnChain, submitDeliverableOnChain } = await import(`${ROOT}/lib/contract.js`);
const { USDC_ABI, USDC_ADDRESS }                                   = await import(`${ROOT}/lib/contractABI.js`);

// ── Config ─────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:3000';
const API_KEY  = process.env.AGENT_API_KEY  || 'dealarc-agent-2026';
const HEADERS  = { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };
const AMOUNT   = '3';

// ── Derive deterministic buyer + seller from the deployer key ─────────────────
// Each wallet gets a unique private key hashed from the deployer key + role tag,
// giving stable addresses across re-runs without needing an external key manager.
const RPC_URL  = process.env.NEXT_PUBLIC_ARC_RPC ?? 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(RPC_URL);

const deployerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const buyerWallet    = new ethers.Wallet(
  ethers.keccak256(ethers.toUtf8Bytes(process.env.DEPLOYER_PRIVATE_KEY + ':demo-buyer')),
  provider,
);
const sellerWallet   = new ethers.Wallet(
  ethers.keccak256(ethers.toUtf8Bytes(process.env.DEPLOYER_PRIVATE_KEY + ':demo-seller')),
  provider,
);

const BUYER_ADDR  = buyerWallet.address;
const SELLER_ADDR = sellerWallet.address;

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
  console.log('  DealARC A2A Buyer-Wins Demo  —  Vague Evidence → Specific Dispute → FAVOR_BUYER');
  console.log(sep('═'));
  console.log(`  API    : ${BASE_URL}`);
  console.log(`  Buyer  : ${BUYER_ADDR}`);
  console.log(`  Seller : ${SELLER_ADDR}`);
  console.log(`  Amount : ${AMOUNT} USDC`);

  const buyerSigner  = buyerWallet;
  const sellerSigner = sellerWallet;

  // ── STEP 0: Fund derived wallets from deployer (ARC gas + USDC) ──────────────
  log('STEP 0', 'Funding buyer + seller wallets from deployer');

  const usdcAddr = process.env.NEXT_PUBLIC_USDC_ADDRESS ?? USDC_ADDRESS;
  const usdc     = new ethers.Contract(usdcAddr, USDC_ABI, deployerWallet);

  const [buyerArc, buyerUsdc, sellerArc] = await Promise.all([
    provider.getBalance(BUYER_ADDR),
    usdc.balanceOf(BUYER_ADDR),
    provider.getBalance(SELLER_ADDR),
  ]);

  const GAS_FLOAT   = ethers.parseEther('0.05');  // 0.05 ARC per wallet — covers ~10 txs
  const USDC_AMOUNT = ethers.parseUnits(AMOUNT, 6);

  const fundingTxs = [];

  if (buyerArc < GAS_FLOAT) {
    const tx = await deployerWallet.sendTransaction({ to: BUYER_ADDR, value: GAS_FLOAT });
    await tx.wait();
    fundingTxs.push({ label: 'buyer ARC', txHash: tx.hash });
  }
  if (sellerArc < GAS_FLOAT) {
    const tx = await deployerWallet.sendTransaction({ to: SELLER_ADDR, value: GAS_FLOAT });
    await tx.wait();
    fundingTxs.push({ label: 'seller ARC', txHash: tx.hash });
  }
  if (buyerUsdc < USDC_AMOUNT) {
    const tx = await usdc.transfer(BUYER_ADDR, USDC_AMOUNT);
    await tx.wait();
    fundingTxs.push({ label: 'buyer USDC', txHash: tx.hash });
  }

  log('STEP 0 ✓', 'Wallets funded', {
    buyer:  { address: BUYER_ADDR,  arc: ethers.formatEther(await provider.getBalance(BUYER_ADDR)),  usdc: ethers.formatUnits(await usdc.balanceOf(BUYER_ADDR), 6) },
    seller: { address: SELLER_ADDR, arc: ethers.formatEther(await provider.getBalance(SELLER_ADDR)), usdc: ethers.formatUnits(await usdc.balanceOf(SELLER_ADDR), 6) },
    fundingTxs: fundingTxs.length ? fundingTxs : '(already funded — skipped)',
  });

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

  // ── STEP 3: Seller submits vague evidence — no specifics, no file paths ─────────
  // Intentionally omits confirmations for each numbered requirement so the AI
  // Judge has no verifiable claims to weigh against the buyer's itemised dispute.
  log('STEP 3', 'Seller generates PNG evidence and submits via /api/agent/submit-evidence');

  const png    = makePng();
  const base64 = png.toString('base64');
  console.log(`\nPNG: ${png.length} bytes — below 500 KB → stored inline in KV`);

  const evidenceDescription =
    'The dashboard project has been completed and the repository is available for review. ' +
    'All the items from the requirements have been worked on and the project should be ' +
    'considered done. The charts are included and the overall styling looks good. ' +
    'The data loads and is displayed on screen. ' +
    'Please take a look at the repository and confirm acceptance of the delivery.';

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

  // ── STEP 4: Buyer opens dispute — six specific unmet requirements cited ──────────
  log('STEP 4', 'Buyer opens dispute on-chain via Turnkey signer');

  const buyerClaim =
    'Six of the eight contractual deliverables are absent or provably broken. ' +
    'Requirement (1): No WebSocket connection exists. The network tab shows XHR polling every ' +
    '300 seconds via fetch(), not a 30-second WebSocket. The useLiveMetrics hook calls ' +
    'setInterval+fetch, never new WebSocket. ' +
    'Requirement (2): Only four chart types are present — bar, line, area, pie. ' +
    'The funnel chart is entirely absent; no FunnelChart component exists anywhere in the repo. ' +
    'Requirement (3): CSV import silently truncates at column 12. The parseCSV utility has a ' +
    'hardcoded .slice(0,12) at line 34, making 50-column imports impossible as required. ' +
    'Requirement (6): Lighthouse desktop score is 74, not the required ≥90. The red badge ' +
    'is visible in public/lh.png; LCP is 6.1 s due to a 2.4 MB uncompressed chart bundle. ' +
    'Requirement (7): Jest coverage report shows 52 %, well below the required ≥80 %. ' +
    'The coverage/summary.json confirms 52.1 % statement coverage across chart components. ' +
    'Requirement (8): No docker-compose.yml file exists anywhere in the repository. ' +
    'The seller has provided no evidence addressing any of these specific failures. ' +
    'Full refund requested.';

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

  // Intentionally vague and non-responsive — does not address any specific point
  // raised by the buyer, offers no file paths, metrics, or verifiable artefacts.
  const sellerClaim =
    'I worked very hard on this project and I believe the dashboard meets the requirements. ' +
    'Some things may be implemented slightly differently from what was described but the ' +
    'overall project is functional and the data is displayed correctly. ' +
    'The buyer may not have looked at the right parts of the repository. ' +
    'I did my best to deliver everything and I put a lot of effort into this work. ' +
    'A few minor details might be missing but the main functionality is there. ' +
    'I hope the judge will take the effort into account and rule in my favour.';

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
    score:       1,
    comment:     'Failed to deliver 6 of 8 requirements. No WebSocket, no funnel chart, ' +
                 'CSV capped at 12 cols, Lighthouse 74, Jest 52 %, no Docker setup.',
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
    score:       5,
    comment:     'Buyer was fair throughout. Paid promptly and raised legitimate concerns.',
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

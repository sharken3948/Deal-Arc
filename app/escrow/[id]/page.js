'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import Navbar from '@/app/components/Navbar';
import StatusBadge from '@/app/components/StatusBadge';
import AIJudgmentPanel from '@/app/components/AIJudgmentPanel';
import MilestoneList from '@/app/components/MilestoneList';
import DisputeModal from '@/app/components/DisputeModal';
import SellerResponseModal from '@/app/components/SellerResponseModal';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { ESCROW_ABI, USDC_ABI, ARC_CHAIN_ID, ARC_RPC } from '@/lib/contractABI';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;
const USDC_ADDRESS     = process.env.NEXT_PUBLIC_USDC_ADDRESS;

// Returns keccak256 bytes32 ID matching what the server stored on-chain
function toBytes32(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

function truncate(addr) {
  return addr ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : '—';
}

function DeadlineCountdown({ deadline }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) { setText('Deadline has passed'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setText(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return <span className="font-mono text-amber-400 font-semibold">{text}</span>;
}

function Section({ title, children }) {
  return (
    <div className="glass rounded-xl p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">{title}</p>
      {children}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="text-xs text-slate-500 hover:text-purple-400 transition-colors ml-2">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

const ARC_EXPLORER = 'https://testnet.arcscan.app';

const COLOR_MAP = {
  slate:   { text: 'text-slate-400',   dot: 'bg-slate-400'   },
  blue:    { text: 'text-blue-400',    dot: 'bg-blue-400'    },
  emerald: { text: 'text-emerald-400', dot: 'bg-emerald-400' },
  red:     { text: 'text-red-400',     dot: 'bg-red-400'     },
  amber:   { text: 'text-amber-400',   dot: 'bg-amber-400'   },
  purple:  { text: 'text-purple-400',  dot: 'bg-purple-400'  },
};

function TxRow({ name, desc, txHash, color = 'slate' }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.slate;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${c.text}`}>{name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        {txHash && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="font-mono text-xs text-slate-400">
              {txHash.slice(0, 10)}…{txHash.slice(-6)}
            </span>
            <CopyButton text={txHash} />
            <a href={`${ARC_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-purple-400 hover:underline">↗ Explorer</a>
          </div>
        )}
      </div>
    </div>
  );
}

function buildTxEvents(escrow) {
  const events = [];
  if (escrow.createTxHash)
    events.push({ name: 'Escrow Created',   desc: 'Escrow registered on-chain',                color: 'slate',   txHash: escrow.createTxHash });
  if (escrow.depositTxHash)
    events.push({ name: 'Deposit Made',      desc: `${escrow.amount} USDC locked in contract`,  color: 'blue',    txHash: escrow.depositTxHash });
  if (escrow.buyer?.approveTxHash)
    events.push({ name: 'Buyer Approved',    desc: 'Buyer confirmed completion on-chain',        color: 'emerald', txHash: escrow.buyer.approveTxHash });
  if (escrow.seller?.approveTxHash)
    events.push({ name: 'Seller Approved',   desc: 'Seller confirmed completion on-chain',       color: 'emerald', txHash: escrow.seller.approveTxHash });
  if (escrow.buyer?.disputeTxHash)
    events.push({ name: 'Dispute Opened',    desc: 'Buyer raised a dispute',                     color: 'red',     txHash: escrow.buyer.disputeTxHash });
  if (escrow.seller?.disputeTxHash)
    events.push({ name: 'Dispute Opened',    desc: 'Seller raised a dispute',                    color: 'red',     txHash: escrow.seller.disputeTxHash });
  if (escrow.releaseTx?.txHash) {
    const disputed = !!(escrow.buyer?.disputeClaim || escrow.seller?.disputeClaim);
    const winner   = escrow.releaseTx.winner;
    events.push({
      name:   disputed ? 'Dispute Resolved' : 'Funds Released',
      desc:   disputed
        ? `Awarded to ${winner === escrow.buyer?.address ? 'buyer' : 'seller'}`
        : `${(parseFloat(escrow.releaseTx.amount) * 0.975).toFixed(2)} USDC sent to seller (after 2.5% fee)`,
      color:  disputed ? 'amber' : 'emerald',
      txHash: escrow.releaseTx.txHash,
    });
  }
  return events;
}

function buildHistoryEvents(escrow) {
  const events = [];

  // Escrow-level events
  if (escrow.createdAt)
    events.push({ icon: '🔒', label: 'Escrow Created',                           timestamp: escrow.createdAt,                       color: 'slate',   txHash: escrow.createTxHash });
  if (escrow.depositTxHash)
    events.push({ icon: '💰', label: `Deposit Made — ${escrow.amount} USDC`,     timestamp: escrow.depositedAt || escrow.createdAt, color: 'blue',    txHash: escrow.depositTxHash });
  if (escrow.proof?.submittedAt)
    events.push({ icon: '📋', label: 'Proof Submitted',                           timestamp: escrow.proof.submittedAt,               color: 'blue' });
  if (escrow.disputedAt)
    events.push({ icon: '⚖',  label: 'Dispute Raised',                           timestamp: escrow.disputedAt,                      color: 'red',     txHash: escrow.buyer?.disputeTxHash || escrow.seller?.disputeTxHash });
  if (escrow.seller?.disputeClaim && escrow.updatedAt)
    events.push({ icon: '🛡',  label: 'Seller Defense Submitted',                 timestamp: escrow.updatedAt,                       color: 'purple' });
  if (escrow.aiJudgment?.timestamp)
    events.push({ icon: '🤖', label: `AI Verdict: ${escrow.aiJudgment.verdict}`,  timestamp: escrow.aiJudgment.timestamp,            color: 'emerald', txHash: escrow.aiJudgment.txHash });
  if (escrow.completedAt)
    events.push({ icon: '✅', label: 'Escrow Completed',                          timestamp: escrow.completedAt,                     color: 'purple' });

  // Milestone events
  (escrow.milestones || []).forEach((ms, i) => {
    const n = i + 1;
    if (ms.releaseTxHash)
      events.push({ icon: '💰', label: `Milestone ${n} Released — ${ms.amount} USDC`,
        timestamp: ms.proof?.submittedAt, color: 'emerald', txHash: ms.releaseTxHash });
    if (ms.disputedAt)
      events.push({ icon: '⚠️', label: `Dispute Opened — Milestone ${n}`,
        timestamp: ms.disputedAt, color: 'red' });
    if (ms.defenseSubmittedAt)
      events.push({ icon: '🛡️', label: `Defense Submitted — Milestone ${n}`,
        timestamp: ms.defenseSubmittedAt, color: 'purple' });
    if (ms.aiJudgment?.txHash)
      events.push({ icon: '🤖', label: `AI Verdict: ${ms.aiJudgment.verdict} — Milestone ${n}`,
        timestamp: ms.aiJudgment.timestamp, color: 'amber', txHash: ms.aiJudgment.txHash });
  });

  return events
    .filter(e => e.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function TransactionDetails({ tx }) {
  return (
    <div className="glass rounded-xl p-5 space-y-3 border border-emerald-500/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <p className="text-sm font-semibold text-emerald-400">USDC Released</p>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{tx.state}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-500 mb-0.5">Amount</p>
          <p className="font-semibold text-emerald-400">{tx.amount} USDC</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Timestamp</p>
          <p className="text-slate-300">{new Date(tx.timestamp).toLocaleString()}</p>
        </div>
      </div>

      {tx.txHash ? (
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Transaction Hash</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-slate-300 break-all flex-1">{tx.txHash}</p>
            <CopyButton text={tx.txHash} />
          </div>
          <a
            href={`${ARC_EXPLORER}/tx/${tx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:underline mt-1 inline-block"
          >
            View on ARC Explorer ↗
          </a>
        </div>
      ) : (
        <p className="text-xs text-slate-600 italic">Transaction hash not yet available.</p>
      )}
    </div>
  );
}

export default function EscrowDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const [escrow, setEscrow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [proofForm, setProofForm] = useState({ description: '', url: '' });
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showSellerModal,  setShowSellerModal]  = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  // null = still checking, true = confirmed in current contract, false = not found
  const [contractLive, setContractLive] = useState(null);

  const fetchEscrow = useCallback(async () => {
    const res = await fetch(`/api/escrow/${id}`);
    const data = await res.json();
    if (data.success) setEscrow(data.escrow);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchEscrow(); }, [fetchEscrow]);

  // Verify the escrow actually exists in the *current* deployed contract.
  // Uses a read-only provider so no wallet connection is required.
  useEffect(() => {
    if (!escrow) return;
    if (!escrow.contractId) { setContractLive(false); return; }
    const readProvider = new ethers.JsonRpcProvider(ARC_RPC);
    const c = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, readProvider);
    const bytes32Id = toBytes32(escrow.id);
    console.log('[contractLive] checking escrowExists for', escrow.id, bytes32Id);
    c.escrowExists(bytes32Id)
      .then(exists => {
        console.log('[contractLive] escrowExists returned:', exists, 'for', escrow.id);
        setContractLive(exists);
      })
      .catch(err => {
        // RPC error (network down, etc.) → treat as existing so users aren't permanently blocked.
        console.warn('[contractLive] escrowExists RPC error, defaulting to true:', err.message);
        setContractLive(true);
      });
  }, [escrow?.id]);

  async function doAction(action, body = {}) {
    if (!address) { openConnectModal?.(); return; }
    setActionLoading(action);
    try {
      const res = await fetch(`/api/escrow/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body, address }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Action failed');
      await fetchEscrow();
      return data;
    } catch (e) {
      console.error('[doAction]', action, e);
      alert(`Error: ${e.message}`);
    } finally {
      setActionLoading('');
    }
  }

  async function ensureARC() {
    if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID });
  }

  async function confirmDeposit() {
    if (!address) { openConnectModal?.(); return; }
    setActionLoading('deposit');
    try {
      console.log('[deposit] 1. ensureARC — chainId:', chainId);
      await ensureARC();
      if (!walletClient) throw new Error('No wallet connected.');
      const signer    = await new ethers.BrowserProvider(walletClient).getSigner();
      console.log('[deposit] 3. signer address:', await signer.getAddress());
      const usdc      = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const contract  = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const bytes32Id = toBytes32(escrow.id);
      const amountWei = ethers.parseUnits(String(parseFloat(escrow.amount).toFixed(6)), 6);
      console.log('[deposit] 4. approve USDC — spender:', CONTRACT_ADDRESS, 'amount:', amountWei.toString());

      const approveTx = await usdc.approve(CONTRACT_ADDRESS, amountWei);
      console.log('[deposit] 5. approve tx sent:', approveTx.hash);
      const approveReceipt = await approveTx.wait();
      console.log('[deposit] 6. approve confirmed — status:', approveReceipt.status, 'gasUsed:', approveReceipt.gasUsed?.toString());

      console.log('[deposit] 7. calling contract.deposit — bytes32Id:', bytes32Id);
      const depositTx = await contract.deposit(bytes32Id);
      console.log('[deposit] 8. deposit tx sent:', depositTx.hash);
      const receipt   = await depositTx.wait();
      console.log('[deposit] 9. deposit confirmed — receipt:', receipt.hash);

      // On-chain tx is confirmed — always refresh the page regardless of storage sync outcome.
      console.log('[deposit] 10. syncing off-chain status — escrow.id:', escrow?.id, '| useParams id:', id);
      try {
        const depositUrl = `/api/escrow/${id}`;
        console.log('[deposit] 10a. fetch URL:', depositUrl, '(action: deposit)');
        const syncRes = await fetch(depositUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deposit', txHash: receipt.hash }),
        });
        if (!syncRes.ok) {
          const body = await syncRes.json().catch(() => ({}));
          console.warn('[deposit] storage sync failed —', syncRes.status, body.error);
        }
      } catch (syncErr) {
        console.warn('[deposit] storage sync threw —', syncErr.message);
      }

      console.log('[deposit] 11. tx confirmed — calling fetchEscrow');
      await fetchEscrow();
      console.log('[deposit] 12. fetchEscrow done — escrow status:', escrow?.status);
    } catch (e) {
      const reason = e.reason ?? e.revert?.args?.[0] ?? e.data ?? e.message;
      console.error('[confirmDeposit] error:', e.message);
      console.error('[confirmDeposit] revert reason:', reason);
      console.error('[confirmDeposit] code:', e.code, '| tx:', e.transaction?.data?.slice(0, 10), '| receipt:', e.receipt);
      alert(`Deposit failed: ${reason}`);
      // Refresh even on failure — if the tx already landed on-chain (e.g. "Not pending"
      // on retry), the page needs to reflect whatever state storage has now.
      await fetchEscrow().catch(() => {});
    } finally {
      setActionLoading('');
    }
  }

  async function submitProof() {
    if (!proofForm.description && !proofForm.url) return alert('Provide a description or URL');
    setActionLoading('proof');
    try {
      const res = await fetch(`/api/escrow/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'proof', ...proofForm, submitterAddress: address }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setProofForm({ description: '', url: '' });
      await fetchEscrow();
    } catch (e) {
      console.error('[submitProof]', e);
      alert(e.message);
    } finally {
      setActionLoading('');
    }
  }

  async function approve() {
    if (!address) { openConnectModal?.(); return; }
    setActionLoading('approve');
    try {
      await ensureARC();
      if (!walletClient) throw new Error('No wallet connected.');
      const signer    = await new ethers.BrowserProvider(walletClient).getSigner();
      const contract  = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const bytes32Id = toBytes32(escrow.id);

      // Check on-chain state to detect prior approvals and confirm the escrow exists.
      let alreadyOnChain = false;
      try {
        const onChain = await contract.getEscrow(bytes32Id);
        alreadyOnChain = isBuyer ? onChain.buyerApproved : onChain.sellerApproved;
      } catch {
        // getEscrow reverted — escrow is not in this contract (redeployed or never registered).
        throw new Error(
          'This escrow is not registered in the current contract. It was likely created on a ' +
          'previous deployment. Contract actions are not available for this escrow.'
        );
      }

      let txHash = null;
      if (!alreadyOnChain) {
        const tx  = await contract.approve(bytes32Id);
        const receipt = await tx.wait();
        txHash = receipt.hash;
      }

      // Sync approval to off-chain storage
      const res  = await fetch(`/api/escrow/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'approve', address, txHash }),
      });
      const data = await res.json();
      await fetchEscrow();

      if (data?.status === 'completed') alert('✅ Both parties approved! Funds have been released on-chain.');
      else if (data?.pendingOtherParty) alert('✓ Your approval is recorded on-chain. Waiting for the other party.');
    } catch (e) {
      console.error('[approve]', e);
      alert(`Approval failed: ${e.message}`);
    } finally {
      setActionLoading('');
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="glass rounded-xl p-8 shimmer h-64" />
        </div>
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="text-center py-24">
          <p className="text-slate-400">Escrow not found.</p>
          <Link href="/" className="text-purple-400 hover:underline mt-2 block">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const isBuyer = address?.toLowerCase() === escrow.buyer.address.toLowerCase();
  const isSeller = address?.toLowerCase() === escrow.seller.address.toLowerCase();
  const isParty = isBuyer || isSeller;
  const myRole = isBuyer ? 'buyer' : isSeller ? 'seller' : 'observer';
  const myApproval = isBuyer ? escrow.buyer.approved : isSeller ? escrow.seller.approved : false;

  // contractLive: null=still checking (block), true=confirmed in contract, false=not found
  const isOnChain = !!escrow.contractId && contractLive === true;

  const isMilestone       = escrow.mode === 'milestone';
  const canSubmitProof    = isSeller && ['active', 'proof_submitted'].includes(escrow.status) && !isMilestone && escrow.mode !== 'simple';
  const canApprove        = isOnChain && isParty && !myApproval && ['active', 'proof_submitted'].includes(escrow.status) && !isMilestone;
  const canDispute        = isOnChain && isParty && ['active', 'proof_submitted'].includes(escrow.status) && !isMilestone;
  const canConfirmDeposit = isOnChain && isBuyer && escrow.status === 'pending_deposit';
  const canSubmitDefense  = isSeller && ['awaiting_seller_response', 'disputed'].includes(escrow.status);

  const MODE_ICONS = { service: '🤝', milestone: '🏁', simple: '💸' };
  const MODE_LABELS = { service: 'Service & Product', milestone: 'Milestone', simple: 'Simple Transfer' };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">← Dashboard</Link>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-mono text-slate-500">{escrow.id.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{MODE_ICONS[escrow.mode]}</span>
              <div>
                <h1 className="text-2xl font-bold text-white">{escrow.title}</h1>
                <p className="text-sm text-slate-500">{MODE_LABELS[escrow.mode] || 'Escrow'} · Created {new Date(escrow.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={escrow.status} size="lg" />
            {myRole !== 'observer' && (
              <span className="text-xs text-purple-400 font-medium capitalize">You are the {myRole}</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 glass rounded-xl p-1">
          {['overview', 'actions', 'history'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeTab === t ? 'bg-purple-600/30 text-purple-300' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Parties */}
            <Section title="Parties">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/3 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Buyer</span>
                    {escrow.buyer.approved
                      ? <span className="text-xs text-emerald-400 font-semibold">✓ Approved</span>
                      : <span className="text-xs text-slate-600">Pending</span>}
                  </div>
                  <p className="font-mono text-xs text-slate-300 break-all">{escrow.buyer.address}</p>
                  {escrow.buyer.address === address && (
                    <span className="text-xs text-purple-400 mt-1 block">← You</span>
                  )}
                </div>
                <div className="bg-white/3 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Seller</span>
                    {escrow.seller.approved
                      ? <span className="text-xs text-emerald-400 font-semibold">✓ Approved</span>
                      : <span className="text-xs text-slate-600">Pending</span>}
                  </div>
                  <p className="font-mono text-xs text-slate-300 break-all">{escrow.seller.address}</p>
                  {escrow.seller.address === address && (
                    <span className="text-xs text-purple-400 mt-1 block">← You</span>
                  )}
                </div>
              </div>
            </Section>

            {/* Amount */}
            <Section title="Escrow Details">
              <div>
                <p className="text-xs text-slate-500 mb-1">Amount</p>
                <p className="text-2xl font-bold text-emerald-400">{escrow.amount} USDC</p>
                <p className="text-xs text-slate-500 mt-1">
                  Platform fee: 2.5% · Seller receives: <span className="text-slate-300">{(parseFloat(escrow.amount) * 0.975).toFixed(2)} USDC</span>
                </p>
              </div>
              {escrow.description && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Agreement</p>
                  <p className="text-sm text-slate-300">{escrow.description}</p>
                </div>
              )}
              {escrow.requirements && (
                <div className="mt-3">
                  <p className="text-xs text-slate-500 mb-1">Delivery Requirements</p>
                  <p className="text-sm text-slate-300">{escrow.requirements}</p>
                </div>
              )}
            </Section>

            {/* Transaction History */}
            <Section title="Transaction History">
              {buildTxEvents(escrow).length === 0 ? (
                <p className="text-sm text-slate-500">No on-chain transactions recorded yet.</p>
              ) : (
                buildTxEvents(escrow).map((ev, i) => <TxRow key={i} {...ev} />)
              )}
            </Section>

            {/* Proof submitted */}
            {escrow.proof && (
              <Section title="Submitted Proof">
                <div className="space-y-2">
                  {escrow.proof.description && <p className="text-sm text-slate-300">{escrow.proof.description}</p>}
                  {escrow.proof.url && (
                    <a href={escrow.proof.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-purple-400 hover:underline break-all">{escrow.proof.url}</a>
                  )}
                  <p className="text-xs text-slate-600">{new Date(escrow.proof.submittedAt).toLocaleString()}</p>
                </div>
              </Section>
            )}

            {/* AI Judgment */}
            {escrow.aiJudgment && (
              <AIJudgmentPanel judgment={escrow.aiJudgment} title="AI Judge Evaluation" />
            )}

            {/* Milestone progress summary (overview only — full list is in Actions tab) */}
            {isMilestone && escrow.milestones?.length > 0 && (() => {
              const done     = escrow.milestones.filter(m => m.status === 'approved').length;
              const total    = escrow.milestones.length;
              const released = escrow.milestones.filter(m => m.status === 'approved').reduce((s, m) => s + parseFloat(m.amount || 0), 0);
              return (
                <Section title="Milestone Progress">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400"><span className="text-white font-semibold">{done}</span> / {total} complete</span>
                      <span><span className="text-emerald-400 font-semibold">{released.toFixed(2)}</span><span className="text-slate-500"> / {parseFloat(escrow.amount || 0).toFixed(2)} USDC</span></span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
                    </div>
                    <div className="space-y-1.5">
                      {escrow.milestones.map((ms, i) => {
                        const isRefunded = ms.status === 'rejected' && !!ms.aiJudgment?.disputeResolution;
                        return (
                          <div key={ms.id} className="flex items-center gap-2 text-xs">
                            <span className={
                              ms.status === 'approved' ? 'text-emerald-400' :
                              isRefunded                ? 'text-slate-500'   :
                              ms.status === 'disputed'  ? 'text-red-400'     : 'text-slate-600'
                            }>
                              {ms.status === 'approved' ? '✓' : isRefunded ? '↩' : ms.status === 'disputed' ? '⚠' : '○'}
                            </span>
                            <span className={ms.status === 'approved' || isRefunded ? 'text-slate-300' : 'text-slate-500'}>{ms.title}</span>
                            <span className="ml-auto text-slate-600">{ms.amount} USDC</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Section>
              );
            })()}

            {/* Dispute claims — show for all dispute-related states, including resolved */}
            {(escrow.buyer?.disputeClaim || ['disputed', 'awaiting_seller_response'].includes(escrow.status)) && (
              <Section title="Dispute">
                {escrow.status === 'awaiting_seller_response' && escrow.disputeDeadline && (
                  <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20 mb-4">
                    <span className="text-slate-400">Seller response deadline:</span>
                    <DeadlineCountdown deadline={escrow.disputeDeadline} />
                  </div>
                )}
                {escrow.buyer.disputeClaim && (
                  <div className="mb-3">
                    <p className="text-xs text-blue-400 font-semibold mb-1">Buyer's Claim</p>
                    <p className="text-sm text-slate-300">{escrow.buyer.disputeClaim}</p>
                  </div>
                )}
                {escrow.seller.disputeClaim ? (
                  <div>
                    <p className="text-xs text-purple-400 font-semibold mb-1">Seller's Defense</p>
                    <p className="text-sm text-slate-300">{escrow.seller.disputeClaim}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mt-1">
                    {escrow.status === 'awaiting_seller_response'
                      ? 'Waiting for seller to submit their defense…'
                      : escrow.status === 'disputed'
                        ? 'Seller has not submitted a defense yet.'
                        : null}
                  </p>
                )}
              </Section>
            )}
          </div>
        )}

        {/* Actions Tab */}
        {activeTab === 'actions' && (
          <div className="space-y-5">
            {!address && (
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-slate-400 mb-3">Connect your wallet to take actions</p>
                <button onClick={() => openConnectModal?.()} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold">
                  Connect Wallet
                </button>
              </div>
            )}

            {/* Waiting for on-chain existence check */}
            {escrow.contractId && contractLive === null && isParty && (
              <div className="glass rounded-xl p-5 flex items-center gap-3">
                <span className="w-4 h-4 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin shrink-0" />
                <p className="text-sm text-slate-400">Verifying on-chain status…</p>
              </div>
            )}

            {/* No contractId at all — creation-time failure or pre-contract era */}
            {!escrow.contractId && isParty && (
              <div className="glass rounded-xl p-5 border border-amber-500/30 bg-amber-400/5">
                <div className="flex items-start gap-3">
                  <span className="text-amber-400 text-xl shrink-0">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-400 mb-1">No on-chain record</p>
                    <p className="text-sm text-slate-300">
                      This escrow was created before on-chain registration was available, or the
                      contract transaction failed at creation time. It has no smart-contract record
                      and cannot interact with the blockchain. Deposit, approve, and dispute actions
                      are disabled.
                    </p>
                    {escrow.contractWarning && (
                      <p className="text-xs text-slate-500 font-mono mt-2 break-all">{escrow.contractWarning}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* contractId exists but the current contract doesn't recognise it */}
            {escrow.contractId && contractLive === false && isParty && (
              <div className="glass rounded-xl p-5 border border-red-500/30 bg-red-400/5">
                <div className="flex items-start gap-3">
                  <span className="text-red-400 text-xl shrink-0">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-red-400 mb-1">Contract deployment mismatch</p>
                    <p className="text-sm text-slate-300">
                      This escrow was registered on a previous contract deployment. The current
                      contract at <span className="font-mono text-xs">{CONTRACT_ADDRESS}</span> has
                      no record of it, so deposit, approve, and dispute actions are disabled to
                      prevent failed transactions.
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-2 break-all">
                      Stored ID: {escrow.contractId}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Milestone mode — full interactive list */}
            {isMilestone && escrow.milestones?.length > 0 && ['active', 'completed'].includes(escrow.status) && isParty && (
              <Section title="Milestones">
                <MilestoneList
                  milestones={escrow.milestones}
                  escrowId={escrow.id}
                  sellerAddress={escrow.seller.address}
                  buyerAddress={escrow.buyer.address}
                  walletAddress={address}
                  onUpdate={fetchEscrow}
                />
              </Section>
            )}

            {/* Deposit confirmation */}
            {canConfirmDeposit && (
              <Section title="Deposit USDC">
                <p className="text-sm text-slate-300 mb-4">
                  Lock <strong className="text-emerald-400">{escrow.amount} USDC</strong> into the escrow smart contract.
                  Your wallet will prompt you to approve the USDC spend, then confirm the deposit.
                </p>
                <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-slate-400 break-all mb-4">
                  Contract: {CONTRACT_ADDRESS}
                </div>
                <button
                  onClick={confirmDeposit}
                  disabled={actionLoading === 'deposit'}
                  className="btn-primary w-full py-3 rounded-xl font-semibold"
                >
                  {actionLoading === 'deposit' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Depositing via Wallet…
                    </span>
                  ) : 'Deposit USDC via Wallet →'}
                </button>
              </Section>
            )}

            {/* Proof submission */}
            {canSubmitProof && (
              <Section title="Submit Proof of Completion">
                <div className="space-y-3">
                  <textarea
                    placeholder="Describe what you delivered / completed…"
                    value={proofForm.description}
                    onChange={e => setProofForm(f => ({ ...f, description: e.target.value }))}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 resize-none"
                  />
                  <input
                    type="url"
                    placeholder="Link to proof (image, doc, portfolio, etc.)"
                    value={proofForm.url}
                    onChange={e => setProofForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600"
                  />
                  <button
                    onClick={submitProof}
                    disabled={actionLoading === 'proof'}
                    className="btn-primary w-full py-3 rounded-xl font-semibold"
                  >
                    {actionLoading === 'proof' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Submitting & Running AI Evaluation…
                      </span>
                    ) : 'Submit Proof for AI Review'}
                  </button>
                </div>
              </Section>
            )}

            {/* Approve */}
            {canApprove && (
              <Section title="Approve Release">
                <p className="text-sm text-slate-300 mb-4">
                  {isBuyer
                    ? 'Approve to release funds to the seller. Once both parties approve, USDC is transferred automatically.'
                    : escrow.mode === 'simple'
                      ? 'Approve to confirm you agree to release the funds.'
                      : 'Approve to confirm you\'ve completed the work as agreed.'}
                </p>
                {escrow.aiJudgment && (
                  <div className={`text-sm mb-4 p-3 rounded-lg ${
                    ['APPROVE','FAIR_SWAP','FAIR_PRICE'].includes(escrow.aiJudgment.verdict)
                      ? 'bg-emerald-400/10 text-emerald-400'
                      : 'bg-amber-400/10 text-amber-400'
                  }`}>
                    AI Verdict: <strong>{escrow.aiJudgment.verdict}</strong> ({escrow.aiJudgment.confidence}% confidence)
                  </div>
                )}
                <button
                  onClick={approve}
                  disabled={actionLoading === 'approve'}
                  className="btn-primary w-full py-3 rounded-xl font-semibold"
                >
                  {actionLoading === 'approve' ? 'Processing…' : `✓ Approve as ${myRole.charAt(0).toUpperCase() + myRole.slice(1)}`}
                </button>
              </Section>
            )}

            {/* Already approved */}
            {isParty && myApproval && escrow.status !== 'completed' && (
              <div className="glass rounded-xl p-4 flex items-center gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <p className="text-sm text-slate-300">You have approved this escrow. Waiting for the other party.</p>
              </div>
            )}

            {/* Dispute */}
            {canDispute && (
              <Section title="Raise Dispute">
                <p className="text-sm text-amber-400 mb-4">
                  ⚠️ Raising a dispute pauses the escrow. The seller will have 24 hours to submit their defense,
                  after which the AI judge issues a binding verdict.
                </p>
                <button
                  onClick={() => { if (!address) { openConnectModal?.(); return; } setShowDisputeModal(true); }}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors"
                >
                  Raise Dispute
                </button>
              </Section>
            )}

            {/* Seller defense */}
            {canSubmitDefense && (
              <Section title="Submit Your Defense">
                <div className="mb-4 space-y-2">
                  <p className="text-sm text-slate-300">
                    A dispute has been raised against this escrow. You have until the deadline to submit your defense.
                  </p>
                  {escrow.disputeDeadline && (
                    <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20">
                      <span className="text-slate-400">Time remaining:</span>
                      <DeadlineCountdown deadline={escrow.disputeDeadline} />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowSellerModal(true)}
                  className="btn-primary w-full py-3 rounded-xl font-semibold text-sm"
                >
                  Submit Your Defense →
                </button>
              </Section>
            )}

            {/* Awaiting seller — buyer view */}
            {isBuyer && ['awaiting_seller_response', 'disputed'].includes(escrow.status) && !escrow.seller?.disputeClaim && (
              <div className="glass rounded-xl p-5 space-y-2">
                <p className="text-sm font-semibold text-amber-400">⏳ Awaiting Seller Defense</p>
                {escrow.disputeDeadline && (
                  <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20">
                    <span className="text-slate-400">Seller must respond by:</span>
                    <DeadlineCountdown deadline={escrow.disputeDeadline} />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {escrow.disputeDeadline
                    ? 'If the seller does not respond in time, the dispute auto-resolves in your favor.'
                    : 'Waiting for the seller to submit their defense.'}
                </p>
              </div>
            )}

            {/* Completed */}
            {escrow.status === 'completed' && (
              <div className="space-y-4">
                <div className="glass rounded-xl p-6 text-center bg-gradient-to-br from-purple-600/10 to-emerald-600/10">
                  <div className="text-5xl mb-3">✅</div>
                  <p className="text-lg font-bold text-white mb-1">Escrow Completed</p>
                  <p className="text-sm text-slate-400">
                    {escrow.completedAt && `Settled on ${new Date(escrow.completedAt).toLocaleString()}`}
                  </p>
                </div>
                {escrow.releaseTx && <TransactionDetails tx={escrow.releaseTx} />}
              </div>
            )}

            {/* No actions */}
            {address && !isMilestone && !canConfirmDeposit && !canSubmitProof && !canApprove && !canDispute &&
             !canSubmitDefense &&
             !(isBuyer && ['awaiting_seller_response', 'disputed'].includes(escrow.status) && !escrow.seller?.disputeClaim) &&
             escrow.status !== 'completed' && !myApproval && (
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-slate-400 text-sm">No actions available in the current state.</p>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {buildHistoryEvents(escrow).map((event, i) =>
              event.txHash ? (
                <div key={i} className="glass rounded-xl px-4">
                  <TxRow
                    name={event.label}
                    desc={new Date(event.timestamp).toLocaleString()}
                    txHash={event.txHash}
                    color={event.color}
                  />
                </div>
              ) : (
                <div key={i} className="glass rounded-xl p-4 flex items-start gap-4">
                  <span className="text-xl shrink-0">{event.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${COLOR_MAP[event.color]?.text ?? 'text-slate-400'}`}>{event.label}</p>
                    <p className="text-xs text-slate-600">{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              )
            )}

            {escrow.releaseTx && (
              <div className="glass rounded-xl p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Release Transaction</p>
                <TransactionDetails tx={escrow.releaseTx} />
              </div>
            )}
          </div>
        )}
      </div>

      {showDisputeModal && (
        <DisputeModal
          escrow={escrow}
          address={address}
          onClose={() => setShowDisputeModal(false)}
          onResolved={fetchEscrow}
        />
      )}
      {showSellerModal && (
        <SellerResponseModal
          escrow={escrow}
          address={address}
          onClose={() => setShowSellerModal(false)}
          onResolved={fetchEscrow}
        />
      )}
    </div>
  );
}

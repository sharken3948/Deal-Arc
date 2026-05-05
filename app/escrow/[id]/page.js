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
import { useWallet } from '@/app/contexts/WalletContext';
import { ESCROW_ABI, USDC_ABI, ARC_CHAIN_ID, getRabbyProvider } from '@/lib/contractABI';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;
const USDC_ADDRESS     = process.env.NEXT_PUBLIC_USDC_ADDRESS;

async function getSigner(walletProvider) {
  // Prefer window.rabby (Rabby's isolated global) over the stored context provider or
  // window.ethereum, which other extensions can corrupt.
  const prov = getRabbyProvider() ?? walletProvider;
  if (!prov) throw new Error('No wallet provider found. Is Rabby installed?');
  return new ethers.BrowserProvider(prov).getSigner();
}

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
        : `${escrow.releaseTx.amount} USDC sent to seller`,
      color:  disputed ? 'amber' : 'emerald',
      txHash: escrow.releaseTx.txHash,
    });
  }
  return events;
}

function TransactionDetails({ tx }) {
  return (
    <div className="glass rounded-xl p-5 space-y-3 border border-emerald-500/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <p className="text-sm font-semibold text-emerald-400">USDC Released</p>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{tx.state}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
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
  const { address, chainId, provider, connect, switchToARC } = useWallet();

  const [escrow, setEscrow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [proofForm, setProofForm] = useState({ description: '', url: '' });
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showSellerModal,  setShowSellerModal]  = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchEscrow = useCallback(async () => {
    const res = await fetch(`/api/escrow/${id}`);
    const data = await res.json();
    if (data.success) setEscrow(data.escrow);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchEscrow(); }, [fetchEscrow]);

  async function doAction(action, body = {}) {
    if (!address) { await connect(); return; }
    setActionLoading(action);
    try {
      const res = await fetch(`/api/escrow/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, address }),
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
    if (chainId !== ARC_CHAIN_ID) await switchToARC();
  }

  async function confirmDeposit() {
    if (!address) { connect(); return; }
    setActionLoading('deposit');
    try {
      console.log('[deposit] 1. ensureARC — chainId:', chainId);
      await ensureARC();
      console.log('[deposit] 2. getSigner — window.rabby:', typeof window !== 'undefined' ? window.rabby : null, 'context provider:', provider);
      const signer    = await getSigner(provider);
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

      console.log('[deposit] 10. syncing off-chain status');
      await fetch(`/api/escrow/${id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: receipt.hash }),
      });
      console.log('[deposit] 11. done');
      await fetchEscrow();
    } catch (e) {
      const reason = e.reason ?? e.revert?.args?.[0] ?? e.data ?? e.message;
      console.error('[confirmDeposit] error:', e.message);
      console.error('[confirmDeposit] revert reason:', reason);
      console.error('[confirmDeposit] code:', e.code, '| tx:', e.transaction?.data?.slice(0, 10), '| receipt:', e.receipt);
      alert(`Deposit failed: ${reason}`);
    } finally {
      setActionLoading('');
    }
  }

  async function submitProof() {
    if (!proofForm.description && !proofForm.url) return alert('Provide a description or URL');
    setActionLoading('proof');
    try {
      const res = await fetch(`/api/escrow/${id}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proofForm, submitterAddress: address }),
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
    if (!address) { connect(); return; }
    setActionLoading('approve');
    try {
      await ensureARC();
      const signer    = await getSigner(provider);
      const contract  = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const bytes32Id = toBytes32(escrow.id);

      // Check on-chain state to skip a redundant tx (e.g. tx mined but client missed receipt).
      // If getEscrow fails (escrow not yet registered on this contract), go straight to approve.
      let alreadyOnChain = false;
      try {
        const onChain = await contract.getEscrow(bytes32Id);
        alreadyOnChain = isBuyer ? onChain.buyerApproved : onChain.sellerApproved;
      } catch { /* escrow not on-chain yet — proceed with approve */ }

      let txHash = null;
      if (!alreadyOnChain) {
        const tx  = await contract.approve(bytes32Id);
        const receipt = await tx.wait();
        txHash = receipt.hash;
      }

      // Sync approval to off-chain storage
      const res  = await fetch(`/api/escrow/${id}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address, txHash }),
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

  const canSubmitProof = isSeller && ['active', 'proof_submitted'].includes(escrow.status) && escrow.mode !== 'simple';
  const canApprove = isParty && !myApproval && ['active', 'proof_submitted'].includes(escrow.status);
  const canDispute = isParty && ['active', 'proof_submitted'].includes(escrow.status);
  const canConfirmDeposit = isBuyer && escrow.status === 'pending_deposit';
  const canSubmitDefense  = isSeller && escrow.status === 'awaiting_seller_response' && !escrow.seller?.disputeClaim;

  const MODE_ICONS = { service: '🤝', nft_swap: '🔄', nft_sale: '🖼️', milestone: '🏁', simple: '💸' };
  const MODE_LABELS = { service: 'Service & Product', nft_swap: 'NFT Swap', nft_sale: 'NFT Sale', milestone: 'Milestone', simple: 'Simple Transfer' };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">← Dashboard</Link>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-mono text-slate-500">{escrow.id.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{MODE_ICONS[escrow.mode]}</span>
              <div>
                <h1 className="text-2xl font-bold text-white">{escrow.title}</h1>
                <p className="text-sm text-slate-500">{MODE_LABELS[escrow.mode]} · Created {new Date(escrow.createdAt).toLocaleDateString()}</p>
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
                    <span className="text-xs font-semibold text-slate-500 uppercase">
                      {escrow.mode === 'nft_swap' ? 'Party A' : 'Buyer'}
                    </span>
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
                    <span className="text-xs font-semibold text-slate-500 uppercase">
                      {escrow.mode === 'nft_swap' ? 'Party B' : 'Seller'}
                    </span>
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
                <p className="text-xs text-slate-500 mb-1">
                  {escrow.mode === 'nft_swap' ? 'USDC Sweetener' : 'Amount'}
                </p>
                <p className="text-2xl font-bold text-emerald-400">{escrow.amount} USDC</p>
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

            {/* NFT details */}
            {(escrow.mode === 'nft_swap' || escrow.mode === 'nft_sale') && escrow.nftA && (
              <Section title="NFT Details">
                <div className={`grid ${escrow.mode === 'nft_swap' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  <div className="bg-white/3 rounded-lg p-4">
                    <p className="text-xs font-semibold text-purple-400 mb-2">
                      {escrow.mode === 'nft_sale' ? 'NFT For Sale' : 'Party A NFT'}
                    </p>
                    <p className="text-sm font-bold text-white">{escrow.nftA.collection} #{escrow.nftA.tokenId}</p>
                    {escrow.nftA.description && <p className="text-xs text-slate-400 mt-1">{escrow.nftA.description}</p>}
                  </div>
                  {escrow.mode === 'nft_swap' && escrow.nftB && (
                    <div className="bg-white/3 rounded-lg p-4">
                      <p className="text-xs font-semibold text-blue-400 mb-2">Party B NFT</p>
                      <p className="text-sm font-bold text-white">{escrow.nftB.collection} #{escrow.nftB.tokenId}</p>
                      {escrow.nftB.description && <p className="text-xs text-slate-400 mt-1">{escrow.nftB.description}</p>}
                    </div>
                  )}
                </div>
              </Section>
            )}

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

            {/* Milestones */}
            {escrow.mode === 'milestone' && escrow.milestones?.length > 0 && (
              <Section title="Milestones">
                <MilestoneList
                  milestones={escrow.milestones}
                  escrowId={escrow.id}
                  sellerAddress={escrow.seller.address}
                  walletAddress={address}
                  onUpdate={fetchEscrow}
                />
              </Section>
            )}

            {/* Dispute claims */}
            {['disputed', 'awaiting_seller_response'].includes(escrow.status) && (
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
                      : 'Seller has not submitted a claim.'}
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
                <button onClick={connect} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold">
                  Connect Wallet
                </button>
              </div>
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
                  onClick={() => { if (!address) { connect(); return; } setShowDisputeModal(true); }}
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
            {isBuyer && escrow.status === 'awaiting_seller_response' && (
              <div className="glass rounded-xl p-5 space-y-2">
                <p className="text-sm font-semibold text-amber-400">⏳ Awaiting Seller Defense</p>
                {escrow.disputeDeadline && (
                  <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20">
                    <span className="text-slate-400">Seller must respond by:</span>
                    <DeadlineCountdown deadline={escrow.disputeDeadline} />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  If the seller does not respond in time, the dispute auto-resolves in your favor.
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
            {address && !canConfirmDeposit && !canSubmitProof && !canApprove && !canDispute &&
             !canSubmitDefense && !(isBuyer && escrow.status === 'awaiting_seller_response') &&
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
            {[
              escrow.completedAt && { icon: '✅', label: 'Escrow Completed', time: escrow.completedAt, color: 'text-purple-400' },
              escrow.aiJudgment?.timestamp && { icon: '🤖', label: `AI Verdict: ${escrow.aiJudgment.verdict}`, time: escrow.aiJudgment.timestamp, color: 'text-emerald-400' },
              escrow.seller?.disputeClaim && escrow.updatedAt && { icon: '🛡', label: 'Seller Defense Submitted', time: escrow.updatedAt, color: 'text-purple-400' },
              escrow.disputedAt && { icon: '⚖', label: 'Dispute Raised', time: escrow.disputedAt, color: 'text-red-400' },
              escrow.proof?.submittedAt && { icon: '📋', label: 'Proof Submitted', time: escrow.proof.submittedAt, color: 'text-blue-400' },
              { icon: '🔒', label: 'Escrow Created', time: escrow.createdAt, color: 'text-slate-400' },
            ].filter(Boolean).map((event, i) => (
              <div key={i} className="glass rounded-xl p-4 flex items-center gap-4">
                <span className="text-xl">{event.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${event.color}`}>{event.label}</p>
                  <p className="text-xs text-slate-600">{new Date(event.time).toLocaleString()}</p>
                </div>
              </div>
            ))}

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

'use client';
import { useState, useRef } from 'react';
import { ethers } from 'ethers';
import { useWalletClient } from 'wagmi';
import { ESCROW_ABI } from '@/lib/contractABI';
import AIJudgmentPanel from './AIJudgmentPanel';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;

// Derives a non-zero bytes32 proof hash: IPFS CID when image uploaded, else description text.
function toDeliverableHash(imageUrl, description) {
  if (imageUrl) {
    const cid = imageUrl.split('/ipfs/').pop().split('/')[0].split('?')[0];
    return ethers.keccak256(ethers.toUtf8Bytes(cid || imageUrl));
  }
  return ethers.keccak256(ethers.toUtf8Bytes(description.trim()));
}

const STATUS_CFG = {
  pending:         { label: 'Pending',        color: 'text-slate-400',   border: 'border-slate-700'   },
  proof_submitted: { label: 'Under Review',   color: 'text-blue-400',    border: 'border-blue-500/40' },
  approved:        { label: 'Completed',      color: 'text-emerald-400', border: 'border-emerald-500/40' },
  rejected:        { label: 'Needs Revision', color: 'text-amber-400',   border: 'border-amber-500/40' },
  disputed:        { label: 'Disputed',       color: 'text-red-400',     border: 'border-red-500/40'  },
  refunded:        { label: 'Refunded',       color: 'text-slate-500',   border: 'border-slate-700'   },
};

export default function MilestoneList({ milestones, escrowId, sellerAddress, buyerAddress, walletAddress, onUpdate }) {
  const { data: walletClient } = useWalletClient();

  const isSeller = walletAddress?.toLowerCase() === sellerAddress?.toLowerCase();
  const isBuyer  = walletAddress?.toLowerCase() === buyerAddress?.toLowerCase();

  // A milestone is "closed" if approved OR if a dispute resolved in the buyer's favour
  // (status='rejected' with aiJudgment.disputeResolution=true — funds refunded, not resubmittable).
  const isClosed = m => m.status === 'approved' || (m.status === 'rejected' && !!m.aiJudgment?.disputeResolution);

  // Sequential: first non-closed milestone is current active. Everything after it = locked.
  const activeIdx = milestones.findIndex(m => !isClosed(m));

  const completedCount  = milestones.filter(isClosed).length;
  const totalAmount     = milestones.reduce((s, m) => s + parseFloat(m.amount || 0), 0);
  const releasedAmount  = milestones
    .filter(m => m.status === 'approved')   // only count funds that went to seller
    .reduce((s, m) => s + parseFloat(m.amount || 0), 0);

  const [proofForms,     setProofForms]     = useState({});
  const [loading,        setLoading]        = useState({});
  const [showDispute,    setShowDispute]    = useState({});
  const [disputeReasons, setDisputeReasons] = useState({});
  const [activeUploadId, setActiveUploadId] = useState(null);
  const fileInputRef = useRef(null);

  function setProofField(mid, field, value) {
    setProofForms(f => ({ ...f, [mid]: { ...(f[mid] || {}), [field]: value } }));
  }

  async function handleImageUpload(e) {
    const mid  = activeUploadId;
    const file = e.target.files?.[0];
    if (!file || !mid) return;
    setProofField(mid, 'uploadStatus', 'uploading');
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setProofField(mid, 'imageUrl',     data.url);
      setProofField(mid, 'uploadStatus', 'done');
    } catch {
      setProofField(mid, 'uploadStatus', 'error');
    }
    e.target.value = '';
  }

  async function submitProof(ms, msIdx) {
    const form = proofForms[ms.id] || {};
    if (!form.description?.trim()) { alert('Please describe what you completed.'); return; }

    try {
      // For initial proof (pending): commit hash on-chain first.
      // For defense (disputed): skip on-chain — contract requires MS_PENDING; oracle resolves after AI judges.
      if (ms.status !== 'disputed') {
        setLoading(l => ({ ...l, [ms.id]: 'signing' }));
        if (!walletClient) throw new Error('No wallet connected.');
        const signer          = await new ethers.BrowserProvider(walletClient).getSigner();
        const contract        = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
        const bytes32Id       = ethers.keccak256(ethers.toUtf8Bytes(escrowId));
        const deliverableHash = toDeliverableHash(form.imageUrl, form.description);
        const tx              = await contract.submitMilestoneDeliverable(bytes32Id, msIdx, deliverableHash);
        await tx.wait();
      }

      // Save proof + (if disputed) trigger AI judgment off-chain
      setLoading(l => ({ ...l, [ms.id]: 'proof' }));
      const res  = await fetch(`/api/escrow/${escrowId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:           'milestone',
          milestoneId:      ms.id,
          proofDescription: form.description || '',
          proofUrl:         form.imageUrl    || '',
          submitterAddress: walletAddress,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(l => ({ ...l, [ms.id]: null }));
    }
  }

  async function approveMilestone(ms) {
    setLoading(l => ({ ...l, [ms.id]: 'approve' }));
    try {
      const res  = await fetch(`/api/escrow/${escrowId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'milestone', milestoneId: ms.id, approverAddress: walletAddress, action: 'approve' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(l => ({ ...l, [ms.id]: null }));
    }
  }

  async function disputeMilestone(ms, msIdx) {
    const reason = disputeReasons[ms.id]?.trim();
    if (!reason) { alert('Please describe your reason for disputing.'); return; }
    setLoading(l => ({ ...l, [ms.id]: 'dispute' }));
    try {
      // 1. On-chain: disputeMilestone(bytes32 escrowId, uint256 index, bytes32 evidenceHash)
      if (!walletClient) throw new Error('No wallet connected.');
      const signer       = await new ethers.BrowserProvider(walletClient).getSigner();
      const contract     = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const bytes32Id    = ethers.keccak256(ethers.toUtf8Bytes(escrowId));
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
      const tx = await contract.disputeMilestone(bytes32Id, msIdx, evidenceHash);
      await tx.wait();

      // 2. Off-chain storage update
      const res  = await fetch(`/api/escrow/${escrowId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route:           'milestone',
          milestoneId:     ms.id,
          approverAddress: walletAddress,
          action:          'dispute',
          reason,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setShowDispute(s => ({ ...s, [ms.id]: false }));
      onUpdate?.();
    } catch (e) {
      alert(`Dispute failed: ${e.message}`);
    } finally {
      setLoading(l => ({ ...l, [ms.id]: null }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input shared across all milestones */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">
            <span className="text-white font-semibold">{completedCount}</span> / {milestones.length} milestones complete
          </span>
          <span>
            <span className="text-emerald-400 font-semibold">{releasedAmount.toFixed(2)}</span>
            <span className="text-slate-500"> / {totalAmount.toFixed(2)} USDC</span>
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${milestones.length > 0 ? (completedCount / milestones.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Milestone cards */}
      <div className="space-y-3">
        {milestones.map((ms, i) => {
          const isDisputeRefunded = ms.status === 'rejected' && !!ms.aiJudgment?.disputeResolution;
          const effectiveStatus   = isDisputeRefunded ? 'refunded' : ms.status;
          const cfg      = STATUS_CFG[effectiveStatus] || STATUS_CFG.pending;
          const isActive = i === activeIdx;
          const isLocked = activeIdx !== -1 && i > activeIdx;
          const isDone   = isClosed(ms);
          const pf       = proofForms[ms.id] || {};

          // ── Closed card (approved OR dispute-refunded) ───────────────────
          if (isDone) {
            const borderCls = isDisputeRefunded ? 'border-slate-700'      : 'border-emerald-500/20';
            const iconBg    = isDisputeRefunded ? 'bg-slate-700/40'       : 'bg-emerald-500/20';
            const iconColor = isDisputeRefunded ? 'text-slate-500'        : 'text-emerald-400';
            const iconChar  = isDisputeRefunded ? '↩'                     : '✓';
            const amtColor  = isDisputeRefunded ? 'text-slate-400'        : 'text-emerald-400';
            const subLabel  = isDisputeRefunded ? 'Refunded to buyer'     : 'Released';
            const subColor  = isDisputeRefunded ? 'text-slate-500'        : 'text-emerald-500';
            return (
              <div key={ms.id} className={`glass rounded-xl p-4 border ${borderCls}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
                    <span className={`${iconColor} text-sm`}>{iconChar}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{ms.title}</p>
                    {ms.description && <p className="text-xs text-slate-500 truncate">{ms.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${amtColor}`}>{ms.amount} USDC</p>
                    <p className={`text-xs ${subColor}`}>{subLabel}</p>
                  </div>
                </div>
                {ms.proof && (
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
                    <p className="text-xs text-slate-500 truncate flex-1">{ms.proof.description}</p>
                    {ms.proof.url && (
                      <a href={ms.proof.url} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-purple-400 hover:underline shrink-0">View proof ↗</a>
                    )}
                  </div>
                )}
                {/* AI verdict — shown for both dispute-approved (seller won) and dispute-refunded (buyer won) */}
                {ms.aiJudgment && (
                  <div className="mt-3">
                    <AIJudgmentPanel
                      judgment={ms.aiJudgment}
                      title={`Milestone ${i + 1} Verdict`}
                    />
                  </div>
                )}
              </div>
            );
          }

          // ── Locked card ─────────────────────────────────────────────────
          if (isLocked) {
            return (
              <div key={ms.id} className="glass rounded-xl p-4 opacity-40 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <span className="text-slate-600 text-sm">🔒</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-500 truncate">{ms.title}</p>
                    <p className="text-xs text-slate-600">Unlocks after milestone {i}</p>
                  </div>
                  <p className="text-sm text-slate-600 shrink-0">{ms.amount} USDC</p>
                </div>
              </div>
            );
          }

          // ── Active card (current milestone) ─────────────────────────────
          return (
            <div key={ms.id} className={`glass rounded-xl border ${cfg.border} overflow-hidden`}>
              {/* Card header */}
              <div className="p-4 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                  <span className="text-purple-400 text-xs font-bold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{ms.title}</p>
                  {ms.description && <p className="text-xs text-slate-500 truncate">{ms.description}</p>}
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-sm font-bold text-white">{ms.amount} USDC</p>
                  <p className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</p>
                </div>
              </div>

              <div className="px-4 pb-4 space-y-4">
                {/* Submitted proof display */}
                {ms.proof && (
                  <div className="bg-white/3 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-400">Submitted Proof</p>
                    {ms.proof.description && <p className="text-sm text-slate-300">{ms.proof.description}</p>}
                    {ms.proof.url && (
                      <a href={ms.proof.url} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-purple-400 hover:underline block truncate">{ms.proof.url}</a>
                    )}
                    <p className="text-xs text-slate-600">{new Date(ms.proof.submittedAt).toLocaleString()}</p>
                  </div>
                )}

                {ms.aiJudgment && (
                  <AIJudgmentPanel judgment={ms.aiJudgment} title={`Milestone ${i + 1} Verdict`} compact />
                )}

                {/* Dispute reason — shown for observers only; seller/buyer see it in their sections */}
                {ms.disputeReason && !isSeller && !isBuyer && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-400 mb-1">Dispute Reason</p>
                    <p className="text-sm text-slate-300">{ms.disputeReason}</p>
                  </div>
                )}

                {/* ── SELLER ACTIONS ── */}
                {isSeller && (ms.status === 'pending' || ms.status === 'rejected') && !isDisputeRefunded && (
                  <div className="space-y-3 pt-1">
                    {ms.status === 'rejected' && (
                      <p className="text-xs text-amber-400 font-semibold">
                        ⚠ Proof was rejected. Resubmit with better evidence.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        What did you complete? <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        placeholder="Describe what you delivered for this milestone…"
                        value={pf.description || ''}
                        onChange={e => setProofField(ms.id, 'description', e.target.value)}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none"
                      />
                    </div>

                    {/* Image upload */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Image Evidence <span className="text-slate-600 font-normal">(optional)</span>
                      </label>
                      {pf.imageUrl ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                          <span className="text-emerald-400 text-sm">✓</span>
                          <a href={pf.imageUrl} target="_blank" rel="noopener noreferrer"
                             className="text-xs text-emerald-400 hover:underline truncate flex-1">Uploaded to IPFS</a>
                          <button onClick={() => { setProofField(ms.id, 'imageUrl', ''); setProofField(ms.id, 'uploadStatus', 'idle'); }}
                                  className="text-xs text-slate-500 hover:text-red-400">×</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setActiveUploadId(ms.id); setTimeout(() => fileInputRef.current?.click(), 0); }}
                          disabled={pf.uploadStatus === 'uploading'}
                          className="w-full py-2 rounded-lg text-xs text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                          {pf.uploadStatus === 'uploading' ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-3 h-3 border border-white/20 border-t-purple-400 rounded-full animate-spin" />
                              Uploading…
                            </span>
                          ) : '+ Attach Image'}
                        </button>
                      )}
                      {pf.uploadStatus === 'error' && <p className="text-xs text-red-400">Upload failed — try again.</p>}
                    </div>

                    <button
                      onClick={() => submitProof(ms, i)}
                      disabled={!!loading[ms.id]}
                      className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold"
                    >
                      {loading[ms.id] === 'signing' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          Waiting for wallet…
                        </span>
                      ) : loading[ms.id] === 'proof' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          Saving proof…
                        </span>
                      ) : ms.status === 'rejected' ? 'Resubmit Proof' : 'Submit Proof for Review'}
                    </button>
                  </div>
                )}

                {isSeller && ms.status === 'proof_submitted' && (
                  <p className="text-xs text-blue-400 text-center py-2">
                    ⏳ Proof submitted — awaiting buyer review
                  </p>
                )}

                {isSeller && ms.status === 'disputed' && (
                  <div className="space-y-3 pt-1">
                    {/* Buyer's dispute reason */}
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-400 mb-1">⚠ Dispute opened by buyer:</p>
                      <p className="text-sm text-slate-300">{ms.disputeReason || 'No reason provided.'}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      Submit your defense proof below. The AI judge will evaluate both sides and resolve on-chain.
                    </p>

                    {/* Defense proof form — same fields as regular submission */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Your Defense <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        placeholder="Describe what you delivered and why it meets the milestone requirements…"
                        value={pf.description || ''}
                        onChange={e => setProofField(ms.id, 'description', e.target.value)}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Evidence Image <span className="text-slate-600 font-normal">(optional)</span>
                      </label>
                      {pf.imageUrl ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                          <span className="text-emerald-400 text-sm">✓</span>
                          <a href={pf.imageUrl} target="_blank" rel="noopener noreferrer"
                             className="text-xs text-emerald-400 hover:underline truncate flex-1">Uploaded to IPFS</a>
                          <button onClick={() => { setProofField(ms.id, 'imageUrl', ''); setProofField(ms.id, 'uploadStatus', 'idle'); }}
                                  className="text-xs text-slate-500 hover:text-red-400">×</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setActiveUploadId(ms.id); setTimeout(() => fileInputRef.current?.click(), 0); }}
                          disabled={pf.uploadStatus === 'uploading'}
                          className="w-full py-2 rounded-lg text-xs text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                          {pf.uploadStatus === 'uploading'
                            ? <span className="flex items-center justify-center gap-2"><span className="w-3 h-3 border border-white/20 border-t-purple-400 rounded-full animate-spin" />Uploading…</span>
                            : '+ Attach Image'}
                        </button>
                      )}
                      {pf.uploadStatus === 'error' && <p className="text-xs text-red-400">Upload failed — try again.</p>}
                    </div>
                    <button
                      onClick={() => submitProof(ms, i)}
                      disabled={!!loading[ms.id]}
                      className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold"
                    >
                      {loading[ms.id] === 'proof' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          AI judging…
                        </span>
                      ) : 'Submit Defense & Invoke AI Judge'}
                    </button>
                  </div>
                )}

                {/* ── BUYER ACTIONS ── */}
                {isBuyer && ms.status === 'proof_submitted' && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-slate-400">Review the proof above and approve or dispute.</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => approveMilestone(ms)}
                        disabled={!!loading[ms.id]}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-40"
                      >
                        {loading[ms.id] === 'approve' ? 'Processing…' : '✓ Approve & Release'}
                      </button>
                      <button
                        onClick={() => setShowDispute(s => ({ ...s, [ms.id]: !s[ms.id] }))}
                        disabled={!!loading[ms.id]}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-40"
                      >
                        ⚠ Dispute
                      </button>
                    </div>

                    {showDispute[ms.id] && (
                      <div className="space-y-2 border-t border-white/5 pt-3">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          Dispute Reason <span className="text-red-400">*</span>
                        </label>
                        <textarea
                          placeholder="Explain why this milestone proof is insufficient…"
                          value={disputeReasons[ms.id] || ''}
                          onChange={e => setDisputeReasons(r => ({ ...r, [ms.id]: e.target.value }))}
                          rows={3}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none"
                        />
                        <button
                          onClick={() => disputeMilestone(ms, i)}
                          disabled={loading[ms.id] === 'dispute'}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-40"
                        >
                          {loading[ms.id] === 'dispute' ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-red-400/20 border-t-red-400 rounded-full animate-spin" />
                              Submitting Dispute…
                            </span>
                          ) : 'Confirm Dispute'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isBuyer && ms.status === 'pending' && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    Waiting for seller to submit proof
                  </p>
                )}

                {isBuyer && ms.status === 'disputed' && (
                  <p className="text-xs text-red-400 text-center py-2">
                    ⚠ Disputed — awaiting oracle resolution
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* All done */}
      {activeIdx === -1 && (
        <div className="glass rounded-xl p-5 text-center bg-gradient-to-br from-emerald-600/10 to-purple-600/10">
          <div className="text-3xl mb-2">🏁</div>
          <p className="text-sm font-bold text-white">All milestones complete</p>
          <p className="text-xs text-slate-400 mt-1">{releasedAmount.toFixed(2)} USDC released to seller</p>
        </div>
      )}
    </div>
  );
}

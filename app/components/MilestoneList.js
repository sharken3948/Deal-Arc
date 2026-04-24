'use client';
import { useState } from 'react';
import AIJudgmentPanel from './AIJudgmentPanel';

const MS_STATUS = {
  pending:        { label: 'Pending',        dot: 'bg-slate-600',    text: 'text-slate-500' },
  proof_submitted:{ label: 'Under Review',   dot: 'bg-blue-500 pulse', text: 'text-blue-400' },
  approved:       { label: 'Approved',       dot: 'bg-emerald-500',  text: 'text-emerald-400' },
  rejected:       { label: 'Rejected',       dot: 'bg-red-500',      text: 'text-red-400' },
};

export default function MilestoneList({ milestones, escrowId, sellerAddress, walletAddress, onUpdate }) {
  const [expandedId, setExpandedId] = useState(null);
  const [proofForm, setProofForm] = useState({});
  const [loading, setLoading] = useState({});

  const isSeller = walletAddress?.toLowerCase() === sellerAddress?.toLowerCase();

  async function submitProof(milestone) {
    const form = proofForm[milestone.id] || {};
    if (!form.description && !form.url) return alert('Please provide a proof description or URL');
    setLoading(l => ({ ...l, [milestone.id]: true }));
    try {
      const res = await fetch(`/api/escrow/${escrowId}/milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestoneId: milestone.id,
          proofDescription: form.description || '',
          proofUrl: form.url || '',
          submitterAddress: walletAddress,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(l => ({ ...l, [milestone.id]: false }));
    }
  }

  const total = milestones.reduce((s, m) => s + parseFloat(m.amount || 0), 0);
  const paid = milestones
    .filter(m => m.status === 'approved')
    .reduce((s, m) => s + parseFloat(m.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">
          <span className="text-emerald-400 font-semibold">{paid.toFixed(2)}</span>
          <span className="text-slate-500"> / {total.toFixed(2)} USDC released</span>
        </p>
        <p className="text-xs text-slate-500">
          {milestones.filter(m => m.status === 'approved').length} / {milestones.length} complete
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-4 top-4 bottom-4 w-px bg-white/5" />
        <div className="space-y-3">
          {milestones.map((ms, i) => {
            const cfg = MS_STATUS[ms.status] || MS_STATUS.pending;
            const isExpanded = expandedId === ms.id;

            return (
              <div key={ms.id} className="relative pl-10">
                <div className={`absolute left-3 top-4 w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ring-[#030309]`} />
                <div className="glass rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                    onClick={() => setExpandedId(isExpanded ? null : ms.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-white/5 text-xs text-slate-500 flex items-center justify-center font-mono">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{ms.title}</p>
                        {ms.description && <p className="text-xs text-slate-500">{ms.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-white">{ms.amount} USDC</span>
                      <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                      <span className="text-slate-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
                      {ms.proof && (
                        <div className="glass rounded-lg p-3">
                          <p className="text-xs font-semibold text-slate-400 mb-1">Submitted Proof</p>
                          {ms.proof.description && <p className="text-sm text-slate-300">{ms.proof.description}</p>}
                          {ms.proof.url && (
                            <a href={ms.proof.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-purple-400 hover:underline mt-1 block truncate">
                              {ms.proof.url}
                            </a>
                          )}
                          <p className="text-xs text-slate-600 mt-1">{new Date(ms.proof.submittedAt).toLocaleString()}</p>
                        </div>
                      )}

                      {ms.aiJudgment && (
                        <AIJudgmentPanel judgment={ms.aiJudgment} title={`Milestone ${i+1} Verdict`} />
                      )}

                      {isSeller && ms.status === 'pending' && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-400">Submit Proof</p>
                          <textarea
                            placeholder="Describe what you completed for this milestone…"
                            value={proofForm[ms.id]?.description || ''}
                            onChange={e => setProofForm(f => ({ ...f, [ms.id]: { ...f[ms.id], description: e.target.value } }))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none"
                            rows={3}
                          />
                          <input
                            type="url"
                            placeholder="Proof URL (optional)"
                            value={proofForm[ms.id]?.url || ''}
                            onChange={e => setProofForm(f => ({ ...f, [ms.id]: { ...f[ms.id], url: e.target.value } }))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                          />
                          <button
                            onClick={() => submitProof(ms)}
                            disabled={loading[ms.id]}
                            className="btn-primary w-full py-2 rounded-lg text-sm font-semibold"
                          >
                            {loading[ms.id] ? 'Submitting & Evaluating…' : 'Submit Proof for AI Review'}
                          </button>
                        </div>
                      )}

                      {isSeller && ms.status === 'rejected' && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-amber-400">Proof was rejected. Resubmit with better evidence.</p>
                          <textarea
                            placeholder="Improved proof description…"
                            value={proofForm[ms.id]?.description || ''}
                            onChange={e => setProofForm(f => ({ ...f, [ms.id]: { ...f[ms.id], description: e.target.value } }))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none"
                            rows={3}
                          />
                          <input
                            type="url"
                            placeholder="Proof URL (optional)"
                            value={proofForm[ms.id]?.url || ''}
                            onChange={e => setProofForm(f => ({ ...f, [ms.id]: { ...f[ms.id], url: e.target.value } }))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                          />
                          <button
                            onClick={() => submitProof(ms)}
                            disabled={loading[ms.id]}
                            className="btn-primary w-full py-2 rounded-lg text-sm font-semibold"
                          >
                            {loading[ms.id] ? 'Submitting…' : 'Resubmit Proof'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect, useRef } from 'react';

function DeadlineCountdown({ deadline }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) { setText('Deadline has passed'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setText(`${h}h ${m}m ${s}s remaining`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return <span className="font-mono text-amber-400 font-semibold">{text}</span>;
}

export default function SellerResponseModal({ escrow, address, onClose, onResolved }) {
  const [claim, setClaim]       = useState('');
  const [evidence, setEvidence] = useState('');
  const [step, setStep]         = useState('form'); // form | judging | done
  const [error, setError]       = useState('');
  const [judgment, setJudgment] = useState(null);
  const [winner, setWinner]     = useState('');
  const [evidenceUrl, setEvidenceUrl]   = useState('');
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | done | error
  const fileInputRef = useRef(null);

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('uploading');
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setEvidenceUrl(data.url);
      setUploadStatus('done');
    } catch (err) {
      console.error('[upload]', err);
      setUploadStatus('error');
    }
    e.target.value = '';
  }

  async function handleSubmit() {
    if (!claim.trim()) { setError('Please describe your defense.'); return; }
    setError('');
    setStep('judging');
    try {
      const res = await fetch('/api/dispute/respond', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: escrow.id, address, claim: claim.trim(), evidence: evidence.trim(), evidenceUrl: evidenceUrl || null }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to submit response');
      setJudgment(data.judgment);
      setWinner(data.winner);
      setStep('done');
      onResolved?.();
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
  }

  const winnerRole = winner
    ? (winner.toLowerCase() === escrow?.buyer?.address?.toLowerCase() ? 'Buyer' : 'Seller')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-lg p-6 space-y-5 border border-purple-500/20">

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Submit Your Defense</h2>
            <p className="text-xs text-slate-500 mt-0.5">{escrow?.title}</p>
          </div>
          <button onClick={onClose} disabled={step !== 'form'} className="text-slate-500 hover:text-slate-300 text-lg leading-none disabled:opacity-40">×</button>
        </div>

        {step === 'done' ? (
          <div className="space-y-4">
            <div className="rounded-xl p-4 bg-amber-400/10 border border-amber-400/25 space-y-2">
              <p className="text-sm font-bold text-amber-400">⚖ AI Judge has ruled</p>
              {judgment && (
                <>
                  <p className="text-xs text-slate-400">
                    Verdict: <span className="font-semibold text-white">{judgment.verdict}</span>
                    {' '}· Confidence: <span className="font-semibold text-white">{judgment.confidence}%</span>
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{judgment.reasoning}</p>
                  {judgment.recommendation && <p className="text-xs text-slate-400 italic">{judgment.recommendation}</p>}
                </>
              )}
              {winnerRole && (
                <p className="text-sm font-semibold text-white">
                  Funds awarded to: <span className="text-emerald-400">{winnerRole}</span>
                </p>
              )}
            </div>
            <button onClick={onClose} className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold">Close</button>
          </div>
        ) : (
          <>
            <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/20">
              <p className="text-xs text-purple-300">
                A dispute has been raised against this escrow. Submit your defense and the AI judge will
                evaluate both sides, issuing a binding verdict releasing <strong>{escrow?.amount} USDC</strong>.
              </p>
            </div>

            {escrow?.disputeDeadline && (
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20">
                <span className="text-slate-400">Time to respond:</span>
                <DeadlineCountdown deadline={escrow.disputeDeadline} />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Your Defense <span className="text-red-400">*</span>
              </label>
              <textarea
                disabled={step !== 'form'}
                placeholder="Explain why you have fulfilled your obligations and are entitled to payment…"
                value={claim}
                onChange={e => setClaim(e.target.value)}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 resize-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Evidence <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <textarea
                disabled={step !== 'form'}
                placeholder="Links, screenshots, transaction hashes, or any supporting evidence…"
                value={evidence}
                onChange={e => setEvidence(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 resize-none disabled:opacity-50"
              />
            </div>

            {/* Image evidence */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Image Evidence <span className="text-slate-600 font-normal">(optional — analyzed by AI vision model)</span>
              </label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {evidenceUrl ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/20">
                  <span className="text-emerald-400 text-sm">✓</span>
                  <a href={evidenceUrl} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-emerald-400 hover:underline truncate flex-1">
                    Image uploaded to IPFS
                  </a>
                  <button onClick={() => { setEvidenceUrl(''); setUploadStatus('idle'); }}
                          className="text-xs text-slate-500 hover:text-red-400 ml-1">×</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={step !== 'form' || uploadStatus === 'uploading'}
                  className="w-full py-2 rounded-lg text-xs text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {uploadStatus === 'uploading' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border border-white/20 border-t-purple-400 rounded-full animate-spin" />
                      Uploading to IPFS…
                    </span>
                  ) : '+ Attach Image Evidence'}
                </button>
              )}
              {uploadStatus === 'error' && <p className="text-xs text-red-400">Upload failed — please try again.</p>}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {step === 'judging' && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-4 h-4 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin shrink-0" />
                AI judge is evaluating both sides…
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={step !== 'form'}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={step !== 'form'}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn-primary disabled:opacity-40"
              >
                Submit Defense & Invoke AI Judge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';
import { useState, useRef } from 'react';
import { ethers } from 'ethers';
import { ESCROW_ABI, getRabbyProvider } from '@/lib/contractABI';
import { useWallet } from '@/app/contexts/WalletContext';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;

function toBytes32(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

// Derive a non-zero bytes32 evidence hash for the contract.
// Prefers the IPFS CID when an image was uploaded, falls back to hashing the reason text.
function toEvidenceHash(evidenceUrl, reason) {
  if (evidenceUrl) {
    // Extract CID from URLs like https://…/ipfs/<CID> or ipfs://<CID>
    const cid = evidenceUrl.split('/ipfs/').pop().split('/')[0].split('?')[0];
    return ethers.keccak256(ethers.toUtf8Bytes(cid || evidenceUrl));
  }
  return ethers.keccak256(ethers.toUtf8Bytes(reason.trim()));
}

export default function DisputeModal({ escrow, address, onClose, onResolved }) {
  const { provider, switchToARC } = useWallet();
  const [reason, setReason]       = useState('');
  const [evidence, setEvidence]   = useState('');
  const [step, setStep]           = useState('form'); // form | signing | submitting | done
  const [error, setError]         = useState('');
  const [deadline, setDeadline]   = useState(null);
  const [evidenceUrl, setEvidenceUrl]     = useState('');
  const [uploadStatus, setUploadStatus]   = useState('idle'); // idle | uploading | done | error
  const fileInputRef = useRef(null);

  async function handleSubmit() {
    if (!reason.trim()) { setError('Please describe your reason for the dispute.'); return; }
    setError('');

    try {
      // 1. Switch to ARC chain using the connected wallet's provider
      await switchToARC();

      // 2. User signs contract.dispute() on-chain
      setStep('signing');
      const prov   = provider ?? getRabbyProvider();
      if (!prov) throw new Error('No wallet provider found. Is Rabby installed?');
      const signer = await new ethers.BrowserProvider(prov).getSigner();
      const contract  = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const bytes32Id     = toBytes32(escrow.id);
      const evidenceHash  = toEvidenceHash(evidenceUrl, reason);
      const tx            = await contract.dispute(bytes32Id, evidenceHash);
      const receipt   = await tx.wait();

      // 3. Register dispute off-chain — seller now has 24h to respond
      setStep('submitting');
      const res = await fetch('/api/dispute/resolve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:            escrow.id,
          address,
          reason:        reason.trim(),
          evidence:      evidence.trim(),
          evidenceUrl:   evidenceUrl || null,
          disputeTxHash: receipt.hash,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Dispute registration failed');

      setDeadline(data.deadline);
      setStep('done');
      onResolved?.();
    } catch (e) {
      setError(e.message);
      setStep('form');
    }
  }

  const isBuyer = address?.toLowerCase() === escrow?.buyer?.address?.toLowerCase();

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-lg p-6 space-y-5 border border-red-500/20">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Raise Dispute</h2>
            <p className="text-xs text-slate-500 mt-0.5">{escrow?.title}</p>
          </div>
          <button onClick={onClose} disabled={step !== 'form'} className="text-slate-500 hover:text-slate-300 text-lg leading-none disabled:opacity-40">×</button>
        </div>

        {step === 'done' ? (
          <div className="space-y-4">
            <div className="rounded-xl p-4 bg-blue-400/10 border border-blue-400/25 space-y-2">
              <p className="text-sm font-bold text-blue-400">⚖ Dispute Raised</p>
              <p className="text-sm text-slate-300">
                The seller has been notified and has <strong className="text-white">24 hours</strong> to submit their defense.
                The AI judge will rule once both sides are heard.
              </p>
              {deadline && (
                <p className="text-xs text-slate-500">
                  Deadline: {new Date(deadline).toLocaleString()}
                </p>
              )}
            </div>
            <button onClick={onClose} className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Warning */}
            <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">
                ⚠ Raising a dispute pauses the escrow. The AI judge will evaluate available evidence and
                issue a binding verdict, releasing <strong>{escrow?.amount} USDC</strong> to the winner on-chain.
              </p>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                disabled={step !== 'form'}
                placeholder={isBuyer
                  ? 'Describe why you believe the seller has not fulfilled their obligations…'
                  : 'Describe why you believe you have fulfilled your obligations and are owed payment…'}
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 resize-none disabled:opacity-50"
              />
            </div>

            {/* Evidence */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Evidence Description <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <textarea
                disabled={step !== 'form'}
                placeholder="Links, transaction hashes, screenshots, or any supporting evidence…"
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

            {/* Step indicator */}
            {step !== 'form' && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-4 h-4 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin shrink-0" />
                {step === 'signing'    && 'Waiting for wallet confirmation…'}
                {step === 'submitting' && 'Registering dispute…'}
              </div>
            )}

            {/* Actions */}
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
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-40"
              >
                Raise Dispute
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

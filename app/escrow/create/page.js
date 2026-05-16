'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/app/components/Navbar';
import { useWallet } from '@/app/contexts/WalletContext';

const MODES = [
  {
    id: 'simple',
    label: 'Simple Transfer',
    desc: 'Buyer locks USDC. Both parties approve to release funds. No AI judge required.',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
    iconColor: 'text-blue-400',
    icon: (cls) => (
      <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    id: 'service',
    label: 'Service & Product',
    desc: 'Buyer locks USDC. Seller submits proof. AI Judge evaluates completion.',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/5',
    iconColor: 'text-purple-400',
    icon: (cls) => (
      <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    id: 'milestone',
    label: 'Milestone Escrow',
    desc: 'Total USDC locked upfront. Seller submits proof per milestone. Payments release progressively. AI Judge resolves disputes.',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    iconColor: 'text-emerald-400',
    icon: (cls) => (
      <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
  },
];

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-sm text-white placeholder-slate-600 ${props.className || ''}`}
    />
  );
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-sm text-white placeholder-slate-600 resize-none ${props.className || ''}`}
    />
  );
}

export default function CreateEscrow() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [createdEscrow, setCreatedEscrow] = useState(null);
  const [milestones, setMilestones] = useState([{ title: '', description: '', amount: '' }]);
  const [form, setForm] = useState({
    title: '', description: '', requirements: '', amount: '', buyer: '', seller: '',
  });

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function addMilestone() {
    setMilestones(ms => [...ms, { title: '', description: '', amount: '' }]);
  }
  function removeMilestone(i) {
    setMilestones(ms => ms.filter((_, idx) => idx !== i));
  }
  function updateMilestone(i, k, v) {
    setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [k]: v } : m));
  }

  const totalMilestoneAmount = milestones.reduce((s, m) => s + parseFloat(m.amount || 0), 0);

  async function handleSubmit() {
    if (!address) { await connect(); return; }

    const payload = {
      mode,
      title: form.title,
      description: form.description,
      requirements: form.requirements,
      buyer: form.buyer || address,
      seller: form.seller,
    };

    if (mode === 'service' || mode === 'simple') {
      payload.amount = form.amount;
    } else if (mode === 'milestone') {
      payload.amount = totalMilestoneAmount.toFixed(2);
      payload.milestones = milestones;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setCreatedEscrow(data.escrow);
      setStep(4);
    } catch (e) {
      alert(`Failed to create escrow: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Steps */}
        <div className="flex items-center gap-3 mb-10">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= s ? 'bg-purple-600 text-white' : 'bg-white/10 text-slate-500'
              }`}>{s}</div>
              {s < 3 && <div className={`w-12 h-px ${step > s ? 'bg-purple-600' : 'bg-white/10'}`} />}
            </div>
          ))}
          <span className="text-xs text-slate-500 ml-2">
            {step === 1 ? 'Choose Mode' : step === 2 ? 'Fill Details' : step === 3 ? 'Review & Create' : 'Done!'}
          </span>
        </div>

        {/* Step 1: Mode Selection */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Choose Escrow Mode</h2>
            <p className="text-slate-400 mb-8">Select the type of escrow you want to create.</p>
            <div className="flex flex-col gap-4">
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setStep(2); }}
                  className={`w-full text-left rounded-xl py-8 px-8 border-t border-r border-b border-l-4 ${m.border} ${m.bg} transition-all hover:brightness-110`}
                >
                  <div className={`mb-5 ${m.iconColor}`}>
                    {m.icon('w-12 h-12')}
                  </div>
                  <p className="font-bold text-white text-lg mb-2">{m.label}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep(1)} className="text-slate-500 hover:text-white text-sm">← Back</button>
              <h2 className="text-2xl font-bold text-white">
                {MODES.find(m => m.id === mode)?.label}
              </h2>
            </div>

            <div className="space-y-5">
              <Field label="Title" hint="A short descriptive title for this escrow">
                <Input placeholder="e.g. Logo design for ArcDAO" value={form.title} onChange={e => setField('title', e.target.value)} />
              </Field>

              <Field label="Description" hint="Describe the agreement in detail">
                <Textarea placeholder="What is being exchanged or delivered?" rows={3}
                  value={form.description} onChange={e => setField('description', e.target.value)} />
              </Field>

              {(mode === 'service' || mode === 'milestone') && (
                <Field label="Delivery Requirements" hint="What exactly must the seller deliver for the AI to approve?">
                  <Textarea placeholder="List specific deliverables the AI judge will evaluate…" rows={3}
                    value={form.requirements} onChange={e => setField('requirements', e.target.value)} />
                </Field>
              )}

              {/* Parties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Buyer Address"
                  hint={`${address ? 'Leave blank to use your connected wallet' : 'Connect wallet or enter manually'}`}>
                  <Input
                    placeholder={address || '0x…'}
                    value={form.buyer}
                    onChange={e => setField('buyer', e.target.value)}
                  />
                </Field>
                <Field label="Seller Address">
                  <Input placeholder="0x…" value={form.seller} onChange={e => setField('seller', e.target.value)} />
                </Field>
              </div>

              {(mode === 'service' || mode === 'simple') && (
                <Field label="USDC Amount" hint="Amount to lock in escrow">
                  <div className="relative">
                    <Input type="number" placeholder="100.00" value={form.amount}
                      onChange={e => setField('amount', e.target.value)} className="pr-16" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">USDC</span>
                  </div>
                </Field>
              )}

              {/* Milestones */}
              {mode === 'milestone' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-300">Milestones</p>
                    <span className="text-xs text-slate-500">Total: <span className="text-white font-semibold">{totalMilestoneAmount.toFixed(2)} USDC</span></span>
                  </div>
                  <div className="space-y-3">
                    {milestones.map((ms, i) => (
                      <div key={i} className="glass rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-purple-400">Milestone {i + 1}</p>
                          {milestones.length > 1 && (
                            <button onClick={() => removeMilestone(i)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <Input placeholder="Title" value={ms.title}
                              onChange={e => updateMilestone(i, 'title', e.target.value)} />
                          </div>
                          <div className="relative">
                            <Input type="number" placeholder="USDC" value={ms.amount}
                              onChange={e => updateMilestone(i, 'amount', e.target.value)} className="pr-12" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">USDC</span>
                          </div>
                        </div>
                        <Input placeholder="Description (what must be delivered?)" value={ms.description}
                          onChange={e => updateMilestone(i, 'description', e.target.value)} />
                      </div>
                    ))}
                    <button
                      onClick={addMilestone}
                      className="w-full glass rounded-xl py-3 text-sm text-slate-400 hover:text-purple-300 hover:border-purple-500/30 transition-colors border border-dashed border-white/10"
                    >
                      + Add Milestone
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(3)}
              disabled={!form.title || !form.seller || (['service', 'simple'].includes(mode) && !form.amount)}
              className="btn-primary w-full mt-8 py-3 rounded-xl font-semibold"
            >
              Review →
            </button>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep(2)} className="text-slate-500 hover:text-white text-sm">← Back</button>
              <h2 className="text-2xl font-bold text-white">Review & Create</h2>
            </div>

            <div className="glass rounded-xl p-6 space-y-4 mb-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                <span className={MODES.find(m => m.id === mode)?.iconColor}>
                  {MODES.find(m => m.id === mode)?.icon('w-8 h-8')}
                </span>
                <div>
                  <p className="font-bold text-white">{form.title}</p>
                  <p className="text-xs text-slate-500">{MODES.find(m => m.id === mode)?.label}</p>
                </div>
              </div>
              {form.description && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-sm text-slate-300">{form.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Buyer</p>
                  <p className="text-xs font-mono text-slate-300">{form.buyer || address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Seller</p>
                  <p className="text-xs font-mono text-slate-300">{form.seller}</p>
                </div>
              </div>
              {(mode === 'service' || mode === 'simple') && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Escrow Amount</p>
                  <p className="text-xl font-bold text-emerald-400">{form.amount} USDC</p>
                  <p className="text-xs text-slate-500 mt-1">Platform fee: 2.5% deducted from seller payment upon release</p>
                </div>
              )}
              {mode === 'milestone' && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Total ({milestones.length} milestones)</p>
                  <p className="text-xl font-bold text-emerald-400">{totalMilestoneAmount.toFixed(2)} USDC</p>
                  <p className="text-xs text-slate-500 mt-1">Platform fee: 2.5% deducted from seller payment upon release</p>
                </div>
              )}
            </div>

            {mode === 'simple' ? (
              <div className="glass rounded-xl p-4 mb-6 text-sm text-slate-400">
                <p className="font-semibold text-emerald-400 mb-1">💸 Simple Mutual Approval</p>
                <p>Send <strong className="text-white">{form.amount} USDC</strong> to the escrow wallet, then both parties approve to release. No AI judge needed.</p>
              </div>
            ) : (
              <div className="glass rounded-xl p-4 mb-6 text-sm text-slate-400">
                <p className="font-semibold text-blue-400 mb-1">📋 Next Steps After Creation</p>
                <p>Send <strong className="text-white">{mode === 'milestone' ? `${totalMilestoneAmount.toFixed(2)}` : form.amount} USDC</strong> to the escrow wallet address shown after creation.</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !address}
              className="btn-primary w-full py-3 rounded-xl font-semibold text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating Escrow…
                </span>
              ) : !address ? 'Connect Wallet to Create' : 'Create Escrow'}
            </button>
          </div>
        )}

        {/* Step 4: Success + deposit instructions */}
        {step === 4 && createdEscrow && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">Escrow Created!</h2>
            <p className="text-slate-400 mb-8">Your escrow is live on ARC Testnet.</p>

            {(createdEscrow.mode === 'service' || createdEscrow.mode === 'milestone' || createdEscrow.mode === 'simple') && (
              <div className="glass rounded-xl p-6 mb-6 text-left">
                <p className="text-sm font-semibold text-amber-400 mb-3">💰 Deposit Required</p>
                <p className="text-sm text-slate-300 mb-2">
                  Lock <strong className="text-white">{createdEscrow.amount} USDC</strong> into the escrow smart contract to activate it.
                </p>
                <p className="text-xs text-slate-500">
                  Open the escrow page and click <strong className="text-slate-300">Deposit USDC via Wallet</strong>.
                  Your wallet will prompt you to approve the spend and sign the deposit — no manual transfer needed.
                </p>
                {createdEscrow.createTxHash && (
                  <p className="text-xs text-emerald-400 mt-3 font-mono break-all">
                    ✓ Registered on-chain: {createdEscrow.createTxHash}
                  </p>
                )}
                {createdEscrow.contractWarning && (
                  <p className="text-xs text-amber-400 mt-3">⚠️ {createdEscrow.contractWarning}</p>
                )}
              </div>
            )}

            {createdEscrow.aiJudgment && (
              <div className="glass rounded-xl p-4 mb-6 text-left">
                <p className="text-sm font-semibold text-purple-400 mb-2">🤖 AI Initial Evaluation</p>
                <p className="text-sm text-slate-300">
                  Verdict: <strong className="text-white">{createdEscrow.aiJudgment.verdict}</strong>
                  {' '}({createdEscrow.aiJudgment.confidence}% confidence)
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push(`/escrow/${createdEscrow.id}`)}
                className="btn-primary px-6 py-3 rounded-xl font-semibold"
              >
                View Escrow →
              </button>
              <button
                onClick={() => { setStep(1); setMode(null); setCreatedEscrow(null); setForm({ title:'',description:'',requirements:'',amount:'',buyer:'',seller:'' }); setMilestones([{ title:'',description:'',amount:'' }]); }}
                className="glass px-6 py-3 rounded-xl font-semibold text-sm text-slate-300"
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

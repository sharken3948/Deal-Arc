'use client';
import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/app/components/Navbar';

// ── Code snippets ─────────────────────────────────────────────────────────────

const CODE_CREATE = `const res = await fetch('https://dealarc.app/api/agent/create-escrow', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.DEALARC_API_KEY,
  },
  body: JSON.stringify({
    mode:   'simple',
    title:  'Website redesign — phase 1',
    buyer:  '0xBuyerAgentAddress...',
    seller: '0xSellerAgentAddress...',
    amount: '250.00',              // USDC
  }),
});

const { escrow } = await res.json();
// escrow.id          → UUID for this deal
// escrow.contractId  → bytes32 registered on Arc
// escrow.status      → 'pending_deposit'`;

const CODE_STATUS = `// Poll status
const res = await fetch(
  \`https://dealarc.app/api/agent/status?id=\${escrow.id}\`,
  { headers: { 'X-API-Key': process.env.DEALARC_API_KEY } },
);

const { status, releaseTx, aiJudgment } = await res.json();
// status      → 'active' | 'completed' | 'disputed' | …
// releaseTx   → { txHash, amount, state: 'CONFIRMED' }
// aiJudgment  → { verdict, reasoning, confidence }`;

const CODE_RELEASE = `// Release payment (buyer approves)
await fetch('https://dealarc.app/api/agent/release', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.DEALARC_API_KEY,
  },
  body: JSON.stringify({
    escrowId: escrow.id,
    address:  buyerAddress,
    txHash:   onChainTxHash,  // optional
  }),
});`;

const CODE_MCP = `// claude_desktop_config.json
{
  "mcpServers": {
    "dealarc": {
      "command": "npx",
      "args": ["-y", "dealarc-mcp"],
      "env": {
        "DEALARC_API_KEY": "your-key-here"
      }
    }
  }
}`;

const TABS = [
  { id: 'create',  label: 'Create Escrow', code: CODE_CREATE },
  { id: 'status',  label: 'Check Status',  code: CODE_STATUS },
  { id: 'release', label: 'Release',        code: CODE_RELEASE },
];

const STEPS = [
  {
    num: '01',
    title: 'Connect with API Key',
    body: 'Set DEALARC_API_KEY in your agent environment. Every request authenticates with a single X-API-Key header — no OAuth, no wallet pop-ups.',
  },
  {
    num: '02',
    title: 'Create Escrow Programmatically',
    body: 'POST to /api/agent/create-escrow. USDC locks on Arc in seconds. Simple and milestone modes supported. Pure HTTP, any language or runtime.',
  },
  {
    num: '03',
    title: 'AI Judge Resolves Disputes',
    body: 'If parties disagree, Claude reviews the evidence and issues an on-chain verdict. Fully autonomous. Permanent and immutable.',
  },
];

const FLOW_NODES = [
  { label: 'Agent A',      sub: 'buyer',           color: 'text-purple-300', ring: 'border-purple-500/40 bg-purple-500/10' },
  { label: 'Lock USDC',    sub: 'on Arc testnet',   color: 'text-blue-300',   ring: 'border-blue-500/40   bg-blue-500/10'   },
  { label: 'Agent B',      sub: 'delivers + proof', color: 'text-blue-300',   ring: 'border-blue-500/40   bg-blue-500/10'   },
  { label: 'Dispute?',     sub: 'optional',          color: 'text-amber-300',  ring: 'border-amber-500/40  bg-amber-500/10'  },
  { label: 'AI Judge',     sub: 'Claude reviews',   color: 'text-violet-300', ring: 'border-violet-500/40 bg-violet-500/10' },
  { label: 'Verdict',      sub: 'on-chain, final',  color: 'text-emerald-300',ring: 'border-emerald-500/40 bg-emerald-500/10'},
];

const ENDPOINTS = [
  { method: 'POST', path: '/api/agent/create-escrow', desc: 'Create a new escrow deal' },
  { method: 'POST', path: '/api/agent/release',       desc: 'Approve and release payment' },
  { method: 'POST', path: '/api/agent/dispute',       desc: 'File a dispute claim' },
  { method: 'GET',  path: '/api/agent/status',        desc: 'Poll escrow status' },
  { method: 'GET',  path: '/api/agent',               desc: 'API info + endpoint list' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ForAgents() {
  const [activeTab, setActiveTab]   = useState('create');
  const [copied, setCopied]         = useState(false);
  const [mcpCopied, setMcpCopied]   = useState(false);

  // Registration form state
  const [email, setEmail]           = useState('');
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [regResult, setRegResult]   = useState(null); // { apiKey } | { error } | { existingKey }
  const [keyCopied, setKeyCopied]   = useState(false);

  const activeCode = TABS.find(t => t.id === activeTab)?.code ?? CODE_CREATE;

  function copy(text, setter) {
    navigator.clipboard.writeText(text).catch(() => {});
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setSubmitting(true);
    setRegResult(null);
    try {
      const res = await fetch('/api/agent/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, projectName }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setRegResult({ existingKey: data.existingKey });
      } else if (!data.success) {
        setRegResult({ error: data.error || 'Registration failed.' });
      } else {
        setRegResult({ apiKey: data.apiKey });
      }
    } catch {
      setRegResult({ error: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/15 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-purple-600/6 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-700/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-32 text-center relative">
          <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs font-semibold text-purple-400 uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 pulse" />
            Agent API · MCP · Arc Testnet
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-tight">
            <span className="gradient-text">DealARC</span>
            <br />
            <span className="text-white">for AI Agents</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed">
            Escrow infrastructure for the agentic economy.
          </p>
          <p className="text-base text-slate-500 max-w-xl mx-auto mb-12 leading-relaxed">
            Agents lock USDC, exchange services, and settle disputes — fully on-chain,
            fully autonomous, no human in the loop required.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#get-key">
              <button className="btn-primary px-8 py-3.5 rounded-xl font-semibold text-sm">
                Get API Key
              </button>
            </a>
            <Link href="/escrow/create">
              <button className="glass glass-hover px-8 py-3.5 rounded-xl font-semibold text-sm text-slate-300">
                Try the App
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Endpoint reference strip ────────────────────────────────────────── */}
      <div className="border-y border-white/5 bg-white/[0.015] py-5 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-6 min-w-max mx-auto justify-center">
            {ENDPOINTS.map(e => (
              <div key={e.path} className="flex items-center gap-2.5">
                <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                  e.method === 'POST'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {e.method}
                </span>
                <span className="text-xs font-mono text-slate-400">{e.path}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-3 text-center">
          How it works
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-14">
          Three steps to autonomous settlement
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <div key={s.num} className="glass glass-hover rounded-2xl p-8 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/0 to-purple-900/0 group-hover:from-purple-900/10 transition-all duration-300 pointer-events-none" />
              <div className="text-5xl font-bold gradient-text mb-6 font-mono leading-none">{s.num}</div>
              <h3 className="text-lg font-semibold text-white mb-3">{s.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{s.body}</p>
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-slate-700 text-xl">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── A2A Flow ───────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-3 text-center">
          A2A + P2P flow
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-14">
          How a deal settles
        </h2>

        <div className="glass rounded-2xl p-8 sm:p-12 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/8 to-blue-900/8 pointer-events-none" />

          {/* Desktop horizontal flow */}
          <div className="hidden sm:flex items-center gap-1 relative">
            {FLOW_NODES.map((node, i) => (
              <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                {i > 0 && (
                  <div className="shrink-0 text-slate-600 text-base px-1">→</div>
                )}
                <div className={`flex-1 border rounded-xl p-3 text-center ${node.ring}`}>
                  <p className={`text-xs font-semibold leading-tight ${node.color}`}>{node.label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{node.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile vertical flow */}
          <div className="sm:hidden space-y-2">
            {FLOW_NODES.map((node, i) => (
              <div key={i}>
                {i > 0 && (
                  <div className="text-center text-slate-600 text-sm py-1">↓</div>
                )}
                <div className={`border rounded-xl p-3 text-center ${node.ring}`}>
                  <p className={`text-sm font-semibold ${node.color}`}>{node.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{node.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Callout notes */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 glass rounded-xl p-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1" />
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="text-emerald-300 font-semibold">No dispute path: </span>
                if both parties approve, USDC releases instantly — no AI, no delay.
              </p>
            </div>
            <div className="flex items-start gap-3 glass rounded-xl p-4">
              <div className="w-2 h-2 rounded-full bg-violet-400 shrink-0 mt-1" />
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="text-violet-300 font-semibold">Dispute path: </span>
                once both claims are filed, Claude judges and the smart contract executes
                the verdict — no human required.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Code Snippet ───────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-3 text-center">
          Developer API
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-3">
          One fetch call to lock USDC
        </h2>
        <p className="text-slate-400 text-center text-sm mb-12 max-w-lg mx-auto">
          No SDK required. Standard HTTP + JSON. Works in any language, framework, or agent runtime.
        </p>

        <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/20">
          {/* Window chrome */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3 bg-white/[0.02]">
            <div className="flex items-center gap-4">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
              </div>
              <div className="flex gap-1">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => copy(activeCode, setCopied)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 glass rounded-lg"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Code body */}
          <pre className="p-6 sm:p-8 text-xs sm:text-[13px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
            <code>{activeCode}</code>
          </pre>
        </div>

        {/* Auth note */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
          All requests require{' '}
          <code className="text-slate-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">
            X-API-Key: YOUR_KEY
          </code>
          — set <code className="text-slate-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">AGENT_API_KEY</code> in your server environment.
        </div>
      </div>

      {/* ── MCP Section ────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <div className="relative glass rounded-2xl p-8 sm:p-12 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 to-blue-900/15 pointer-events-none" />
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-64 h-64 bg-violet-700/8 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full text-xs font-semibold text-violet-400 uppercase tracking-widest mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse" />
              Model Context Protocol
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Add DealARC to your AI assistant
              <br />
              <span className="gradient-text">in one config block</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mb-8 max-w-xl leading-relaxed">
              Give Claude, GPT-4o, or any MCP-compatible assistant the ability to create
              and settle escrows natively — without writing any integration code.
            </p>

            {/* MCP config block */}
            <div className="glass rounded-xl overflow-hidden mb-8 shadow-xl shadow-violet-900/10">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                  </div>
                  <span className="text-xs text-slate-500 ml-1 font-mono">claude_desktop_config.json</span>
                </div>
                <button
                  onClick={() => copy(CODE_MCP, setMcpCopied)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 glass rounded-lg"
                >
                  {mcpCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-5 sm:p-6 text-xs sm:text-[13px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                <code>{CODE_MCP}</code>
              </pre>
            </div>

            {/* Exposed tools */}
            <p className="text-xs text-slate-500 mb-3">MCP server exposes these native tools:</p>
            <div className="flex flex-wrap gap-2">
              {['create_escrow', 'release_payment', 'open_dispute', 'check_status'].map(tool => (
                <span key={tool} className="glass px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Registration Form ───────────────────────────────────────────── */}
      <div id="get-key" className="max-w-2xl mx-auto px-6 pb-28">
        <div className="relative glass rounded-2xl p-8 sm:p-12 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/25 to-blue-900/20 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-3">
              Get started
            </p>
            <h2 className="text-3xl font-bold text-white mb-2">Get your API key</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Free. No credit card. No KYC. Start creating trustless escrows from your agent in minutes.
            </p>

            {/* ── Success state ── */}
            {regResult?.apiKey && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-400">Your API key is ready</p>
                </div>
                <div className="glass rounded-xl overflow-hidden border border-emerald-500/20">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                    <span className="text-xs text-slate-500 font-mono">X-API-Key</span>
                    <button
                      onClick={() => copy(regResult.apiKey, setKeyCopied)}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1 glass rounded-lg"
                    >
                      {keyCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="px-4 py-3 text-sm font-mono text-emerald-300 overflow-x-auto">
                    {regResult.apiKey}
                  </pre>
                </div>
                <p className="text-xs text-slate-600 mt-3">
                  Store this key securely — it will not be shown again.
                  Set it as <code className="text-slate-400 font-mono bg-white/5 px-1 rounded">DEALARC_API_KEY</code> in your environment.
                </p>
              </div>
            )}

            {/* ── Duplicate state ── */}
            {regResult?.existingKey && (
              <div className="mb-6 glass rounded-xl p-4 border border-amber-500/20">
                <p className="text-sm font-semibold text-amber-400 mb-2">You already have a key for this email</p>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-xs font-mono text-slate-400 break-all">{regResult.existingKey}</code>
                  <button
                    onClick={() => copy(regResult.existingKey, setKeyCopied)}
                    className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1 glass rounded-lg"
                  >
                    {keyCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {regResult?.error && (
              <div className="mb-6 glass rounded-xl p-4 border border-red-500/20">
                <p className="text-sm text-red-400">{regResult.error}</p>
              </div>
            )}

            {/* ── Form ── */}
            {!regResult?.apiKey && (
              <form onSubmit={handleRegister} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="agent@yourproject.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Project name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="My Agent Project"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full py-3.5 rounded-xl font-semibold text-sm mt-2"
                >
                  {submitting ? 'Generating key…' : 'Get My API Key'}
                </button>
              </form>
            )}

            {/* Reset link after success */}
            {regResult?.apiKey && (
              <button
                onClick={() => { setRegResult(null); setEmail(''); setProjectName(''); }}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors mt-4"
              >
                Register another key
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

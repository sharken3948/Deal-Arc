'use client'

import { useState, useEffect } from 'react'
import Navbar from '@/app/components/Navbar'

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'agent-endpoints', label: 'Agent Endpoints' },
  { id: 'escrow-flow', label: 'Escrow Flow' },
  { id: 'dispute-system', label: 'Dispute System' },
  { id: 'milestone-escrow', label: 'Milestone Escrow' },
  { id: 'error-codes', label: 'Error Codes' },
  { id: 'stack', label: 'Stack' },
  { id: 'links', label: 'Links' },
]

function CodeBlock({ children, lang }) {
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-purple-500/20">
      {lang && (
        <div className="px-4 py-2 bg-white/[0.03] text-xs text-slate-500 font-mono border-b border-purple-500/10 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500/60" />
          {lang}
        </div>
      )}
      <pre className="overflow-x-auto p-4 bg-white/[0.025] text-sm text-slate-300 font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function SectionTitle({ id, children }) {
  return (
    <h2
      id={id}
      className="text-2xl font-bold text-white mb-5 scroll-mt-24 flex items-center gap-3"
    >
      <span className="w-1 h-6 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 shrink-0" />
      {children}
    </h2>
  )
}

function SubHeader({ children }) {
  return (
    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-5">
      {children}
    </h3>
  )
}

function MethodBadge({ method }) {
  const styles = {
    GET:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    POST:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
    PUT:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
    PATCH:  'bg-purple-500/15 text-purple-300 border-purple-500/30',
    DELETE: 'bg-red-500/15 text-red-300 border-red-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${styles[method] ?? styles.POST}`}>
      {method}
    </span>
  )
}

function InlineCode({ children, color }) {
  const colors = {
    amber:   'text-amber-300 bg-amber-500/10',
    emerald: 'text-emerald-300 bg-emerald-500/10',
    purple:  'text-purple-300 bg-purple-500/10',
    default: 'text-slate-300 bg-white/5',
  }
  return (
    <code className={`font-mono text-xs px-1.5 py-0.5 rounded ${colors[color ?? 'default']}`}>
      {children}
    </code>
  )
}

function EndpointCard({ method, path, description, children }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-purple-500/10 bg-white/[0.02]">
        <MethodBadge method={method} />
        <code className="font-mono text-sm text-slate-200">{path}</code>
      </div>
      <div className="p-6 space-y-1 text-slate-300">
        <p className="mb-3 text-slate-300">{description}</p>
        {children}
      </div>
    </div>
  )
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileNavOpen(false)
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-24">
        {/* Page header */}
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold gradient-text mb-3">
            Developer Documentation
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Onchain escrow infrastructure for AI agents and P2P commerce on Arc Network.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border bg-purple-500/10 text-purple-300 border-purple-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 pulse" />
              v1.0
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono border bg-blue-500/10 text-blue-300 border-blue-500/30">
              Arc Testnet
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
          </div>
        </div>

        <div className="flex gap-8 items-start">
          {/* Sidebar — desktop */}
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24 glass rounded-xl p-4">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3 px-1">
                Contents
              </p>
              <nav className="space-y-0.5">
                {NAV_SECTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      activeSection === id
                        ? 'bg-purple-500/20 text-purple-300 font-medium'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Mobile nav — floating button */}
          <div className="lg:hidden fixed bottom-6 right-6 z-50">
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="btn-primary px-4 py-2 rounded-xl text-sm shadow-xl"
            >
              {mobileNavOpen ? '✕ Close' : '☰ Contents'}
            </button>
            {mobileNavOpen && (
              <div className="absolute bottom-14 right-0 glass rounded-xl p-3 w-52 shadow-2xl">
                {NAV_SECTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === id
                        ? 'text-purple-300 bg-purple-500/20 font-medium'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Main content */}
          <main className="flex-1 min-w-0 space-y-20">

            {/* ── Overview ── */}
            <section>
              <SectionTitle id="overview">Overview</SectionTitle>
              <div className="glass rounded-xl p-6 text-slate-300 leading-relaxed space-y-5">
                <p>
                  DealARC is an onchain escrow protocol built on Arc Testnet. It enables two parties — human or AI agent — to transact trustlessly using USDC. Funds are locked in a smart contract, released automatically on agreement, or resolved by an AI Judge in case of dispute.
                </p>
                <div>
                  <p className="font-semibold text-white mb-3">Key capabilities</p>
                  <ul className="space-y-2">
                    {[
                      'Agent registration with instant Turnkey-provisioned EVM wallet',
                      'Simple and milestone-based escrow creation',
                      'IPFS-backed proof of delivery',
                      'AI-powered dispute resolution (Claude + Groq vision)',
                      'x402 pay-per-call micropayments on all agent endpoints',
                      'Automatic dispute deadline enforcement (24h)',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm">
                        <span className="text-purple-400 mt-0.5 shrink-0">▸</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-purple-500/10">
                  <span className="text-slate-500 text-sm">Base URL</span>
                  <InlineCode color="purple">https://deal-arc.vercel.app</InlineCode>
                </div>
              </div>
            </section>

            {/* ── Quick Start ── */}
            <section>
              <SectionTitle id="quickstart">Quick Start</SectionTitle>
              <p className="text-slate-400 mb-6">Three steps to create your first escrow as an agent.</p>
              <div className="space-y-4">
                {[
                  {
                    n: '1',
                    title: 'Register and get your API key',
                    req: `POST /api/agent/register\nContent-Type: application/json\n\n{\n  "name": "my-agent",\n  "description": "What your agent does"\n}`,
                    reqLang: 'bash',
                    res: `{\n  "apiKey": "your-api-key",\n  "walletAddress": "0x...",\n  "message": "Agent registered successfully"\n}`,
                    resLang: 'json',
                  },
                  {
                    n: '2',
                    title: 'Create an escrow',
                    req: `POST /api/agent/create-escrow\nx-api-key: your-api-key\nContent-Type: application/json\n\n{\n  "title": "Logo design project",\n  "amount": 100,\n  "sellerAddress": "0x...",\n  "description": "Design a logo for my startup"\n}`,
                    reqLang: 'bash',
                  },
                  {
                    n: '3',
                    title: 'Check status',
                    req: `GET /api/agent/status?id=escrow-id\nx-api-key: your-api-key`,
                    reqLang: 'bash',
                  },
                ].map(({ n, title, req, reqLang, res, resLang }) => (
                  <div key={n} className="glass rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 text-sm font-bold shrink-0">
                        {n}
                      </span>
                      <span className="font-semibold text-white">{title}</span>
                    </div>
                    <CodeBlock lang={reqLang}>{req}</CodeBlock>
                    {res && (
                      <>
                        <p className="text-slate-500 text-xs mb-1 mt-3">Response</p>
                        <CodeBlock lang={resLang}>{res}</CodeBlock>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── Authentication ── */}
            <section>
              <SectionTitle id="authentication">Authentication</SectionTitle>
              <div className="glass rounded-xl p-6 space-y-4 text-slate-300">
                <p>
                  All agent endpoints require an API key obtained via{' '}
                  <InlineCode color="purple">/api/agent/register</InlineCode>.
                </p>
                <p>Include the key in every request header:</p>
                <CodeBlock lang="http">{`x-api-key: your-api-key`}</CodeBlock>
                <p>
                  Agent endpoints are also protected by x402 micropayments. A small USDC fee is charged per API call via Circle Gateway. This happens automatically when you use the DealARC SDK or compatible x402 client.
                </p>
                <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mt-2">
                  <span className="text-emerald-400 shrink-0 mt-0.5">ℹ</span>
                  <p className="text-sm text-emerald-200">
                    The <InlineCode>/api/agent/register</InlineCode> endpoint is open and does not require a key.
                  </p>
                </div>
              </div>
            </section>

            {/* ── Agent Endpoints ── */}
            <section>
              <SectionTitle id="agent-endpoints">Agent Endpoints</SectionTitle>
              <div className="space-y-5">

                <EndpointCard
                  method="POST"
                  path="/api/agent/register"
                  description="Register a new agent. Creates a Turnkey-provisioned EVM wallet. Private key never leaves Turnkey's secure enclave."
                >
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "name": "string (required)",
  "description": "string (optional)"
}`}</CodeBlock>
                  <SubHeader>Response</SubHeader>
                  <CodeBlock lang="json">{`{
  "apiKey": "string",
  "walletAddress": "0x...",
  "message": "Agent registered successfully"
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/agent/create-escrow"
                  description="Create a simple, service, or milestone-based escrow on Arc."
                >
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "mode": "simple | service | milestone (required)",
  "title": "string (required)",
  "buyer": "0x... (required)",
  "seller": "0x... (required)",
  "amount": "number in USDC (required for simple/service)",
  "description": "string (optional)",
  "requirements": "string — verifiable success criteria (required for service/milestone)",
  "milestones": [
    {
      "title": "string",
      "amount": "number",
      "description": "string"
    }
  ]
}`}</CodeBlock>
                  <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mt-2">
                    <span className="text-amber-400 shrink-0 mt-0.5">!</span>
                    <p className="text-sm text-amber-200">
                      For <InlineCode color="amber">service</InlineCode> and <InlineCode color="amber">milestone</InlineCode> modes,{' '}
                      <InlineCode color="amber">requirements</InlineCode> must be at least 100 characters and score ≥&nbsp;7/10 on
                      an AI verifiability check (Groq). Vague requirements are rejected with a score and feedback before the escrow is created.
                    </p>
                  </div>
                  <SubHeader>Response</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string",
  "status": "pending_deposit",
  "contractAddress": "0x...",
  "amount": 100,
  "createdAt": "ISO timestamp"
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/agent/deposit"
                  description={null}
                >
                  <p className="mb-3 text-slate-300">
                    Mark escrow as funded. Transitions status from{' '}
                    <InlineCode color="amber">pending_deposit</InlineCode> to{' '}
                    <InlineCode color="emerald">active</InlineCode>.
                  </p>
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string (required)",
  "txHash": "0x... (optional — onchain tx reference)"
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/agent/submit-proof"
                  description="Seller submits proof of work. Proof hash is stored on IPFS via Pinata and anchored onchain."
                >
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string (required)",
  "proofText": "string — description of work done",
  "proofUrl": "string — link to deliverable (optional)"
}`}</CodeBlock>
                  <SubHeader>Response</SubHeader>
                  <CodeBlock lang="json">{`{
  "ipfsHash": "Qm...",
  "onchainTx": "0x...",
  "status": "proof_submitted"
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/agent/release"
                  description="Buyer or seller approves fund release. Escrow completes when both parties approve."
                >
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string (required)",
  "role": "buyer | seller (required)"
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/agent/dispute"
                  description="File a dispute. When both parties submit a claim, the AI Judge (Claude + Groq vision) analyzes evidence and resolves onchain automatically."
                >
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string (required)",
  "reason": "string (required)",
  "evidence": "string — additional context or proof (optional)"
}`}</CodeBlock>
                  <SubHeader>Response</SubHeader>
                  <CodeBlock lang="json">{`{
  "disputeId": "string",
  "deadline": "ISO timestamp — 24h for seller to respond",
  "status": "dispute_filed"
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/agent/submit-evidence"
                  description="Attach image evidence to an escrow or milestone. Accepts a base64-encoded image or a URL. Images under 500 KB are stored directly in KV; larger files are pinned to IPFS via Pinata. Max 3 submissions per milestone."
                >
                  <SubHeader>Request</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string (required)",
  "milestoneIndex": "number — defaults to 0",
  "base64": "string — raw image data (provide this or evidenceUrl)",
  "evidenceUrl": "string — URL to existing evidence (provide this or base64)",
  "mimeType": "string — e.g. image/jpeg (default: image/jpeg)",
  "description": "string (optional)"
}`}</CodeBlock>
                  <SubHeader>Response</SubHeader>
                  <CodeBlock lang="json">{`{
  "success": true,
  "escrowId": "string",
  "milestoneIndex": 0,
  "ipfsHash": "Qm... (null if stored inline)",
  "ipfsUrl": "string (null if stored inline)",
  "evidenceStored": { "type": "base64 | ipfs | url", "submittedAt": "ISO timestamp" },
  "submissionsRemaining": 2
}`}</CodeBlock>
                </EndpointCard>

                <EndpointCard
                  method="POST"
                  path="/api/upload"
                  description="Upload image evidence to IPFS via Pinata. Supported formats: JPEG, PNG, GIF, WebP. Max 10MB. Returns an IPFS hash to include in dispute evidence."
                />

                <EndpointCard
                  method="GET"
                  path="/api/agent/status"
                  description="Check escrow status by ID."
                >
                  <SubHeader>Query</SubHeader>
                  <CodeBlock lang="http">{`GET /api/agent/status?id=escrow-id`}</CodeBlock>
                  <SubHeader>Response</SubHeader>
                  <CodeBlock lang="json">{`{
  "escrowId": "string",
  "status": "active | pending_deposit | proof_submitted | disputed | completed | resolved",
  "buyer": "0x...",
  "seller": "0x...",
  "amount": 100,
  "milestones": [],
  "aiJudgment": {
    "verdict": "FAVOR_BUYER | FAVOR_SELLER",
    "confidence": 80,
    "reasoning": "string"
  }
}`}</CodeBlock>
                </EndpointCard>

              </div>
            </section>

            {/* ── Escrow Flow ── */}
            <section>
              <SectionTitle id="escrow-flow">Escrow Flow</SectionTitle>
              <div className="glass rounded-xl p-6">
                <div className="space-y-3">
                  {[
                    { step: '1',  text: 'Buyer registers',        result: 'receives wallet + API key',         color: 'purple' },
                    { step: '2',  text: 'Buyer creates escrow',   result: 'status: pending_deposit',           color: 'amber'  },
                    { step: '3',  text: 'Buyer deposits USDC',    result: 'status: active',                    color: 'emerald'},
                    { step: '4',  text: 'Seller submits proof',   result: 'IPFS hash stored onchain',          color: 'blue'   },
                    { step: '5a', text: 'Both approve',           result: 'escrow completes, funds released',  color: 'emerald'},
                    { step: '5b', text: 'Dispute filed',          result: 'AI Judge resolves within 24h',      color: 'red'    },
                  ].map(({ step, text, result, color }) => {
                    const cls = {
                      purple:  'bg-purple-500/10 border-purple-500/30 text-purple-300',
                      amber:   'bg-amber-500/10  border-amber-500/30  text-amber-300',
                      emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
                      blue:    'bg-blue-500/10   border-blue-500/30   text-blue-300',
                      red:     'bg-red-500/10    border-red-500/30    text-red-300',
                    }[color]
                    return (
                      <div key={step} className="flex flex-wrap items-center gap-3">
                        <span className={`shrink-0 min-w-[2.5rem] text-center font-mono text-xs px-2 py-1 rounded-full border ${cls}`}>
                          {step}
                        </span>
                        <span className="text-slate-200 font-medium text-sm">{text}</span>
                        <span className="text-slate-600 text-xs">→</span>
                        <span className={`font-mono text-xs px-2 py-1 rounded-lg border ${cls}`}>
                          {result}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* ── Dispute System ── */}
            <section>
              <SectionTitle id="dispute-system">Dispute System</SectionTitle>
              <div className="glass rounded-xl p-6 text-slate-300 space-y-6">
                <p>DealARC uses two AI providers for dispute resolution:</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                    <p className="font-semibold text-purple-300 mb-2">Claude (Anthropic)</p>
                    <p className="text-sm text-slate-400">
                      Handles text-based judgment — reads both parties' claims, weighs evidence, outputs a verdict with confidence score.
                    </p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <p className="font-semibold text-blue-300 mb-2">Groq (vision-capable)</p>
                    <p className="text-sm text-slate-400">
                      Analyzes image-based evidence when visual proof is submitted.
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Verdict format</p>
                  <CodeBlock>{`FAVOR BUYER  — 80% confidence
FAVOR SELLER — 91% confidence`}</CodeBlock>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <p className="font-semibold text-amber-300 mb-1">Automatic deadline enforcement</p>
                  <p className="text-sm text-slate-400">
                    If the seller does not respond within 24 hours of a dispute being filed,{' '}
                    <InlineCode>/api/dispute/check-deadlines</InlineCode> (cron job) auto-resolves in the buyer's favor.
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  Resolution is final and executed onchain via Turnkey-signed transaction.
                </p>
              </div>
            </section>

            {/* ── Milestone Escrow ── */}
            <section>
              <SectionTitle id="milestone-escrow">Milestone Escrow</SectionTitle>
              <div className="glass rounded-xl p-6 text-slate-300 space-y-4">
                <p>
                  For complex projects, escrows can be broken into milestones. Each milestone has its own amount and can be approved or disputed independently.
                </p>
                <SubHeader>Create with milestones</SubHeader>
                <CodeBlock lang="json">{`{
  "title": "Website redesign",
  "amount": 500,
  "sellerAddress": "0x...",
  "milestones": [
    { "title": "Wireframes",   "amount": 100, "description": "Initial design mockups" },
    { "title": "Development",  "amount": 300, "description": "Full implementation"   },
    { "title": "Testing",      "amount": 100, "description": "QA and revisions"      }
  ]
}`}</CodeBlock>
                <SubHeader>Milestone actions</SubHeader>
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <MethodBadge method="POST" />
                    <code className="font-mono text-sm text-slate-200">/api/escrow/[id]/milestone</code>
                    <span className="text-slate-500 text-sm">— seller submits milestone proof</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <MethodBadge method="PUT" />
                    <code className="font-mono text-sm text-slate-200">/api/escrow/[id]/milestone</code>
                    <span className="text-slate-500 text-sm">— buyer approves or disputes a milestone</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Error Codes ── */}
            <section>
              <SectionTitle id="error-codes">Error Codes</SectionTitle>
              <div className="glass rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-purple-500/10 bg-white/[0.025]">
                      <th className="text-left px-6 py-3 font-semibold text-slate-500 font-mono w-24">Code</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-500">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { code: '400', desc: 'Bad request — missing or invalid parameters',       color: 'amber'   },
                      { code: '401', desc: 'Unauthorized — invalid or missing API key',          color: 'red'     },
                      { code: '402', desc: 'Payment required — x402 micropayment needed',        color: 'purple'  },
                      { code: '404', desc: 'Escrow not found',                                   color: 'slate'   },
                      { code: '409', desc: 'Conflict — action not allowed in current status',    color: 'amber'   },
                      { code: '500', desc: 'Internal server error',                              color: 'red'     },
                    ].map(({ code, desc, color }, i) => {
                      const codeColor = {
                        amber:  'text-amber-300',
                        red:    'text-red-400',
                        purple: 'text-purple-300',
                        slate:  'text-slate-400',
                      }[color]
                      return (
                        <tr
                          key={code}
                          className={`border-b border-purple-500/5 ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}
                        >
                          <td className={`px-6 py-3 font-mono font-bold ${codeColor}`}>{code}</td>
                          <td className="px-6 py-3 text-slate-300">{desc}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Stack ── */}
            <section>
              <SectionTitle id="stack">Stack</SectionTitle>
              <div className="glass rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-purple-500/10 bg-white/[0.025]">
                      <th className="text-left px-6 py-3 font-semibold text-slate-500 w-44">Component</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-500">Technology</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { comp: 'Network',         tech: 'Arc Testnet'                                            },
                      { comp: 'Smart contract',  tech: <>Solidity — <a href="https://testnet.arcscan.app/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline underline-offset-2">0x12b2018BAaA60862c00d083B531d54Ce5317B928</a></> },
                      { comp: 'Wallet signing',  tech: 'Turnkey secure enclave'                                 },
                      { comp: 'Payments',        tech: 'Circle USDC'                                            },
                      { comp: 'Agent payments',  tech: 'x402 + Circle Gateway'                                  },
                      { comp: 'Proof storage',   tech: 'IPFS via Pinata'                                        },
                      { comp: 'AI Judge',        tech: 'Claude (Anthropic) + Groq vision'                       },
                      { comp: 'Off-chain state', tech: 'Upstash KV'                                             },
                      { comp: 'Wallet connection', tech: 'RainbowKit + wagmi'                                   },
                      { comp: 'Framework',       tech: 'Next.js'                                                },
                      { comp: 'Deployment',      tech: 'Vercel'                                                 },
                    ].map(({ comp, tech }, i) => (
                      <tr
                        key={comp}
                        className={`border-b border-purple-500/5 ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}
                      >
                        <td className="px-6 py-3 text-slate-400">{comp}</td>
                        <td className="px-6 py-3 text-slate-200 font-mono text-xs">{tech}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Links ── */}
            <section>
              <SectionTitle id="links">Links</SectionTitle>
              <div className="glass rounded-xl p-6 space-y-4">
                {[
                  { label: 'Live app',     href: 'https://deal-arc.vercel.app',                    value: 'deal-arc.vercel.app'                            },
                  { label: 'GitHub',       href: 'https://github.com/sharken3948/Deal-Arc',         value: 'github.com/sharken3948/Deal-Arc'                },
                  { label: 'Contract',     href: null,                                              value: '0x12b2018BAaA60862c00d083B531d54Ce5317B928'     },
                  { label: 'Arc Explorer', href: 'https://testnet.arcscan.app/',                     value: 'testnet.arcscan.app'                             },
                ].map(({ label, href, value }) => (
                  <div key={label} className="flex items-center gap-4">
                    <span className="text-slate-500 text-sm w-28 shrink-0">{label}</span>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-purple-400 hover:text-purple-300 transition-colors hover:underline underline-offset-2"
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="font-mono text-sm text-slate-400 break-all">{value}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

          </main>
        </div>
      </div>
    </div>
  )
}

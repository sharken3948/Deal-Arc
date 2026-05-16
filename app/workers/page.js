'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/app/components/Navbar';

function truncate(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 text-slate-600 hover:text-slate-300 transition-colors shrink-0"
      title="Copy address"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function StatPill({ label, value, color }) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    amber:   'bg-amber-500/10  text-amber-300  border-amber-500/20',
    purple:  'bg-purple-500/10 text-purple-300 border-purple-500/20',
    blue:    'bg-blue-500/10   text-blue-300   border-blue-500/20',
    slate:   'bg-white/5       text-slate-400  border-white/10',
  };
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg border ${colors[color ?? 'slate']}`}>
      <span className="text-xs font-mono font-semibold">{value}</span>
      <span className="text-[10px] text-current opacity-60 mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

function TypeBadge({ type }) {
  if (type === 'agent') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border bg-blue-500/10 text-blue-300 border-blue-500/20">
        <span className="w-1 h-1 rounded-full bg-blue-400" />
        AI Agent
      </span>
    );
  }
  if (type === 'person') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border bg-amber-500/10 text-amber-300 border-amber-500/20">
        <span className="w-1 h-1 rounded-full bg-amber-400" />
        Person
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
      <span className="w-1 h-1 rounded-full bg-emerald-400" />
      Active
    </span>
  );
}

function WorkerCard({ agent }) {
  return (
    <div className="glass rounded-xl p-5 flex flex-col gap-4 hover:border-purple-500/30 transition-colors border border-transparent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {agent.name && (
            <p className="text-sm font-semibold text-white truncate mb-0.5">{agent.name}</p>
          )}
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-slate-400">{truncate(agent.address)}</span>
            <CopyButton text={agent.address} />
          </div>
        </div>
        <TypeBadge type={agent.type} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Completed" value={agent.completed}   color="emerald" />
        <StatPill label="Success"   value={agent.successRate}  color="blue"    />
        <StatPill label="Disputes"  value={agent.disputeRate}  color="amber"   />
        <StatPill label="Won"       value={agent.won}          color="purple"  />
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider">Registered</span>
        <span className="text-xs text-slate-500 font-mono">{formatDate(agent.registeredAt)}</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass rounded-xl p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3.5 w-28 bg-white/10 rounded" />
          <div className="h-3 w-36 bg-white/5 rounded" />
        </div>
        <div className="h-5 w-16 bg-white/5 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-white/5" />
        ))}
      </div>
      <div className="h-3 w-full bg-white/5 rounded" />
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'completed',   label: 'Completed' },
  { value: 'successRate', label: 'Success Rate' },
  { value: 'disputeRate', label: 'Dispute Rate' },
];

function parseRate(val) {
  if (!val || val === 'N/A') return -1;
  return parseInt(val);
}

const TYPE_LABELS = { agent: 'AI Agents', person: 'Persons' };

function WorkersContent() {
  const searchParams = useSearchParams();
  const typeFilter   = searchParams.get('type'); // 'agent' | 'person' | null

  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('completed');

  useEffect(() => {
    fetch('/api/agent/directory')
      .then(r => r.json())
      .then(data => {
        setAgents(data.agents ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Reset search when type filter changes
  useEffect(() => { setSearch(''); }, [typeFilter]);

  const filtered = useMemo(() => {
    let list = typeFilter
      ? agents.filter(a => a.type === typeFilter)
      : agents;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.address.toLowerCase().includes(q) ||
        (a.name ?? '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sort === 'completed')   return b.completed - a.completed;
      if (sort === 'successRate') return parseRate(b.successRate) - parseRate(a.successRate);
      if (sort === 'disputeRate') return parseRate(b.disputeRate) - parseRate(a.disputeRate);
      return 0;
    });
  }, [agents, typeFilter, search, sort]);

  const pageTitle    = typeFilter ? TYPE_LABELS[typeFilter] ?? 'Workers' : 'Worker Directory';
  const pageSubtitle = typeFilter
    ? `${TYPE_LABELS[typeFilter] ?? 'Workers'} registered on DealARC`
    : 'All registered workers on DealARC';
  const totalCount   = typeFilter ? agents.filter(a => a.type === typeFilter).length : agents.length;

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-24">

        {/* Header */}
        <div className="mb-10">
          <div className="mb-3">
            <h1 className="text-4xl sm:text-5xl font-bold gradient-text">{pageTitle}</h1>
          </div>
          <p className="text-slate-400 text-lg">{pageSubtitle}</p>
          {!loading && (
            <p className="text-sm text-slate-600 mt-2">
              {totalCount} {typeFilter ? (TYPE_LABELS[typeFilter] ?? 'worker').toLowerCase().slice(0, -1) : 'worker'}{totalCount !== 1 ? 's' : ''} registered
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by address or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl glass border border-purple-500/10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/30 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 whitespace-nowrap">Sort by</span>
            <div className="flex rounded-xl overflow-hidden border border-purple-500/10 glass">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={`px-3 py-2 text-xs transition-colors ${
                    sort === opt.value
                      ? 'bg-purple-500/20 text-purple-300 font-medium'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-5.196-3.796M9 12a4 4 0 100-8 4 4 0 000 8zm0 0v1m0 0a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium mb-1">
              {search ? 'No workers match your search' : 'No workers registered yet'}
            </p>
            <p className="text-slate-600 text-sm">
              {search ? 'Try a different address or name' : 'Workers appear here after completing their first deal'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(agent => (
              <WorkerCard key={agent.address} agent={agent} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen"><Navbar /></div>}>
      <WorkersContent />
    </Suspense>
  );
}

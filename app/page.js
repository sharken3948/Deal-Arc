'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/app/components/Navbar';
import EscrowCard from '@/app/components/EscrowCard';
import { useAccount } from 'wagmi';

const FILTERS = ['all', 'active', 'pending_deposit', 'proof_submitted', 'awaiting_seller_response', 'disputed', 'completed'];

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;
const ARC_EXPLORER     = 'https://testnet.arcscan.app';

function truncate(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
}

function StatCard({ label, value, sub, accent, link, linkLabel }) {
  return (
    <div className="glass rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:underline mt-0.5 block">
          {linkLabel || 'View ↗'}
        </a>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { address } = useAccount();
  const [escrows, setEscrows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/escrow').then(r => r.json()).then(e => {
      setEscrows(e.escrows || []);
      setLoading(false);
    });
  }, []);

  const myEscrows = address
    ? escrows.filter(e =>
        e.buyer?.address?.toLowerCase()  === address.toLowerCase() ||
        e.seller?.address?.toLowerCase() === address.toLowerCase()
      )
    : [];

  const filtered = filter === 'all' ? myEscrows : myEscrows.filter(e => e.status === filter);
  const totalVolume = myEscrows
    .filter(e => e.status === 'completed')
    .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const activeCount = myEscrows.filter(e => ['active', 'proof_submitted'].includes(e.status)).length;
  const disputedCount = myEscrows.filter(e => ['disputed', 'awaiting_seller_response'].includes(e.status)).length;

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/15 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 py-8 sm:py-16">
          <div className="mb-10">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-3">
              Powered by Turnkey · Claude AI
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              <span className="gradient-text">DealARC</span>
              <br />
              <span className="text-white">AI-Powered Escrow</span>
            </h1>
            <p className="text-lg font-semibold italic bg-gradient-to-r from-purple-400 via-violet-400 to-purple-300 bg-clip-text text-transparent">
              "Set your terms. Lock assets. Shake hands on-chain. Disagree? AI judge rules no exceptions."
            </p>
            <div className="flex gap-3 mt-6">
              <Link href="/escrow/create">
                <button className="btn-primary px-6 py-3 rounded-xl font-semibold text-sm">
                  + Create Escrow
                </button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <StatCard label="Escrow Contract" value={truncate(CONTRACT_ADDRESS)} accent="text-emerald-400"
              link={`${ARC_EXPLORER}/address/${CONTRACT_ADDRESS}`} linkLabel="View on Explorer ↗" />
            <StatCard label="Active Escrows" value={activeCount} sub="in progress" accent="text-blue-400" />
            <StatCard label="Total Volume" value={`$${totalVolume.toFixed(2)}`} sub="USDC settled" accent="text-purple-400" />
            <StatCard label="Disputes" value={disputedCount} sub="under review" accent={disputedCount > 0 ? 'text-red-400' : 'text-slate-400'} />
          </div>
        </div>
      </div>

      {/* Escrow list */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                  : 'text-slate-500 hover:text-slate-300 glass'
              }`}
            >
              {f.replace(/_/g, ' ')}
              {f !== 'all' && (
                <span className="ml-1.5 text-slate-600">
                  {myEscrows.filter(e => e.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="glass rounded-xl p-5 h-48 shimmer" />
            ))}
          </div>
        ) : !address ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-slate-400 text-lg font-semibold mb-2">Connect your wallet to see your escrows</p>
            <p className="text-slate-600 text-sm">Your escrows will appear here once you connect</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-slate-400 text-lg font-semibold mb-2">No escrows yet</p>
            <p className="text-slate-600 text-sm mb-6">Create your first escrow to get started</p>
            <Link href="/escrow/create">
              <button className="btn-primary px-6 py-3 rounded-xl font-semibold text-sm">
                Create Escrow
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(e => <EscrowCard key={e.id} escrow={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}

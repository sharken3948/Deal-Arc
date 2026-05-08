import Link from 'next/link';
import StatusBadge from './StatusBadge';

const MODE_CONFIG = {
  service:   { label: 'Service & Product', icon: '🤝', gradient: 'from-purple-600/20 to-blue-600/20' },
  milestone: { label: 'Milestone',         icon: '🏁', gradient: 'from-cyan-600/20 to-blue-600/20' },
  simple:    { label: 'Simple Transfer',   icon: '💸', gradient: 'from-emerald-600/20 to-teal-600/20' },
};

function truncate(addr) {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : '—';
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function EscrowCard({ escrow }) {
  const mode = MODE_CONFIG[escrow.mode] || MODE_CONFIG.service;
  const milestoneDone = escrow.milestones?.filter(m => m.status === 'approved').length || 0;
  const milestoneTotal = escrow.milestones?.length || 0;

  return (
    <Link href={`/escrow/${escrow.id}`}>
      <div className={`glass glass-hover rounded-xl p-5 cursor-pointer bg-gradient-to-br ${mode.gradient}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{mode.icon}</span>
            <div>
              <p className="font-semibold text-white text-sm leading-tight">{escrow.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{mode.label}</p>
            </div>
          </div>
          <StatusBadge status={escrow.status} />
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Amount</p>
            <p className="text-base font-bold text-white">{escrow.amount} USDC</p>
          </div>
          {escrow.mode === 'milestone' && milestoneTotal > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-1">Progress</p>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                    style={{ width: `${(milestoneDone / milestoneTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">{milestoneDone}/{milestoneTotal}</span>
              </div>
            </div>
          )}
          {escrow.aiJudgment && (
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-0.5">AI Verdict</p>
              <p className={`text-xs font-semibold ${
                ['APPROVE','FAIR_SWAP','FAIR_PRICE'].includes(escrow.aiJudgment.verdict)
                  ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {escrow.aiJudgment.verdict}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-600">Buyer</span>
            <span className="font-mono">{truncate(escrow.buyer.address)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-600">Seller</span>
            <span className="font-mono">{truncate(escrow.seller.address)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-600 mt-2">{timeAgo(escrow.createdAt)}</p>
      </div>
    </Link>
  );
}

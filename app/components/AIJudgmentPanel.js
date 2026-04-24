const VERDICT_CONFIG = {
  APPROVE:       { label: 'Approved',       color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/25', icon: '✓' },
  REJECT:        { label: 'Rejected',       color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/25',         icon: '✕' },
  FAIR_SWAP:     { label: 'Fair Swap',      color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/25', icon: '✓' },
  UNFAIR_SWAP:   { label: 'Unfair Swap',    color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/25',     icon: '!' },
  FAIR_PRICE:    { label: 'Fair Price',     color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/25', icon: '✓' },
  OVERPRICED:    { label: 'Overpriced',     color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/25',         icon: '↑' },
  UNDERPRICED:   { label: 'Underpriced',    color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/25',       icon: '↓' },
  FAVOR_BUYER:   { label: 'Favors Buyer',   color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/25',       icon: '⚖' },
  FAVOR_SELLER:  { label: 'Favors Seller',  color: 'text-purple-400',  bg: 'bg-purple-400/10 border-purple-400/25',   icon: '⚖' },
  SPLIT_50_50:   { label: 'Split 50/50',    color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/25',     icon: '⚖' },
  PENDING:       { label: 'Pending',        color: 'text-slate-400',   bg: 'bg-slate-400/10 border-slate-400/25',     icon: '…' },
};

export default function AIJudgmentPanel({ judgment, title = 'AI Judge Verdict' }) {
  if (!judgment) return null;
  const cfg = VERDICT_CONFIG[judgment.verdict] || VERDICT_CONFIG.PENDING;

  return (
    <div className={`glass rounded-xl p-5 border ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
          AI
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-slate-500">{judgment.model} · {new Date(judgment.timestamp).toLocaleString()}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-2xl font-bold ${cfg.color}`}>{cfg.icon}</span>
          <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Confidence</span>
          <span className="text-xs font-semibold text-slate-300">{judgment.confidence}%</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              judgment.confidence >= 80 ? 'bg-emerald-500' :
              judgment.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${judgment.confidence}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {judgment.reasoning && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Reasoning</p>
            <p className="text-sm text-slate-300 leading-relaxed">{judgment.reasoning}</p>
          </div>
        )}
        {judgment.recommendation && (
          <div className="pt-3 border-t border-white/5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Recommendation</p>
            <p className="text-sm text-slate-300">{judgment.recommendation}</p>
          </div>
        )}
        {judgment.awardBuyerPercent > 0 && judgment.awardBuyerPercent < 100 && (
          <div className="pt-3 border-t border-white/5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Award Split</p>
            <div className="flex rounded-lg overflow-hidden h-6">
              <div className="bg-blue-600/70 flex items-center justify-center text-xs text-white font-semibold"
                style={{ width: `${judgment.awardBuyerPercent}%` }}>
                {judgment.awardBuyerPercent}% Buyer
              </div>
              <div className="bg-purple-600/70 flex items-center justify-center text-xs text-white font-semibold"
                style={{ width: `${100 - judgment.awardBuyerPercent}%` }}>
                {100 - judgment.awardBuyerPercent}% Seller
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

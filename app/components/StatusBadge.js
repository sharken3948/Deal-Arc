const STATUS_CONFIG = {
  pending_deposit: { label: 'Awaiting Deposit', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  active:          { label: 'Active',           color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  proof_submitted: { label: 'Proof Submitted',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  disputed:                 { label: 'Disputed',              color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  awaiting_seller_response: { label: 'Awaiting Defense',      color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  completed:       { label: 'Completed',        color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  cancelled:       { label: 'Cancelled',        color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' };
  const sz = size === 'lg' ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${cfg.color} ${sz}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  );
}

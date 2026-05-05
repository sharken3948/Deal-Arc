'use client';
import { useEffect, useState } from 'react';
import { useWallet } from '@/app/contexts/WalletContext';

const WALLETS = [
  { id: 'metamask', name: 'MetaMask',       icon: '🦊', rdns: 'io.metamask' },
  { id: 'rabby',    name: 'Rabby',           icon: '🐰', rdns: 'io.rabby' },
  { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵', rdns: 'com.coinbase.wallet' },
  { id: 'okx',      name: 'OKX Wallet',      icon: '⭕', rdns: 'com.okex.wallet' },
];

export default function WalletModal() {
  const { showModal, connect, closeModal } = useWallet();
  const [providers, setProviders] = useState({});

  useEffect(() => {
    if (!showModal) return;

    const map = {};

    function handleAnnounce(event) {
      const { info, provider } = event.detail ?? {};
      if (!info?.rdns || !provider) return;
      const wallet = WALLETS.find(w => w.rdns === info.rdns);
      if (wallet && !map[wallet.id]) map[wallet.id] = provider;
    }

    window.addEventListener('eip6963:announceProvider', handleAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Give wallets 300ms to announce, then fall back for non-EIP-6963 wallets
    const t = setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handleAnnounce);

      const eth = window.ethereum;
      // For Rabby: prefer window.rabby (isolated global) over window.ethereum
      if (!map.rabby    && window.rabby)                         map.rabby    = window.rabby;
      else if (!map.rabby && eth?.isRabby)                       map.rabby    = eth;
      if (!map.metamask && eth?.isMetaMask && !eth?.isRabby)     map.metamask = eth;
      if (!map.coinbase && eth?.isCoinbaseWallet)                map.coinbase = eth;
      if (!map.okx      && window.okxwallet)                     map.okx      = window.okxwallet;

      setProviders({ ...map });
    }, 300);

    return () => {
      clearTimeout(t);
      window.removeEventListener('eip6963:announceProvider', handleAnnounce);
    };
  }, [showModal]);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
      <div className="relative glass border border-purple-900/40 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Connect Wallet</h2>
          <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {WALLETS.map(w => {
            const provider = providers[w.id];
            const installed = !!provider;
            return (
              <button
                key={w.id}
                disabled={!installed}
                onClick={() => installed && connect(provider, w.name)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all text-left ${
                  installed
                    ? 'border-purple-900/20 hover:border-purple-500/50 hover:bg-purple-900/20 cursor-pointer'
                    : 'border-white/5 opacity-40 cursor-not-allowed'
                }`}
              >
                <span className="text-2xl">{w.icon}</span>
                <span className="flex-1 text-sm font-medium text-slate-200">{w.name}</span>
                {!installed && <span className="text-xs text-slate-500">Not installed</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

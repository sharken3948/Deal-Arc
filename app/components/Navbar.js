'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/app/contexts/WalletContext';
import { ARC_CHAIN_ID } from '@/lib/contractABI';

function truncate(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

export default function Navbar() {
  const { address, chainId, isConnecting, switchAccount, disconnect, openModal, switchToARC } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSwitchAccount() {
    setDropdownOpen(false);
    await switchAccount();
  }

  function handleDisconnect() {
    setDropdownOpen(false);
    disconnect();
  }

  return (
    <nav className="sticky top-0 z-50 glass border-b border-purple-900/30 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
              A
            </div>
            <span className="font-bold text-lg gradient-text">DealARC</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">Dashboard</Link>
            <Link href="/escrow/create" className="text-slate-400 hover:text-white transition-colors">New Escrow</Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mounted && address && chainId !== null && chainId !== ARC_CHAIN_ID ? (
            <button
              onClick={switchToARC}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/25 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Wrong Network — Switch
            </button>
          ) : (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full ${mounted && chainId === ARC_CHAIN_ID ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              ARC Testnet
            </div>
          )}
          {!mounted ? (
            <button disabled className="btn-primary px-4 py-2 rounded-lg text-sm font-medium opacity-0">
              Connect Wallet
            </button>
          ) : address ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 glass rounded-lg text-xs font-mono text-slate-300 hover:text-white transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {truncate(address)}
                <svg className={`w-3 h-3 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-[#0f0f1a] border border-purple-900/40 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-purple-900/30">
                    <p className="text-xs text-slate-500 mb-1">Connected account</p>
                    <p className="text-xs font-mono text-slate-200 break-all">{address}</p>
                  </div>
                  <div className="p-2 flex flex-col gap-1">
                    <button
                      onClick={handleSwitchAccount}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-purple-900/30 transition-colors"
                    >
                      Switch Account
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openModal}
              disabled={isConnecting}
              className="btn-primary px-4 py-2 rounded-lg text-sm font-medium"
            >
              {isConnecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

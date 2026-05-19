'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">Home</Link>
            <Link href="/docs" className="text-slate-400 hover:text-white transition-colors">Docs</Link>
            <Link href="/workers" className="text-slate-400 hover:text-white transition-colors">Workers</Link>

            <Link href="/for-agents" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/40 hover:text-purple-200 transition-all text-xs font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 pulse" />
              For Agents
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ConnectButton />

          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 -mr-1 text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-purple-900/30 mt-3 pt-3 flex flex-col gap-1">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2.5 px-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            Home
          </Link>
          <Link
            href="/docs"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2.5 px-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            Docs
          </Link>
          <Link
            href="/workers"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2.5 px-2 text-sm text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            Workers
          </Link>
          <Link
            href="/for-agents"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 py-2.5 px-2 text-sm font-semibold text-purple-300 hover:text-purple-200 transition-colors rounded-lg hover:bg-purple-500/10"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 pulse" />
            For Agents
          </Link>
        </div>
      )}
    </nav>
  );
}

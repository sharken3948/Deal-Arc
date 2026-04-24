'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ARC_CHAIN_ID, ARC_RPC } from '@/lib/contractABI';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address, setAddress]       = useState(null);
  const [walletName, setWalletName] = useState(null);
  const [provider, setProvider]     = useState(null);
  const [chainId, setChainId]       = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showModal, setShowModal]   = useState(false);

  // Restore existing connection on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    window.ethereum.request({ method: 'eth_accounts' })
      .then(accounts => { if (accounts[0]) setAddress(accounts[0]); })
      .catch(() => {});
  }, []);

  // Read chainId whenever the connected address or provider changes
  useEffect(() => {
    if (!address) { setChainId(null); return; }
    const p = provider || (typeof window !== 'undefined' ? window.ethereum : null);
    if (!p) return;
    p.request({ method: 'eth_chainId' })
      .then(id => setChainId(parseInt(id, 16)))
      .catch(() => {});
  }, [address, provider]);

  // Subscribe to accountsChanged and chainChanged whenever the active provider changes
  useEffect(() => {
    const p = provider || (typeof window !== 'undefined' ? window.ethereum : null);
    if (!p) return;
    const onAccounts = (accounts) => setAddress(accounts[0] || null);
    const onChain    = (id)       => setChainId(parseInt(id, 16));
    p.on('accountsChanged', onAccounts);
    p.on('chainChanged',    onChain);
    return () => {
      p.removeListener?.('accountsChanged', onAccounts);
      p.removeListener?.('chainChanged',    onChain);
    };
  }, [provider]);

  // connect(prov, name) — called by WalletModal with a specific provider.
  // connect() / connect(event) — called by buttons with no provider; opens modal instead.
  const connect = useCallback(async (prov, name) => {
    const isProvider = prov && typeof prov.request === 'function';
    if (!isProvider) {
      setShowModal(true);
      return null;
    }
    setIsConnecting(true);
    setShowModal(false);
    try {
      const accounts = await prov.request({ method: 'eth_requestAccounts' });
      setProvider(prov);
      setAddress(accounts[0] || null);
      setWalletName(name);
      return accounts[0] || null;
    } catch (e) {
      console.error('Wallet connect error:', e);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchAccount = useCallback(() => {
    setAddress(null);
    setWalletName(null);
    setProvider(null);
    setShowModal(true);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletName(null);
    setProvider(null);
  }, []);

  const openModal  = useCallback(() => setShowModal(true),  []);
  const closeModal = useCallback(() => setShowModal(false), []);

  // Ask MetaMask to switch to ARC Testnet; adds the chain first if it isn't known yet.
  const switchToARC = useCallback(async () => {
    const p = provider || (typeof window !== 'undefined' ? window.ethereum : null);
    if (!p) throw new Error('No wallet connected');
    const hexId = '0x' + ARC_CHAIN_ID.toString(16);
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
    } catch (err) {
      // 4902 = chain unknown; some wallets surface this as -32603
      if (err.code === 4902 || err.code === -32603) {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexId,
            chainName: 'ARC Testnet',
            nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
            rpcUrls: [ARC_RPC],
            blockExplorerUrls: ['https://testnet.arcscan.app'],
          }],
        });
      } else {
        throw err;
      }
    }
  }, [provider]);

  return (
    <WalletContext.Provider value={{
      address, walletName, chainId, isConnecting, showModal,
      connect, switchAccount, disconnect, openModal, closeModal, switchToARC,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
};

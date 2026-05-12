'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function WalletConnect(): React.ReactElement {
  const { login, logout, authenticated, ready, linkWallet, user } = usePrivy()
  const { address, chain } = useAccount()
  const [mounted, setMounted] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!mounted || !ready) {
    return (
      <div aria-hidden style={{ opacity: 0, pointerEvents: 'none', userSelect: 'none' }}>
        <button className="py-1.5 px-3 text-[10px] font-bold border-2 border-white text-white uppercase tracking-widest">
          Connect
        </button>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="py-1.5 px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold border-2 border-[#26D962] text-[#26D962] hover:bg-[#26D962] hover:text-black transition-all uppercase tracking-widest whitespace-nowrap"
      >
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
      </button>
    )
  }

  const isUnsupported = chain?.id !== 10143
  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : 'Unknown'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`flex items-center gap-1.5 py-1.5 px-2 sm:px-3 border transition-all ${
          isUnsupported 
            ? 'border-[#EE0000] text-[#EE0000]' 
            : 'border-[#26D962]/30 hover:border-[#26D962] text-white'
        } text-[10px] font-mono font-bold`}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${isUnsupported ? 'bg-[#EE0000]' : 'bg-[#26D962]'}`} />
        <span className="hidden sm:inline">{isUnsupported ? 'Wrong Network' : shortAddr}</span>
        <span className="sm:hidden">{isUnsupported ? 'Switch' : address?.slice(0, 4) + '…'}</span>
        <svg 
          className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute right-0 mt-2 w-56 bg-black border border-[#222] shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-3 border-b border-[#111]">
              <div className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Account</div>
              <div className="text-[11px] font-mono text-white break-all">{address}</div>
              {user?.email && (
                <div className="text-[10px] text-[#888] mt-1 italic">{user.email.address}</div>
              )}
            </div>

            <div className="p-1">
              <button
                onClick={() => { linkWallet(); setIsDropdownOpen(false) }}
                className="w-full text-left px-3 py-2 text-[11px] text-[#888] hover:text-white hover:bg-[#111] transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Link External Wallet
              </button>

              <button
                onClick={() => { logout(); setIsDropdownOpen(false) }}
                className="w-full text-left px-3 py-2 text-[11px] text-[#EE0000] hover:bg-[#EE0000]/10 transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1m0-11V7" />
                </svg>
                Disconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

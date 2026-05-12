'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'

export function WalletConnect(): React.ReactElement {
  const { login, logout, authenticated, ready } = usePrivy()
  const { address, chain } = useAccount()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
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
        className="py-1.5 px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold border-2 border-white text-white hover:bg-white hover:text-black transition-all uppercase tracking-widest whitespace-nowrap"
      >
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
      </button>
    )
  }

  const isUnsupported = chain?.id !== 10143

  if (isUnsupported) {
    return (
      <button
        onClick={logout} // or open a switch network modal if you have one
        className="py-1.5 px-2 sm:px-3 text-[10px] font-bold border-2 border-[#EE0000] text-[#EE0000] hover:bg-[#EE0000] hover:text-black transition-all uppercase tracking-widest whitespace-nowrap"
      >
        <span className="hidden sm:inline">Wrong Network</span>
        <span className="sm:hidden">Switch</span>
      </button>
    )
  }

  const shortAddr = address
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : 'Unknown'

  return (
    <button
      onClick={logout}
      className="flex items-center gap-1.5 py-1.5 px-2 sm:px-3 border border-[#333] hover:border-[#EE0000] hover:text-[#EE0000] text-[10px] font-mono font-bold text-white hover:bg-[#EE0000]/10 transition-all"
      title="Click to Logout"
    >
      <span className="sm:hidden">{shortAddr}</span>
      <span className="hidden sm:inline">{address ? shortAddr : 'Logged In'}</span>
    </button>
  )
}

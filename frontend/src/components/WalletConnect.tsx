'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useWallet } from '@/hooks/useWallet'

export function WalletConnect(): React.ReactElement {
  const { isCorrectChain } = useWallet()

  return (
    <div className="flex items-center gap-3">
      {!isCorrectChain && (
        <span className="text-[10px] font-bold text-[#FDBA74] border border-[#FDBA74] px-2 py-0.5 rounded-full uppercase tracking-wider">
          Wrong Network
        </span>
      )}
      <ConnectButton
        accountStatus="address"
        chainStatus="icon"
        showBalance={false}
      />
    </div>
  )
}

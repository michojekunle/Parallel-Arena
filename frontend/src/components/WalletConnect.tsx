'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

export function WalletConnect(): React.ReactElement {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) {
          return (
            <div aria-hidden style={{ opacity: 0, pointerEvents: 'none', userSelect: 'none' }}>
              <button className="py-1.5 px-3 text-[10px] font-bold border-2 border-white text-white uppercase tracking-widest">
                Connect
              </button>
            </div>
          )
        }

        if (!account) {
          return (
            <button
              onClick={openConnectModal}
              className="py-1.5 px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold border-2 border-white text-white hover:bg-white hover:text-black transition-all uppercase tracking-widest whitespace-nowrap"
            >
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )
        }

        if (chain?.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="py-1.5 px-2 sm:px-3 text-[10px] font-bold border-2 border-[#EE0000] text-[#EE0000] hover:bg-[#EE0000] hover:text-black transition-all uppercase tracking-widest whitespace-nowrap"
            >
              <span className="hidden sm:inline">Wrong Network</span>
              <span className="sm:hidden">Switch</span>
            </button>
          )
        }

        const shortAddr = account.address
          ? `${account.address.slice(0, 4)}…${account.address.slice(-4)}`
          : account.displayName

        return (
          <button
            onClick={openAccountModal}
            className="flex items-center gap-1.5 py-1.5 px-2 sm:px-3 border border-[#333] hover:border-white text-[10px] font-mono font-bold text-white hover:bg-white/5 transition-all"
          >
            {chain?.iconUrl && (
              <img src={chain.iconUrl} alt={chain.name} className="w-3 h-3 rounded-full flex-shrink-0" />
            )}
            <span className="sm:hidden">{shortAddr}</span>
            <span className="hidden sm:inline">{account.displayName}</span>
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}

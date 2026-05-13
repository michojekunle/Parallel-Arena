'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { monadTestnet } from '@/lib/constants'

export function useWallet() {
  const { address, isConnected, chainId } = useAccount()
  const { authenticated } = usePrivy()
  const { disconnect } = useDisconnect()

  // Privy sets `authenticated` before wagmi syncs the embedded wallet,
  // so gate UI on either being true to avoid a flash of "not connected".
  const isActuallyConnected = isConnected || authenticated

  const isCorrectChain = chainId === monadTestnet.id
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null

  return {
    address,
    isConnected: isActuallyConnected,
    isCorrectChain,
    shortAddress,
    disconnect,
  }
}

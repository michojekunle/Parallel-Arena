'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { monadTestnet } from '@/lib/constants'

export function useWallet() {
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()

  const isCorrectChain = chainId === monadTestnet.id
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null

  return {
    address,
    isConnected,
    isCorrectChain,
    shortAddress,
    disconnect,
  }
}

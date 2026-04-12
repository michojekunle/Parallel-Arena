import { useState, useEffect, useCallback } from 'react'
import { createWalletClient, http, createPublicClient, parseEther, type Hex } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { monadTestnet } from '@/lib/constants'

export function useSessionKey(userAddress: `0x${string}` | undefined) {
  const [sessionKey, setSessionKey] = useState<Hex | null>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)

  // Initialize or load existing session key
  useEffect(() => {
    if (!userAddress) return
    const stored = localStorage.getItem(`session_key_${userAddress.toLowerCase()}`)
    if (stored) {
      setSessionKey(stored as Hex)
    } else {
      const newKey = generatePrivateKey()
      localStorage.setItem(`session_key_${userAddress.toLowerCase()}`, newKey)
      setSessionKey(newKey)
    }
  }, [userAddress])

  const account = sessionKey ? privateKeyToAccount(sessionKey) : null
  
  const walletClient = account ? createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz')
  }) : null

  return {
    sessionKey,
    sessionAddress: account?.address,
    walletClient,
    isAuthorized,
    setIsAuthorized,
  }
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPublicClient, createWalletClient, http, parseEther, parseGwei } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { useWalletClient } from 'wagmi'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { monadTestnet } from '@/lib/constants'
import { Action, SessionKeyState } from '@/lib/types'

// Minimum MON the session key needs to cover ~200 submitAction calls at 50 gwei
const SESSION_FUND_AMOUNT = parseEther('0.01')
const SESSION_DURATION_SECS = 86400 // 24 hours

interface SessionKeyInternal {
  // Private key lives ONLY in this ref — never in state, never serialized
  privateKey: `0x${string}`
  address: `0x${string}`
  expiresAt: number // unix seconds
}

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'),
})

export function useSessionKey(): SessionKeyState {
  const { data: walletClient } = useWalletClient()

  // Private key stored in ref — never enters React state tree
  const skRef = useRef<SessionKeyInternal | null>(null)

  // Only derived/public state is exposed
  const [skAddress, setSkAddress] = useState<`0x${string}` | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  // Live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      if (!expiresAt) { setSecondsRemaining(0); return }
      const remaining = expiresAt - Math.floor(Date.now() / 1000)
      setSecondsRemaining(Math.max(0, remaining))
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const isActive = skAddress !== null && secondsRemaining > 0
  const isExpired = skAddress !== null && secondsRemaining === 0

  // ============================================================
  // authorize — generates ephemeral key, registers it on-chain,
  //             then funds it with 0.01 MON for gas
  // ============================================================

  const authorize = useCallback(async (): Promise<void> => {
    if (!walletClient) throw new Error('Wallet not connected')

    // Step 1: Generate ephemeral keypair (pure crypto, no wallet interaction)
    const pk = generatePrivateKey()
    const account = privateKeyToAccount(pk)
    const skAddr = account.address
    const expiry = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECS

    // Step 2: Register key on-chain (wallet popup #1 — "Authorize session key")
    const authHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'authorizeSessionKey',
      args: [skAddr, BigInt(expiry)],
      gasPrice: parseGwei('50'),
    })
    await publicClient.waitForTransactionReceipt({ hash: authHash })

    // Step 3: Fund the session key for gas (wallet popup #2 — "Fund 0.01 MON")
    const fundHash = await walletClient.sendTransaction({
      to: skAddr,
      value: SESSION_FUND_AMOUNT,
      gasPrice: parseGwei('50'),
    })
    await publicClient.waitForTransactionReceipt({ hash: fundHash })

    // Step 4: Store key in ref (never in state)
    skRef.current = { privateKey: pk, address: skAddr, expiresAt: expiry }

    // Update public state
    setSkAddress(skAddr)
    setExpiresAt(expiry)
    setSecondsRemaining(SESSION_DURATION_SECS)
  }, [walletClient])

  // ============================================================
  // revoke — removes key from chain and clears ref
  // ============================================================

  const revoke = useCallback(async (): Promise<void> => {
    if (!walletClient) throw new Error('Wallet not connected')

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'revokeSessionKey',
      gasPrice: parseGwei('50'),
    })
    await publicClient.waitForTransactionReceipt({ hash })

    skRef.current = null
    setSkAddress(null)
    setExpiresAt(null)
    setSecondsRemaining(0)
  }, [walletClient])

  // ============================================================
  // signAction — submits a game action WITHOUT any wallet popup.
  //              The session key's wallet client signs silently.
  // ============================================================

  const signAction = useCallback(async (action: Action): Promise<`0x${string}`> => {
    const sk = skRef.current
    if (!sk) throw new Error('No active session key')
    if (Math.floor(Date.now() / 1000) > sk.expiresAt) throw new Error('Session key expired')

    // Build a wallet client from the in-memory session key account
    const skAccount = privateKeyToAccount(sk.privateKey)
    const skWalletClient = createWalletClient({
      account: skAccount,
      chain: monadTestnet,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'),
    })

    // Fire tx — no popup, no MetaMask, just viem
    const hash = await skWalletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'submitAction',
      args: [action],
      gasPrice: parseGwei('50'),
    })

    return hash
  }, [])

  return {
    isActive,
    isExpired,
    address: skAddress,
    expiresAt,
    secondsRemaining,
    authorize,
    revoke,
    signAction,
  }
}

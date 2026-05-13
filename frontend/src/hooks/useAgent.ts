'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPublicClient, http, fallback, parseEther, parseGwei } from 'viem'
import { useWalletClient, useAccount } from 'wagmi'
import { ABI, CONTRACT_ADDRESS, AGENT_CREATION_FEE } from '@/lib/contract'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { AgentInfo, AgentStrategy } from '@/lib/types'

// Use the same fallback transport as the rest of the app — a single URL
// would silently drop agent queries if the primary RPC is unavailable.
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 }))),
})

export interface AgentState {
  myAgentAddress: `0x${string}` | null
  myAgentInfo: AgentInfo | null
  allAgents: Array<{ address: `0x${string}`; info: AgentInfo }>
  pendingRewards: bigint
  isRegistering: boolean
  isDepositing: boolean
  error: string | null
  registerAgent: (agentAddress: `0x${string}`, strategy: AgentStrategy, depositMON: string) => Promise<void>
  depositAgent: (depositMON: string) => Promise<void>
  toggleAgent: () => Promise<void>
  claimRewards: () => Promise<void>
  refresh: () => Promise<void>
}

export function useAgent(): AgentState {
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()

  const [myAgentAddress, setMyAgentAddress] = useState<`0x${string}` | null>(null)
  const [myAgentInfo, setMyAgentInfo] = useState<AgentInfo | null>(null)
  const [allAgents, setAllAgents] = useState<Array<{ address: `0x${string}`; info: AgentInfo }>>([])
  const [pendingRewards, setPendingRewards] = useState(0n)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isDepositing, setIsDepositing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return
    try {
      const [agentData, rewards] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getAllAgents',
        }),
        address
          ? publicClient.readContract({
              address: CONTRACT_ADDRESS, abi: ABI, functionName: 'pendingRewards', args: [address],
            })
          : Promise.resolve(0n),
      ])

      const [addrs, infos] = agentData as [`0x${string}`[], AgentInfo[]]
      setAllAgents(addrs.map((a, i) => ({ address: a, info: infos[i] })))
      setPendingRewards(rewards as bigint)

      if (address) {
        const ownerAgentAddr = await publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: ABI, functionName: 'ownerAgent', args: [address],
        }) as `0x${string}`

        if (ownerAgentAddr !== '0x0000000000000000000000000000000000000000') {
          setMyAgentAddress(ownerAgentAddr)
          const info = await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getAgentInfo', args: [ownerAgentAddr],
          }) as AgentInfo
          setMyAgentInfo(info)
        } else {
          setMyAgentAddress(null)
          setMyAgentInfo(null)
        }
      }
    } catch (e: unknown) {
      // non-fatal polling error
      void e
    }
  }, [address])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 10_000)
    return () => clearInterval(interval)
  }, [refresh])

  const registerAgent = useCallback(async (
    agentAddress: `0x${string}`,
    strategy: AgentStrategy,
    depositMON: string,
  ): Promise<void> => {
    if (!walletClient || !address) { setError('Connect wallet first'); return }
    setError(null)
    setIsRegistering(true)
    try {
      const depositWei = parseEther(depositMON || '0')
      const total = AGENT_CREATION_FEE + depositWei
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'registerAgent',
        args: [agentAddress, strategy],
        value: total,
        gasPrice: parseGwei('52'),
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registration failed'
      setError(
        msg.includes('Already have an agent') ? 'You already have a registered agent'
          : msg.includes('Agent address already registered') ? 'That agent address is already taken'
          : msg.includes('User rejected') ? 'Transaction cancelled'
          : `Registration failed: ${msg.slice(0, 80)}`
      )
    } finally {
      setIsRegistering(false)
    }
  }, [walletClient, address, refresh])

  const depositAgent = useCallback(async (depositMON: string): Promise<void> => {
    if (!walletClient || !myAgentAddress) { setError('No agent registered'); return }
    setError(null)
    setIsDepositing(true)
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'depositAgent',
        args: [myAgentAddress],
        value: parseEther(depositMON),
        gasPrice: parseGwei('52'),
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Deposit failed'
      setError(msg.includes('User rejected') ? 'Transaction cancelled' : `Deposit failed: ${msg.slice(0, 60)}`)
    } finally {
      setIsDepositing(false)
    }
  }, [walletClient, myAgentAddress, refresh])

  const toggleAgent = useCallback(async (): Promise<void> => {
    if (!walletClient || !myAgentInfo) { setError('No agent registered'); return }
    setError(null)
    try {
      const fn = myAgentInfo.active ? 'deactivateAgent' : 'activateAgent'
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: fn, gasPrice: parseGwei('52'),
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Toggle failed'
      setError(msg.includes('User rejected') ? 'Transaction cancelled' : `Failed: ${msg.slice(0, 60)}`)
    }
  }, [walletClient, myAgentInfo, refresh])

  const claimRewards = useCallback(async (): Promise<void> => {
    if (!walletClient) { setError('Connect wallet first'); return }
    setError(null)
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'withdrawRewards', gasPrice: parseGwei('52'),
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Claim failed'
      setError(msg.includes('User rejected') ? 'Transaction cancelled' : `Claim failed: ${msg.slice(0, 60)}`)
    }
  }, [walletClient, refresh])

  return {
    myAgentAddress,
    myAgentInfo,
    allAgents,
    pendingRewards,
    isRegistering,
    isDepositing,
    error,
    registerAgent,
    depositAgent,
    toggleAgent,
    claimRewards,
    refresh,
  }
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, fallback, parseGwei, parseEther, type WalletClient, type Account, type Transport, type Chain } from 'viem'
import { useWalletClient, useAccount, useSignTypedData } from 'wagmi'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { monadTestnet, RPC_URLS, POLL_INTERVAL, SHORT_ADDR, ACTION_LABELS } from '@/lib/constants'
import {
  Action, Player, GameState, RoundResult, LogEntry, PendingAction,
  PlayerStatus, JoinStep, GamePhase, FullGameState, PrizeAmounts,
} from '@/lib/types'
import { useGameSounds } from './useGameSounds'
import { useSessionKey } from './useSessionKey'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 }))),
})

// EIP-712 domain — must match contract constructor (keccak256("ParallelArenaV2")).
const EIP712_DOMAIN = {
  name: 'ParallelArenaV2',
  version: '1',
  chainId: monadTestnet.id,
  verifyingContract: CONTRACT_ADDRESS,
} as const

const ACTION_PERMIT_TYPES = {
  ActionPermit: [
    { name: 'player',   type: 'address' },
    { name: 'action',   type: 'uint8'   },
    { name: 'round',    type: 'uint256' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const CLAIM_PERMIT_TYPES = {
  ClaimPermit: [
    { name: 'player',   type: 'address' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type TxStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'failed'

function makeId(): string {
  return Math.random().toString(36).slice(2)
}

function splitSig(sig: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
  return {
    r: sig.slice(0, 66) as `0x${string}`,
    s: `0x${sig.slice(66, 130)}` as `0x${string}`,
    v: parseInt(sig.slice(130, 132), 16),
  }
}

// Fetch server unix time (seconds). Falls back to local clock if the
// endpoint is unreachable — slight clock drift is tolerable within the
// extended 180s / 300s deadline windows.
async function getServerTime(): Promise<number> {
  try {
    const res = await fetch('/api/time', { cache: 'no-store' })
    if (!res.ok) throw new Error('non-ok')
    const { unix } = await res.json() as { unix: number }
    return unix
  } catch {
    return Math.floor(Date.now() / 1000)
  }
}

async function relay(body: Record<string, unknown>): Promise<`0x${string}`> {
  const res = await fetch('/api/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { txHash?: `0x${string}`; error?: string }
  if (!res.ok || data.error) throw new Error(data.error || 'Relay failed')
  if (!data.txHash) throw new Error('Relay returned no txHash')
  return data.txHash
}

function loadPersistedLog(): LogEntry[] {
  if (typeof sessionStorage === 'undefined') return []
  try { return JSON.parse(sessionStorage.getItem('arena_log') ?? '[]') as LogEntry[] } catch { return [] }
}

export function useArena() {
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { play } = useGameSounds()
  const { sessionAddress, walletClient: sessionWallet, setIsAuthorized, isAuthorized } = useSessionKey(address)

  const [gameState, setGameState] = useState<GameState | null>(null)
  const [fullGameState, setFullGameState] = useState<FullGameState | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myAction, setMyAction] = useState<Action>(Action.NONE)
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])
  const [lastResult, setLastResult] = useState<RoundResult | null>(null)
  const [log, setLog] = useState<LogEntry[]>(loadPersistedLog)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [isFlashing, setIsFlashing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [joinStep, setJoinStep] = useState<JoinStep>('idle')
  const [roundStartMs, setRoundStartMs] = useState<number | null>(null)
  const [lastRoundMs, setLastRoundMs] = useState<number | null>(null)
  const [prizeAmounts, setPrizeAmounts] = useState<PrizeAmounts | null>(null)
  const [hasClaimed, setHasClaimed] = useState(false)
  const [lastRoundNum, setLastRoundNum] = useState<number>(0)
  const [resolvedTxHashes, setResolvedTxHashes] = useState<`0x${string}`[]>([])

  // Per-round attack events — full addresses, populated from on-chain events
  const [attackEvents, setAttackEvents] = useState<Array<{ attacker: string; target: string; damage: number }>>([])

  // Quorum / start voting
  const [startVoteCount, setStartVoteCount] = useState<number>(0)
  const [quorum, setQuorum] = useState<number>(0)
  const [hasVotedToStart, setHasVotedToStart] = useState(false)

  // Tx status machine (6.1)
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const txStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup all timers on unmount to prevent state updates on a dead component
  useEffect(() => {
    return () => {
      if (txStatusTimerRef.current) clearTimeout(txStatusTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const setTxDone = useCallback((status: 'confirmed' | 'failed') => {
    setTxStatus(status)
    if (txStatusTimerRef.current) clearTimeout(txStatusTimerRef.current)
    txStatusTimerRef.current = setTimeout(() => { setTxStatus('idle'); setTxHash(null) }, 8_000)
  }, [])

  // Session key expiry cache (1.3)
  const sessionExpiryRef = useRef<{ value: bigint; fetchedAt: number } | null>(null)

  const getSessionExpiry = useCallback(async (player: `0x${string}`): Promise<bigint> => {
    const now = Date.now()
    if (sessionExpiryRef.current && now - sessionExpiryRef.current.fetchedAt < 30_000) {
      return sessionExpiryRef.current.value
    }
    const expiry = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: 'sessionKeyExpiry', args: [player],
    }) as bigint
    sessionExpiryRef.current = { value: expiry, fetchedAt: now }
    return expiry
  }, [])

  // Sound Effects Triggers
  useEffect(() => {
    if (!gameState) return
    const currentRound = Number(gameState.round)
    const isEnded = fullGameState?.gamePhase === GamePhase.ENDED
    if (currentRound > lastRoundNum) {
      play(isEnded ? 'VICTORY' : 'RESOLVE')
      setLastRoundNum(currentRound)
    }
  }, [gameState, fullGameState, lastRoundNum, play])

  const lastRoundRef = useRef<bigint>(-1n)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unwatchRef = useRef<(() => void) | null>(null)

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLog(prev => {
      const next = [...prev.slice(-199), { ...entry, id: makeId(), timestamp: Date.now() }]
      try { sessionStorage.setItem('arena_log', JSON.stringify(next)) } catch { /* quota exceeded */ }
      return next
    })
  }, [])

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const fetchState = useCallback(async () => {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return
    try {
      const [fgs, allPlayers, remaining] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getFullGameState' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getAllPlayers' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getTimeRemaining' }),
      ])

      const [round, deadline, activePlayers, totalPlayers, resolved, pool, maxRounds, gamePhaseRaw, topWinners] =
        fgs as [bigint, bigint, bigint, bigint, boolean, bigint, bigint, number, [`0x${string}`, `0x${string}`, `0x${string}`]]

      const gamePhase = gamePhaseRaw as GamePhase
      const typedPlayers = allPlayers as Player[]

      const gs: GameState = { round, deadline, activePlayers, totalPlayers, resolved }
      setGameState(gs)
      setFullGameState({ round, deadline, activePlayers, totalPlayers, resolved, pool, maxRounds, gamePhase, winners: topWinners })
      setPlayers(typedPlayers)
      setTimeRemaining(Number(remaining))

      // Fetch quorum state when game is WAITING
      if (gamePhase === GamePhase.WAITING) {
        try {
          const [vc, qr] = await Promise.all([
            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'startVoteCount' }),
            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'quorumRequired' }),
          ]) as [bigint, bigint]
          setStartVoteCount(Number(vc))
          setQuorum(Number(qr))
        } catch { /* non-fatal */ }
      }

      if (pool > 0n) {
        try {
          const pa = await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getPrizeAmounts',
          }) as [bigint, bigint, bigint]
          setPrizeAmounts({ firstPrize: pa[0], secondPrize: pa[1], thirdPrize: pa[2] })
        } catch { /* non-fatal */ }
      }

      if (round !== lastRoundRef.current && lastRoundRef.current !== -1n) {
        const prevRound = lastRoundRef.current
        // Clear previous round's attack events before populating from new round's events
        setAttackEvents([])
        try {
          const result = await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getRoundResult', args: [prevRound],
          }) as RoundResult
          setLastResult(result)
          setIsFlashing(true)
          setRoundStartMs(prev => { if (prev !== null) setLastRoundMs(Date.now() - prev); return null })
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
          flashTimerRef.current = setTimeout(() => setIsFlashing(false), 1000)
          // Snapshot hashes of actions that resolved this round for the visualizer
          setPendingActions(prev => {
            setResolvedTxHashes(prev.flatMap(p => p.txHash ? [p.txHash as `0x${string}`] : []))
            return []
          })
          setMyAction(Action.NONE)
        } catch { /* result not yet available */ }
      }
      lastRoundRef.current = round

      if (address) {
        try {
          const action = await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getActionFor', args: [round, address],
          }) as number
          setMyAction(action as Action)
        } catch { setMyAction(Action.NONE) }
      }
    } catch { /* silently fail during polling */ }
  }, [address])

  // Contract event watchers
  useEffect(() => {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return

    const unwatch1 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS, abi: ABI, eventName: 'ActionSubmitted', pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const t = log as { args: { player: `0x${string}`; action: number; round: bigint }; transactionHash?: `0x${string}` }
          const { player, action, round } = t.args
          const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS] || 'UNKNOWN'
          addLog({ round: Number(round), message: `${SHORT_ADDR(player)} submitted ${label}`, type: 'action' })
          setRoundStartMs(prev => prev === null ? Date.now() : prev)
          setPendingActions(prev => {
            const filtered = prev.filter(p => p.player !== player)
            return [...filtered, { player, action: action as Action, round: Number(round), txHash: t.transactionHash }]
          })
        })
      },
    })

    const unwatch2 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS, abi: ABI, eventName: 'RoundResolved', pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const t = log as { args: { round: bigint; actionsProcessed: bigint } }
          addLog({ round: Number(t.args.round), message: `RESOLVE: ${t.args.actionsProcessed} actions processed`, type: 'resolve' })
        })
      },
    })

    const unwatch3 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS, abi: ABI, eventName: 'PlayerAttacked', pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const t = log as { args: { attacker: `0x${string}`; target: `0x${string}`; damage: bigint } }
          addLog({ round: Number(lastRoundRef.current), message: `${SHORT_ADDR(t.args.attacker)} → ${SHORT_ADDR(t.args.target)} ${t.args.damage} DMG`, type: 'attack' })
          // Store full lowercase addresses so UI can correctly flash/float damage on player cards
          setAttackEvents(prev => [...prev, {
            attacker: t.args.attacker.toLowerCase(),
            target: t.args.target.toLowerCase(),
            damage: Number(t.args.damage),
          }])
        })
      },
    })

    const unwatch4 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS, abi: ABI, eventName: 'PlayerEliminated', pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const t = log as { args: { player: `0x${string}`; killedBy: `0x${string}` } }
          addLog({ round: Number(lastRoundRef.current), message: `${SHORT_ADDR(t.args.player)} ELIMINATED by ${SHORT_ADDR(t.args.killedBy)}`, type: 'death' })
        })
      },
    })

    const unwatch5 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS, abi: ABI, eventName: 'PlayerJoined', pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const t = log as { args: { player: `0x${string}`; attack: bigint } }
          addLog({ round: Number(lastRoundRef.current), message: `${SHORT_ADDR(t.args.player)} joined (ATK:${t.args.attack})`, type: 'join' })
        })
      },
    })

    const unwatch6 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS, abi: ABI, eventName: 'GameEnded', pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const t = log as { args: { prizePool: bigint } }
          addLog({ round: Number(lastRoundRef.current), message: `GAME ENDED — pool: ${Number(t.args.prizePool) / 1e18} MON`, type: 'system' })
          fetchState()
        })
      },
    })

    unwatchRef.current = () => { unwatch1(); unwatch2(); unwatch3(); unwatch4(); unwatch5(); unwatch6() }
    return () => { if (unwatchRef.current) unwatchRef.current() }
  }, [addLog, fetchState])

  // Polling
  useEffect(() => {
    fetchState()
    pollingRef.current = setInterval(fetchState, POLL_INTERVAL)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [fetchState])

  // Client-side countdown
  useEffect(() => {
    const interval = setInterval(() => setTimeRemaining(prev => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(interval)
  }, [])

  // ============================================================
  // WRITE FUNCTIONS
  // ============================================================

  const joinAndAuthorize = useCallback(async (): Promise<void> => {
    if (!walletClient || !address || !sessionAddress) { showToast('Connect wallet first', 'error'); return }
    try {
      setJoinStep('joining')
      showToast('Step 1/2: Joining arena...', 'success')

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'joinArena',
        value: parseEther('0.01'),
        gasPrice: parseGwei('52'),
      })
      await publicClient.waitForTransactionReceipt({ hash })

      showToast('Step 2/2: Authorizing Silent Protocol...', 'success')
      const authHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'authorizeSessionKey',
        args: [sessionAddress, BigInt(Math.floor(Date.now() / 1000) + 86400)],
        gasPrice: parseGwei('52'),
      })

      await publicClient.waitForTransactionReceipt({ hash: authHash })
      // Invalidate expiry cache after fresh authorization
      sessionExpiryRef.current = null

      setIsAuthorized(true)
      addLog({ round: Number(gameState?.round ?? 0), message: 'You joined & authorized silent protocol', type: 'join' })
      setJoinStep('done')
      showToast('⚡ Session Protocol Active. Silent moves enabled.', 'success')
      play('JOIN')
      await fetchState()
    } catch (e: unknown) {
      await fetchState().catch(() => null)
      setJoinStep('idle')
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(
        msg.includes('Already in arena') ? 'Already in arena'
          : msg.includes('User rejected') ? 'Transaction cancelled'
          : `Join failed: ${msg.slice(0, 60)}`,
        'error'
      )
    }
  }, [walletClient, address, sessionAddress, setIsAuthorized, gameState, addLog, showToast, fetchState, play])

  const submitAction = useCallback(async (action: Action): Promise<void> => {
    if (!address) { showToast('Connect wallet first', 'error'); return }

    const round = Number(gameState?.round ?? 0)
    const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS] || 'UNKNOWN'

    // Optimistic update
    setMyAction(action)
    setPendingActions(prev => [...prev.filter(p => p.player !== address), { player: address, action, round }])

    if (action === Action.ATTACK) play('ATTACK')
    else if (action === Action.HEAL) play('HEAL')
    else if (action === Action.DEFEND) play('DEFEND')

    setTxStatus('submitting')
    setTxHash(null)

    try {
      let hash: `0x${string}`

      const now = await getServerTime()

      const nonce = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'nonces', args: [address],
      }) as bigint
      const deadline = BigInt(now + 180)

      if (isAuthorized && sessionWallet) {
        // Session key is authorized — sign the EIP-712 permit locally (no MetaMask popup).
        // The contract accepts session key signatures so the relay can submit on behalf of the player.
        const expiry = await getSessionExpiry(address)
        if (expiry < BigInt(now)) {
          // Session key expired — invalidate and fall back to user wallet
          setIsAuthorized(false)
          sessionExpiryRef.current = null
          showToast('Session expired — please re-join to restore silent mode', 'error')
          const signature = await signTypedDataAsync({
            domain: EIP712_DOMAIN, types: ACTION_PERMIT_TYPES, primaryType: 'ActionPermit',
            message: { player: address, action, round: BigInt(round), nonce, deadline },
          })
          const { v, r, s } = splitSig(signature)
          hash = await relay({ type: 'action', player: address, action, nonce: nonce.toString(), deadline: deadline.toString(), v, r, s })
        } else {
          // Sign silently with session key (local private key — no MetaMask popup).
          // Cast to WalletClient with a bound Account so signTypedData doesn't require
          // an `account` argument (the client was created with one already embedded).
          const signature = await (sessionWallet as WalletClient<Transport, Chain, Account>).signTypedData({
            domain: EIP712_DOMAIN, types: ACTION_PERMIT_TYPES, primaryType: 'ActionPermit',
            message: { player: address, action, round: BigInt(round), nonce, deadline },
          }) as `0x${string}`
          const { v, r, s } = splitSig(signature)
          hash = await relay({ type: 'action', player: address, action, nonce: nonce.toString(), deadline: deadline.toString(), v, r, s })
        }
      } else {
        // No session key — fall back to user wallet signing (MetaMask popup).
        const signature = await signTypedDataAsync({
          domain: EIP712_DOMAIN, types: ACTION_PERMIT_TYPES, primaryType: 'ActionPermit',
          message: { player: address, action, round: BigInt(round), nonce, deadline },
        })
        const { v, r, s } = splitSig(signature)
        hash = await relay({ type: 'action', player: address, action, nonce: nonce.toString(), deadline: deadline.toString(), v, r, s })
      }

      setTxHash(hash)
      setTxStatus('pending')
      addLog({ round, message: `You submitted ${label} ⚡`, type: 'action', txHash: hash })

      // Confirm async — don't block the UI
      publicClient.waitForTransactionReceipt({ hash }).then(() => {
        setTxDone('confirmed')
      }).catch(() => {
        setTxDone('failed')
      })

      await fetchState()
    } catch (e: unknown) {
      setMyAction(Action.NONE)
      setPendingActions(prev => prev.filter(p => p.player !== address))
      setTxDone('failed')
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(
        msg.includes('Already acted') ? 'Already acted this round'
          : msg.includes('User rejected') ? 'Signature cancelled'
          : `Action failed: ${msg.slice(0, 60)}`,
        'error'
      )
    }
  }, [address, gameState, isAuthorized, sessionWallet, signTypedDataAsync, getSessionExpiry, setIsAuthorized, addLog, showToast, fetchState, play, setTxDone])

  const resolveRound = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'resolveRound', gasPrice: parseGwei('52'),
      })
      showToast('Resolving round...', 'success')
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Resolve failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, showToast, fetchState])

  const voteToStart = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'voteToStart', gasPrice: parseGwei('52'),
      })
      showToast('Vote submitted — waiting for quorum...', 'success')
      setHasVotedToStart(true)
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Vote failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, showToast, fetchState])

  const claimPrize = useCallback(async (): Promise<void> => {
    if (!address) { showToast('Connect wallet first', 'error'); return }
    try {
      const now = await getServerTime()
      const nonce = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'nonces', args: [address],
      }) as bigint
      const deadline = BigInt(now + 300)

      const signature = await signTypedDataAsync({
        domain: EIP712_DOMAIN, types: CLAIM_PERMIT_TYPES, primaryType: 'ClaimPermit',
        message: { player: address, nonce, deadline },
      })

      const { v, r, s } = splitSig(signature)
      showToast('Claiming prize (gasless)...', 'success')

      const txHash = await relay({ type: 'claim', player: address, nonce: nonce.toString(), deadline: deadline.toString(), v, r, s })

      setHasClaimed(true)
      showToast('Prize claimed!', 'success')
      addLog({ round: Number(gameState?.round ?? 0), message: 'Prize claimed!', type: 'system', txHash })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Claim failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [address, gameState, signTypedDataAsync, addLog, showToast])

  const resetGame = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'resetGame', gasPrice: parseGwei('52'),
      })
      showToast('Resetting game...', 'success')
      await publicClient.waitForTransactionReceipt({ hash })
      setHasClaimed(false)
      addLog({ round: 0, message: 'Game reset — new session started', type: 'system' })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Reset failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, addLog, showToast, fetchState])

  // Check if the current address has already voted to start
  useEffect(() => {
    if (!address || !CONTRACT_ADDRESS || fullGameState?.gamePhase !== GamePhase.WAITING) return
    publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: 'startVotes', args: [address],
    }).then(voted => setHasVotedToStart(voted as boolean)).catch(() => undefined)
  }, [address, startVoteCount, fullGameState?.gamePhase])

  const myPlayer = players.find(p => p.addr.toLowerCase() === address?.toLowerCase()) ?? null
  const isInArena = myPlayer?.status === PlayerStatus.ACTIVE
  const isEliminated = myPlayer?.status === PlayerStatus.DEAD
  const hasActed = myAction !== Action.NONE
  // Don't offer join during ENDED phase — the game is over until reset
  const showJoinButton = !isInArena && !isEliminated && joinStep === 'idle'
    && fullGameState?.gamePhase !== GamePhase.ENDED

  // Compute attack target client-side (lowest HP active non-self player)
  const attackTarget = players
    .filter(p => p.status === PlayerStatus.ACTIVE && p.addr.toLowerCase() !== address?.toLowerCase())
    .sort((a, b) => Number(a.health) - Number(b.health))[0]?.addr ?? null

  return {
    gameState,
    fullGameState,
    players,
    myPlayer,
    myAction,
    isInArena,
    isEliminated,
    hasActed,
    showJoinButton,
    pendingActions,
    lastResult,
    log,
    timeRemaining,
    isFlashing,
    toast,
    joinStep,
    lastRoundMs,
    prizeAmounts,
    hasClaimed,
    resolvedTxHashes,
    txStatus,
    txHash,
    attackTarget,
    attackEvents,
    startVoteCount,
    quorum,
    hasVotedToStart,
    joinAndAuthorize,
    submitAction,
    resolveRound,
    voteToStart,
    claimPrize,
    resetGame,
    sessionAddress,
    isAuthorized,
  }
}

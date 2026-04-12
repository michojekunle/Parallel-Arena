'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, parseGwei, parseEther } from 'viem'
import { useWalletClient, useAccount, useSignTypedData } from 'wagmi'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { monadTestnet, POLL_INTERVAL, SHORT_ADDR, ACTION_LABELS } from '@/lib/constants'
import {
  Action, Player, GameState, RoundResult, LogEntry, PendingAction,
  PlayerStatus, JoinStep, GamePhase, FullGameState, PrizeAmounts,
} from '@/lib/types'
import { useGameSounds } from './useGameSounds'
import { useSessionKey } from './useSessionKey'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'),
})

// EIP-712 domain — must match contract constructor.
// chainId must be `number`, not bigint — wagmi's TypedDataDomain expects number.
const EIP712_DOMAIN = {
  name: 'ParallelArena',
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

function makeId(): string {
  return Math.random().toString(36).slice(2)
}

// Split compact 65-byte signature into v, r, s
function splitSig(sig: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
  return {
    r: sig.slice(0, 66) as `0x${string}`,
    s: `0x${sig.slice(66, 130)}` as `0x${string}`,
    v: parseInt(sig.slice(130, 132), 16),
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
  return data.txHash!
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
  const [log, setLog] = useState<LogEntry[]>([])
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [isFlashing, setIsFlashing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [joinStep, setJoinStep] = useState<JoinStep>('idle')
  const [roundStartMs, setRoundStartMs] = useState<number | null>(null)
  const [lastRoundMs, setLastRoundMs] = useState<number | null>(null)
  const [prizeAmounts, setPrizeAmounts] = useState<PrizeAmounts | null>(null)
  const [hasClaimed, setHasClaimed] = useState(false)
  const [lastRoundNum, setLastRoundNum] = useState<number>(0)

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
    setLog(prev => [...prev.slice(-199), { ...entry, id: makeId(), timestamp: Date.now() }])
  }, [])

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
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
        try {
          const result = await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getRoundResult', args: [prevRound],
          }) as RoundResult
          setLastResult(result)
          setIsFlashing(true)
          setRoundStartMs(prev => { if (prev !== null) setLastRoundMs(Date.now() - prev); return null })
          setTimeout(() => setIsFlashing(false), 1000)
          setPendingActions([])
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
          const t = log as { args: { player: `0x${string}`; action: number; round: bigint } }
          const { player, action, round } = t.args
          const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS] || 'UNKNOWN'
          addLog({ round: Number(round), message: `${SHORT_ADDR(player)} submitted ${label}`, type: 'action' })
          setRoundStartMs(prev => prev === null ? Date.now() : prev)
          setPendingActions(prev => {
            const filtered = prev.filter(p => p.player !== player)
            return [...filtered, { player, action: action as Action, round: Number(round) }]
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

  // Join the arena and authorize silent session key (1 wallet tx)
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
        gasPrice: parseGwei('250'),
      })
      await publicClient.waitForTransactionReceipt({ hash })

      showToast('Step 2/2: Authorizing Silent Protocol...', 'success')
      const authHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'authorizeSessionKey',
        args: [sessionAddress, BigInt(Math.floor(Date.now() / 1000) + 86400)], // 24h
        gasPrice: parseGwei('250'),
      })
      
      // Also send 0.01 MON for gas to the session address
      await walletClient.sendTransaction({
        to: sessionAddress,
        value: parseEther('0.01'),
        gasPrice: parseGwei('250'),
      })

      await publicClient.waitForTransactionReceipt({ hash: authHash })
      
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

  // Submit action via EIP-712 typed signature → relay API (no wallet popup)
  const submitAction = useCallback(async (action: Action): Promise<void> => {
    if (!address) { showToast('Connect wallet first', 'error'); return }

    const round = Number(gameState?.round ?? 0)
    const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS] || 'UNKNOWN'

    // Optimistic update
    setMyAction(action)
    setPendingActions(prev => [...prev.filter(p => p.player !== address), { player: address, action, round }])

    // Play sound FX
    if (action === Action.ATTACK) play('ATTACK')
    else if (action === Action.HEAL) play('HEAL')
    else if (action === Action.DEFEND) play('DEFEND')

    try {
      if (isAuthorized && sessionWallet) {
        // SILENT PROTOCOL: Submit directly via session key (No wallet popup!)
        const hash = await sessionWallet.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'submitAction',
          args: [action],
          gasPrice: parseGwei('250'),
        })
        addLog({ round, message: `You submitted ${label} ⚡ (silent)`, type: 'action', txHash: hash })
        showToast(`⚡ ${label} submitted (Silent Mode)`, 'success')
      } else {
        // FALLBACK: Permit-Relay flow (One-off signatures)
        const nonce = await publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: ABI, functionName: 'nonces', args: [address],
        }) as bigint
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60)

        const signature = await signTypedDataAsync({
          domain: EIP712_DOMAIN,
          types: ACTION_PERMIT_TYPES,
          primaryType: 'ActionPermit',
          message: { player: address, action, round: BigInt(round), nonce, deadline },
        })

        const { v, r, s } = splitSig(signature)
        const txHash = await relay({
          type: 'action',
          player: address,
          action,
          nonce: nonce.toString(),
          deadline: deadline.toString(),
          v, r, s,
        })
        addLog({ round, message: `You submitted ${label} ⚡ (gasless)`, type: 'action', txHash })
        showToast(`⚡ ${label} submitted (gasless)!`, 'success')
      }
      await fetchState()
    } catch (e: unknown) {
      setMyAction(Action.NONE)
      setPendingActions(prev => prev.filter(p => p.player !== address))
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(
        msg.includes('Already acted') ? 'Already acted this round'
          : msg.includes('User rejected') ? 'Signature cancelled'
          : `Action failed: ${msg.slice(0, 60)}`,
        'error'
      )
    }
  }, [address, gameState, signTypedDataAsync, addLog, showToast])

  const resolveRound = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'resolveRound', gasPrice: parseGwei('250'),
      })
      showToast('Resolving round...', 'success')
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Resolve failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, showToast, fetchState])

  // Claim prize via EIP-712 signed permit → relay (no popup)
  const claimPrize = useCallback(async (): Promise<void> => {
    if (!address) { showToast('Connect wallet first', 'error'); return }
    try {
      const nonce = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'nonces', args: [address],
      }) as bigint
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 120)

      const signature = await signTypedDataAsync({
        domain: EIP712_DOMAIN,
        types: CLAIM_PERMIT_TYPES,
        primaryType: 'ClaimPermit',
        message: { player: address, nonce, deadline },
      })

      const { v, r, s } = splitSig(signature)
      showToast('Claiming prize (gasless)...', 'success')

      const txHash = await relay({
        type: 'claim',
        player: address,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        v, r, s,
      })

      setHasClaimed(true)
      showToast('💰 Prize claimed!', 'success')
      addLog({ round: Number(gameState?.round ?? 0), message: '💰 Prize claimed!', type: 'system', txHash })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Claim failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [address, gameState, signTypedDataAsync, addLog, showToast])

  const resetGame = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'resetGame', gasPrice: parseGwei('250'),
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

  const myPlayer = players.find(p => p.addr.toLowerCase() === address?.toLowerCase()) ?? null
  const isInArena = myPlayer?.status === PlayerStatus.ACTIVE
  const hasActed = myAction !== Action.NONE
  const showJoinButton = !isInArena && joinStep === 'idle'

  return {
    gameState,
    fullGameState,
    players,
    myPlayer,
    myAction,
    isInArena,
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
    joinAndAuthorize,
    submitAction,
    resolveRound,
    claimPrize,
    resetGame,
    sessionAddress,
    isAuthorized,
  }
}

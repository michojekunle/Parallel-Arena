'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, parseGwei } from 'viem'
import { useWalletClient, useAccount } from 'wagmi'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { monadTestnet, POLL_INTERVAL, SHORT_ADDR, ACTION_LABELS } from '@/lib/constants'
import {
  Action, Player, GameState, RoundResult, LogEntry, PendingAction,
  PlayerStatus, JoinStep,
} from '@/lib/types'
import { useSessionKey } from './useSessionKey'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'),
})

function makeId(): string {
  return Math.random().toString(36).slice(2)
}

export function useArena() {
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const sessionKey = useSessionKey()

  const [gameState, setGameState] = useState<GameState | null>(null)
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
      const [gs, allPlayers, remaining] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getGameState' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getAllPlayers' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getTimeRemaining' }),
      ])

      const [round, deadline, activePlayers, totalPlayers, resolved] = gs as [bigint, bigint, bigint, bigint, boolean]
      const typedPlayers = allPlayers as Player[]

      setGameState({ round, deadline, activePlayers, totalPlayers, resolved })
      setPlayers(typedPlayers)
      setTimeRemaining(Number(remaining))

      // Detect new round transition
      if (round !== lastRoundRef.current && lastRoundRef.current !== -1n) {
        const prevRound = lastRoundRef.current
        try {
          const result = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'getRoundResult',
            args: [prevRound],
          }) as RoundResult
          setLastResult(result)
          setIsFlashing(true)
          setRoundStartMs(prev => {
            if (prev !== null) setLastRoundMs(Date.now() - prev)
            return null
          })
          setTimeout(() => setIsFlashing(false), 1000)
          setPendingActions([])
          setMyAction(Action.NONE)
        } catch {
          // result not yet available — next poll will get it
        }
      }
      lastRoundRef.current = round

      // Fetch my current action using getActionFor (works for both player + session key)
      if (address) {
        try {
          const action = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'getActionFor',
            args: [round, address],
          }) as number
          setMyAction(action as Action)
        } catch {
          setMyAction(Action.NONE)
        }
      }
    } catch {
      // Silently fail during polling
    }
  }, [address])

  // Contract event watchers
  useEffect(() => {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return

    const unwatch1 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      eventName: 'ActionSubmitted',
      pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const typedLog = log as { args: { player: `0x${string}`; action: number; round: bigint } }
          const { player, action, round } = typedLog.args
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
      address: CONTRACT_ADDRESS,
      abi: ABI,
      eventName: 'RoundResolved',
      pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const typedLog = log as { args: { round: bigint; actionsProcessed: bigint; resolvedAt: bigint } }
          const { round, actionsProcessed } = typedLog.args
          addLog({ round: Number(round), message: `RESOLVE: ${actionsProcessed} actions processed`, type: 'resolve' })
        })
      },
    })

    const unwatch3 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      eventName: 'PlayerAttacked',
      pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const typedLog = log as { args: { attacker: `0x${string}`; target: `0x${string}`; damage: bigint } }
          const { attacker, target, damage } = typedLog.args
          addLog({
            round: Number(lastRoundRef.current),
            message: `${SHORT_ADDR(attacker)} → attacked ${SHORT_ADDR(target)} for ${damage} DMG`,
            type: 'attack',
          })
        })
      },
    })

    const unwatch4 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      eventName: 'PlayerEliminated',
      pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const typedLog = log as { args: { player: `0x${string}`; killedBy: `0x${string}` } }
          const { player, killedBy } = typedLog.args
          addLog({
            round: Number(lastRoundRef.current),
            message: `${SHORT_ADDR(player)} ELIMINATED by ${SHORT_ADDR(killedBy)}`,
            type: 'death',
          })
        })
      },
    })

    const unwatch5 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      eventName: 'PlayerJoined',
      pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const typedLog = log as { args: { player: `0x${string}`; health: bigint; attack: bigint } }
          const { player, attack } = typedLog.args
          addLog({
            round: Number(lastRoundRef.current),
            message: `${SHORT_ADDR(player)} joined arena (ATK: ${attack})`,
            type: 'join',
          })
        })
      },
    })

    unwatchRef.current = () => { unwatch1(); unwatch2(); unwatch3(); unwatch4(); unwatch5() }
    return () => { if (unwatchRef.current) unwatchRef.current() }
  }, [addLog])

  // Polling
  useEffect(() => {
    fetchState()
    pollingRef.current = setInterval(fetchState, POLL_INTERVAL)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [fetchState])

  // Client-side countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ============================================================
  // WRITE FUNCTIONS
  // ============================================================

  const joinArena = useCallback(async (): Promise<void> => {
    if (!walletClient || !address) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'joinArena',
        gasPrice: parseGwei('50'),
      })
      showToast('Joining arena...', 'success')
      addLog({ round: Number(gameState?.round ?? 0), message: 'You joined the arena', type: 'join' })
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(msg.includes('Already in arena') ? 'Already in arena' : `Join failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, address, gameState, addLog, showToast, fetchState])

  // Combined join + session key authorization — the recommended entry point
  const joinAndAuthorize = useCallback(async (): Promise<void> => {
    if (!walletClient || !address) { showToast('Connect wallet first', 'error'); return }

    try {
      setJoinStep('joining')
      showToast('1/3 Joining arena...', 'success')
      const joinHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'joinArena',
        gasPrice: parseGwei('50'),
      })
      await publicClient.waitForTransactionReceipt({ hash: joinHash })
      addLog({ round: Number(gameState?.round ?? 0), message: 'You joined the arena', type: 'join' })

      setJoinStep('authorizing')
      showToast('2/3 Authorizing session key...', 'success')
      await sessionKey.authorize() // handles auth tx + fund tx internally

      setJoinStep('done')
      showToast('⚡ Session active — no more popups for 24h!', 'success')
      addLog({ round: Number(gameState?.round ?? 0), message: '⚡ Session key active — auto-signing enabled', type: 'system' })
      await fetchState()
    } catch (e: unknown) {
      setJoinStep('idle')
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(msg.includes('Already in arena') ? 'Already in arena' : `Join failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, address, gameState, sessionKey, addLog, showToast, fetchState])

  const submitAction = useCallback(async (action: Action): Promise<void> => {
    if (!address) { showToast('Connect wallet first', 'error'); return }

    const round = Number(gameState?.round ?? 0)
    const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS] || 'UNKNOWN'

    // Optimistic update — reflects immediately in UI
    setMyAction(action)
    setPendingActions(prev => [...prev.filter(p => p.player !== address), { player: address, action, round }])

    try {
      let hash: `0x${string}`

      if (sessionKey.isActive) {
        // SESSION KEY PATH — no MetaMask popup
        hash = await sessionKey.signAction(action)
        addLog({ round, message: `You submitted ${label} ⚡`, type: 'action', txHash: hash })
        showToast(`⚡ ${label} auto-signed!`, 'success')
      } else {
        if (!walletClient) { showToast('Connect wallet first', 'error'); return }
        hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'submitAction',
          args: [action],
          gasPrice: parseGwei('50'),
        })
        addLog({ round, message: `You submitted ${label}`, type: 'action', txHash: hash })
        showToast(`${label} submitted!`, 'success')
      }

      // Attach tx hash to the pending action entry
      setPendingActions(prev =>
        prev.map(p => p.player === address && p.round === round ? { ...p, txHash: hash } : p)
      )
    } catch (e: unknown) {
      // Rollback optimistic update
      setMyAction(Action.NONE)
      setPendingActions(prev => prev.filter(p => p.player !== address))
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(
        msg.includes('Already acted') ? 'Already acted this round'
          : msg.includes('Session key expired') ? 'Session expired — re-authorize to continue'
          : `Action failed: ${msg.slice(0, 60)}`,
        'error'
      )
    }
  }, [walletClient, address, gameState, sessionKey, addLog, showToast])

  const resolveRound = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'resolveRound',
        gasPrice: parseGwei('50'),
      })
      showToast('Resolving round...', 'success')
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Resolve failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, showToast, fetchState])

  const myPlayer = players.find(p => p.addr.toLowerCase() === address?.toLowerCase()) ?? null
  const isInArena = myPlayer?.status === PlayerStatus.ACTIVE
  const hasActed = myAction !== Action.NONE

  return {
    gameState,
    players,
    myPlayer,
    myAction,
    isInArena,
    hasActed,
    pendingActions,
    lastResult,
    log,
    timeRemaining,
    isFlashing,
    toast,
    joinStep,
    lastRoundMs,
    sessionKey,
    joinArena,
    joinAndAuthorize,
    submitAction,
    resolveRound,
  }
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, parseGwei, parseEther } from 'viem'
import { useWalletClient, useAccount } from 'wagmi'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { monadTestnet, POLL_INTERVAL, SHORT_ADDR, ACTION_LABELS } from '@/lib/constants'
import {
  Action, Player, GameState, RoundResult, LogEntry, PendingAction,
  PlayerStatus, JoinStep, GamePhase, FullGameState, PrizeAmounts,
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

  // Prize pool state
  const [prizeAmounts, setPrizeAmounts] = useState<PrizeAmounts | null>(null)
  const [hasClaimed, setHasClaimed] = useState(false)

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
      const fgsTyped: FullGameState = {
        round, deadline, activePlayers, totalPlayers, resolved,
        pool, maxRounds, gamePhase, winners: topWinners,
      }

      setGameState(gs)
      setFullGameState(fgsTyped)
      setPlayers(typedPlayers)
      setTimeRemaining(Number(remaining))

      // Fetch prize amounts when pool is non-zero
      if (pool > 0n) {
        try {
          const pa = await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getPrizeAmounts',
          }) as [bigint, bigint, bigint]
          setPrizeAmounts({ firstPrize: pa[0], secondPrize: pa[1], thirdPrize: pa[2] })
        } catch {
          // non-fatal
        }
      }

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

    const unwatch6 = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      eventName: 'GameEnded',
      pollingInterval: POLL_INTERVAL,
      onLogs: (logs) => {
        logs.forEach((log: unknown) => {
          const typedLog = log as { args: { winners: [`0x${string}`, `0x${string}`, `0x${string}`]; prizePool: bigint } }
          const { prizePool } = typedLog.args
          addLog({
            round: Number(lastRoundRef.current),
            message: `GAME ENDED — Prize pool: ${Number(prizePool) / 1e18} MON`,
            type: 'system',
          })
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
        value: parseEther('0.01'),
        gasPrice: parseGwei('250'),
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
        value: parseEther('0.01'),
        gasPrice: parseGwei('250'),
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
      // Fetch latest state before resetting joinStep — if the join tx confirmed,
      // isInArena will become true and showJoinButton stays false regardless.
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
          gasPrice: parseGwei('250'),
        })
        addLog({ round, message: `You submitted ${label}`, type: 'action', txHash: hash })
        showToast(`${label} submitted!`, 'success')
      }

      // Wait for confirmation to ensure state sync
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()

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
  }, [walletClient, address, gameState, sessionKey, addLog, showToast, fetchState])

  const resolveRound = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'resolveRound',
        gasPrice: parseGwei('250'),
      })
      showToast('Resolving round...', 'success')
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchState()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Resolve failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, showToast, fetchState])

  const claimPrize = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'claimPrize',
        gasPrice: parseGwei('250'),
      })
      showToast('Claiming prize...', 'success')
      await publicClient.waitForTransactionReceipt({ hash })
      setHasClaimed(true)
      showToast('💰 Prize claimed!', 'success')
      addLog({ round: Number(gameState?.round ?? 0), message: '💰 Prize claimed!', type: 'system' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      showToast(`Claim failed: ${msg.slice(0, 60)}`, 'error')
    }
  }, [walletClient, gameState, addLog, showToast])

  const resetGame = useCallback(async (): Promise<void> => {
    if (!walletClient) { showToast('Connect wallet first', 'error'); return }
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'resetGame',
        gasPrice: parseGwei('250'),
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

  const normalizedAddress = address?.toLowerCase()
  const myPlayer = players.find(p => p.addr?.toLowerCase() === normalizedAddress) ?? null
  const isInArena = !!myPlayer && Number(myPlayer.status) === PlayerStatus.ACTIVE
  const hasActed = myAction !== Action.NONE

  // Show the join button only when: not in arena AND not currently in any join flow.
  // Any active joinStep (joining/authorizing/funding/done) hides the button — this
  // prevents it from flashing back during RPC lag after the join tx confirms.
  const showJoinButton = !isInArena && joinStep === 'idle'

  return {
    gameState,
    fullGameState,
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
    showJoinButton,
    lastRoundMs,
    sessionKey,
    prizeAmounts,
    hasClaimed,
    joinArena,
    joinAndAuthorize,
    submitAction,
    resolveRound,
    claimPrize,
    resetGame,
  }
}

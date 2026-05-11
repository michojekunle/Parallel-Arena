'use client'

import { useArena } from '@/hooks/useArena'
import { PlayerAvatar } from './PlayerAvatar'
import { ActionPanel } from './ActionPanel'
import { BattleLog } from './BattleLog'
import { ParallelVisualization } from './ParallelVisualization'
import { SpectatorPanel } from './SpectatorPanel'
import { WalletConnect } from './WalletConnect'
import { EndGameModal } from './EndGameModal'
import { AgentPanel } from './AgentPanel'
import { TourGuide } from './TourGuide'
import { BackgroundMusic } from './BackgroundMusic'
import { ParticleSystem } from './ParticleSystem'
import { AttackEffect } from './AttackEffect'
import { HealEffect } from './HealEffect'
import { DefendEffect } from './DefendEffect'
import { useWallet } from '@/hooks/useWallet'
import { Action, PlayerStatus, GamePhase } from '@/lib/types'
import { formatEther } from 'viem'
import { useState, useMemo, useEffect } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'

export function Arena(): React.ReactElement {
  const {
    gameState,
    fullGameState,
    players,
    myPlayer,
    myAction,
    isInArena,
    isEliminated,
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
    prizeAmounts,
    hasClaimed,
    resolvedTxHashes,
    txStatus,
    txHash,
    attackTarget,
    startVoteCount,
    quorum,
    hasVotedToStart,
    joinAndAuthorize,
    submitAction,
    resolveRound,
    voteToStart,
    claimPrize,
    resetGame,
  } = useArena()

  const { isConnected, address } = useWallet()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isWrongChain = isConnected && chainId !== 10143
  const [showAgents, setShowAgents] = useState(false)
  const [isTourOpen, setIsTourOpen] = useState(false)
  const [dismissedModal, setDismissedModal] = useState(false)
  const [isAttackHovered, setIsAttackHovered] = useState(false)

  // Visual effects triggered by my player's action
  const [activeAttack, setActiveAttack] = useState<{ attacker: string; target: string; damage: number } | null>(null)
  const [activeHeal, setActiveHeal] = useState<{ target: string; amount: number } | null>(null)
  const [activeDefend, setActiveDefend] = useState<{ target: string } | null>(null)

  // Watch my player's action to trigger effects
  useEffect(() => {
    if (!address) return
    if (myAction === Action.ATTACK) {
      setActiveAttack({ attacker: address, target: address, damage: 20 })
      setTimeout(() => setActiveAttack(null), 1600)
    } else if (myAction === Action.HEAL) {
      setActiveHeal({ target: address, amount: 15 })
      setTimeout(() => setActiveHeal(null), 1400)
    } else if (myAction === Action.DEFEND) {
      setActiveDefend({ target: address })
      setTimeout(() => setActiveDefend(null), 1500)
    }
  }, [myAction, address])

  const activePlayers = useMemo(() => players.filter(p => p.status === PlayerStatus.ACTIVE), [players])
  const deadPlayers = useMemo(() => players.filter(p => p.status === PlayerStatus.DEAD), [players])

  const actionMap = useMemo(() => {
    const map = new Map<string, Action>()
    pendingActions.forEach(pa => {
      map.set(pa.player.toLowerCase(), pa.action)
    })
    return map
  }, [pendingActions])

  const isGameEnded = fullGameState?.gamePhase === GamePhase.ENDED
  const isGameWaiting = fullGameState?.gamePhase === GamePhase.WAITING || !gameState
  const prizePool = fullGameState?.pool ?? 0n
  const maxRounds = fullGameState?.maxRounds ?? 5n
  const winners = fullGameState?.winners ?? ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'] as [`0x${string}`, `0x${string}`, `0x${string}`]

  return (
    <div className="min-h-screen flex flex-col bg-black text-white crt-overlay relative overflow-hidden">
      {/* Ambient particle system + background effects */}
      <ParticleSystem />

      {/* Wrong-chain overlay */}
      {isWrongChain && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="border border-[#EE0000]/60 bg-black p-6 text-center max-w-sm w-full mx-4">
            <div className="text-xs font-bold text-[#EE0000] uppercase tracking-widest mb-2">Wrong Network</div>
            <div className="text-[11px] text-[#888] mb-5 font-mono leading-relaxed">
              Parallel Arena runs on Monad Testnet (chain 10143).<br />
              You are connected to chain {chainId}.
            </div>
            <button
              onClick={() => switchChain({ chainId: 10143 })}
              className="w-full py-2.5 text-[11px] font-bold uppercase tracking-widest border-2 border-white text-white hover:bg-white hover:text-black transition-all mb-3"
            >
              Switch to Monad Testnet
            </button>
            <a
              href="https://faucet.monad.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[10px] text-[#555] hover:text-white transition-colors font-mono"
            >
              Need testnet MON? Get it from the faucet ↗
            </a>
          </div>
        </div>
      )}

      {/* Active visual effects */}
      {activeAttack && <AttackEffect attacker={activeAttack.attacker} target={activeAttack.target} isActive damage={activeAttack.damage} />}
      {activeHeal && <HealEffect target={activeHeal.target} isActive amount={activeHeal.amount} />}
      {activeDefend && <DefendEffect target={activeDefend.target} isActive />}

      <div className="scanline" />
      <TourGuide forceOpen={isTourOpen} onClose={() => setIsTourOpen(false)} />

      <EndGameModal
        isOpen={isGameEnded && !dismissedModal}
        onClose={() => setDismissedModal(true)}
        winners={winners}
        players={players}
        prizeAmounts={prizeAmounts}
        myAddress={address}
        onClaim={claimPrize}
        onReset={() => {
          setDismissedModal(false)
          resetGame()
        }}
        hasClaimed={hasClaimed}
      />

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-3 right-3 z-50 px-4 py-2 text-xs font-mono border max-w-xs"
          style={{
            background: '#0a0a0a',
            color: toast.type === 'success' ? '#26D962' : '#EE0000',
            borderColor: toast.type === 'success' ? '#26D96240' : '#EE000040',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Game-ended lobby banner */}
      {isGameEnded && dismissedModal && (
        <div className="bg-[#26D962] text-black text-[10px] font-bold py-2 px-4 flex items-center justify-between sticky top-0 z-[50]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            <span className="tracking-widest uppercase">PROTOCOL_HALTED: SESSION_COMPLETE</span>
          </div>
          <button
            onClick={() => { setDismissedModal(false); resetGame() }}
            className="border border-black/20 font-black px-3 py-1 hover:bg-black hover:text-white transition-all text-[9px] uppercase tracking-tighter"
          >
            INITIALIZE NEW SESSION →
          </button>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between sticky top-0 bg-black z-40 gap-2">
        {/* Left: logo + nav links */}
        <div className="flex items-center gap-2 sm:gap-5 min-w-0 flex-shrink-0">
          <h1
            className="text-sm sm:text-base lg:text-xl font-black tracking-tighter whitespace-nowrap cursor-pointer"
            onClick={() => setIsTourOpen(true)}
          >
            PARALLEL<span className="text-[#555] font-light ml-1 lowercase">arena</span>
          </h1>
          <button
            onClick={() => setIsTourOpen(true)}
            className="hidden sm:block text-[10px] lg:text-xs font-bold border border-white/20 px-3 py-1 hover:bg-white hover:text-black transition-all uppercase tracking-widest"
          >
            HOW TO PLAY
          </button>
          <a
            href="/leaderboard"
            className="hidden sm:block text-[10px] lg:text-xs font-bold border border-[#333] text-[#555] px-3 py-1 hover:border-white hover:text-white transition-all uppercase tracking-widest"
          >
            LEADERBOARD
          </a>
        </div>

        {/* Right: stats + wallet */}
        <div className="flex items-center gap-1.5 sm:gap-3 lg:gap-4 min-w-0">
          {/* Prize pool — hidden on mobile */}
          {prizePool > 0n && (
            <div className="hidden sm:flex items-center gap-1.5 border border-[#FDBA74]/30 px-2 py-1 flex-shrink-0">
              <span className="text-[8px] lg:text-[10px] text-[#555] uppercase tracking-widest">POOL</span>
              <span className="text-[10px] lg:text-sm font-bold font-mono text-[#FDBA74]">
                {formatEther(prizePool)} MON
              </span>
            </div>
          )}

          {/* Agents toggle */}
          {isConnected && (
            <button
              onClick={() => setShowAgents(v => !v)}
              className={`flex items-center gap-1 sm:gap-1.5 border px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors flex-shrink-0 ${
                showAgents
                  ? 'border-[#26D962]/60 text-[#26D962] bg-[#26D962]/5'
                  : 'border-[#333] text-[#555] hover:border-[#555] hover:text-[#888]'
              }`}
            >
              <span>🤖</span>
              <span className="hidden sm:inline">AGENTS</span>
            </button>
          )}

          {/* Game stats — combined on mobile, expanded on sm+ */}
          {gameState && (
            <div className="flex items-center gap-1.5 sm:gap-3 lg:gap-4 flex-shrink-0">
              {/* Mobile: single compact "R1 · 30s" label */}
              <div className="sm:hidden flex items-center gap-1 font-mono text-[10px] font-bold">
                <span className="text-[#555]">R{gameState.round.toString()}</span>
                <span className="text-[#333]">·</span>
                <span style={{ color: timeRemaining <= 10 ? '#EE0000' : '#fff' }}>
                  {timeRemaining}s
                </span>
              </div>

              {/* sm+: individual stat columns */}
              <div className="hidden sm:block text-center">
                <div className="text-[9px] lg:text-[11px] text-[#555] uppercase tracking-widest font-bold">RND</div>
                <div className="text-xs lg:text-base font-bold font-mono">
                  {gameState.round.toString()}<span className="text-[#333]">/{maxRounds.toString()}</span>
                </div>
              </div>
              <div className="hidden sm:block text-center">
                <div className="text-[9px] lg:text-[11px] text-[#555] uppercase tracking-widest font-bold">TIME</div>
                <div
                  className="text-xs lg:text-base font-bold tabular-nums font-mono"
                  style={{ color: timeRemaining <= 10 ? '#EE0000' : '#fff' }}
                >
                  {timeRemaining}s
                </div>
              </div>
              <div className="hidden sm:block text-center">
                <div className="text-[9px] lg:text-[11px] text-[#555] uppercase tracking-widest font-bold">ALIVE</div>
                <div className="text-xs lg:text-base font-bold font-mono">
                  {gameState.activePlayers.toString()}<span className="text-[#333] mx-0.5">/</span>{gameState.totalPlayers.toString()}
                </div>
              </div>
            </div>
          )}

          <BackgroundMusic />
          <WalletConnect />
        </div>
      </header>

      {/* Mobile agents overlay — full screen, only on < md */}
      {showAgents && isConnected && (
        <div className="md:hidden fixed inset-0 z-50 bg-black overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] sticky top-0 bg-black z-10">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">🤖 AI AGENTS</span>
            <button
              onClick={() => setShowAgents(false)}
              className="text-[#555] hover:text-white transition-colors text-lg leading-none px-1"
            >
              ✕
            </button>
          </div>
          <div className="flex-1">
            <AgentPanel myAddress={address} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col md:grid md:grid-cols-[1fr_360px] overflow-hidden">
        {/* Left: Player grid */}
        <div className="border-r border-[#1a1a1a] overflow-y-auto">
          <div className="p-3 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-white font-bold uppercase tracking-[0.2em]">
                ACTIVE PLAYERS
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[9px] lg:text-[11px] font-mono text-[#444]">
                  {activePlayers.length} alive · {deadPlayers.length} out
                </span>
              </div>
            </div>

            {/* WAITING phase lobby — show vote-to-start panel */}
            {isGameWaiting && (
              <div className="mb-6 border border-[#26D962]/20 bg-[#26D962]/5 p-4 lg:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[#26D962] animate-pulse" />
                  <span className="text-[10px] lg:text-xs font-bold text-[#26D962] uppercase tracking-widest">
                    Waiting for Players
                  </span>
                </div>

                {/* Vote progress bar */}
                {quorum > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] lg:text-xs text-[#888] font-mono">
                        {startVoteCount} / {quorum} players ready
                      </span>
                      <span className="text-[10px] lg:text-xs text-[#555] font-mono">
                        {quorum} votes needed to start
                      </span>
                    </div>
                    <div className="h-1.5 lg:h-2 bg-[#1a1a1a] rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-[#26D962] rounded-sm transition-all duration-500"
                        style={{ width: `${Math.min(100, (startVoteCount / Math.max(quorum, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Vote button */}
                {isConnected && isInArena && (
                  <button
                    onClick={voteToStart}
                    disabled={hasVotedToStart}
                    className="w-full py-3 lg:py-4 text-[11px] lg:text-sm font-bold uppercase tracking-widest border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={hasVotedToStart
                      ? { borderColor: '#26D96260', color: '#26D962', background: '#26D96210' }
                      : { borderColor: '#26D962', color: 'black', background: '#26D962' }}
                  >
                    {hasVotedToStart ? '✓ READY TO START — waiting for others' : '🗳 VOTE TO START GAME'}
                  </button>
                )}

                {isConnected && !isInArena && (
                  <div className="text-[10px] lg:text-xs text-[#555] font-mono text-center mt-2">
                    Join the game first, then vote to start
                  </div>
                )}

                {!isConnected && (
                  <div className="text-[10px] lg:text-xs text-[#555] font-mono text-center mt-2">
                    Connect wallet to join and vote
                  </div>
                )}

                {/* Players in lobby */}
                {players.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
                    <div className="text-[9px] lg:text-[11px] text-[#444] uppercase tracking-widest mb-2 font-bold">
                      In lobby ({players.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {players.map(p => (
                        <div
                          key={p.addr}
                          className="text-[9px] lg:text-[10px] font-mono px-2 py-0.5 border border-[#222] text-[#666]"
                          style={{ color: p.addr.toLowerCase() === address?.toLowerCase() ? '#26D962' : undefined }}
                        >
                          {p.addr.toLowerCase() === address?.toLowerCase() ? 'YOU' : p.addr.slice(0, 8) + '…'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activePlayers.length === 0 && !isGameWaiting && (
              <div className="text-center py-12">
                <div className="text-[#333] font-mono text-sm mb-2">Arena is empty</div>
                {isConnected ? (
                  <div className="text-[#3396FF] text-xs">Click "JOIN GAME" to enter (0.01 MON)</div>
                ) : (
                  <div className="text-[#555] text-xs">Connect wallet to join</div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 lg:gap-3">
              {activePlayers.map(player => {
                // Show attack target ring when player hovers ATTACK button
                const isPreviewTarget = isAttackHovered
                  && attackTarget?.toLowerCase() === player.addr.toLowerCase()
                const isWeakest = !isAttackHovered
                  && player.addr.toLowerCase() === attackTarget?.toLowerCase()
                return (
                  <PlayerAvatar
                    key={player.addr}
                    player={player}
                    currentAction={actionMap.get(player.addr.toLowerCase())}
                    isMe={myPlayer?.addr.toLowerCase() === player.addr.toLowerCase()}
                    isTarget={isPreviewTarget || isWeakest}
                  />
                )
              })}
            </div>

            {deadPlayers.length > 0 && (
              <>
                <div className="text-[9px] text-[#333] uppercase tracking-widest mt-5 mb-2 flex items-center gap-2">
                  <span>Eliminated</span>
                  <div className="flex-1 h-px bg-[#1a1a1a]" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 opacity-60">
                  {deadPlayers.map(player => (
                    <PlayerAvatar key={player.addr} player={player} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Agent panel or Parallel visualization */}
        <div className="hidden md:flex flex-col overflow-hidden">
          {showAgents && isConnected ? (
            <div className="overflow-y-auto flex-1">
              <AgentPanel myAddress={address} />
            </div>
          ) : (
            <ParallelVisualization
              pendingActions={pendingActions}
              lastResult={lastResult}
              currentRound={Number(gameState?.round ?? 0)}
              isFlashing={isFlashing}
              lastRoundMs={lastRoundMs}
              resolvedTxHashes={resolvedTxHashes}
            />
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#1a1a1a] flex-shrink-0">
        {isConnected ? (
          <ActionPanel
            myPlayer={myPlayer}
            isInArena={isInArena}
            isEliminated={isEliminated ?? false}
            showJoinButton={showJoinButton}
            hasActed={hasActed}
            myAction={myAction}
            roundResolved={gameState?.resolved ?? false}
            timeRemaining={timeRemaining}
            gamePhase={fullGameState?.gamePhase}
            joinStep={joinStep}
            txStatus={txStatus}
            txHash={txHash}
            onJoinAndAuthorize={joinAndAuthorize}
            onAction={submitAction}
            onResolve={resolveRound}
            onAttackHoverChange={setIsAttackHovered}
          />
        ) : (
          <SpectatorPanel
            activePlayers={Number(gameState?.activePlayers ?? 0)}
            totalPlayers={Number(gameState?.totalPlayers ?? 0)}
            currentRound={Number(gameState?.round ?? 0)}
            lastResult={lastResult}
            timeRemaining={timeRemaining}
          />
        )}
        <BattleLog entries={log} />
      </div>
    </div>
  )
}

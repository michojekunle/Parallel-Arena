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
import { Guide } from './Guide'
import { useWallet } from '@/hooks/useWallet'
import { Action, PlayerStatus, GamePhase } from '@/lib/types'
import { formatEther } from 'viem'
import { useState, useMemo } from 'react'

export function Arena(): React.ReactElement {
  const {
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
    prizeAmounts,
    hasClaimed,
    joinAndAuthorize,
    submitAction,
    resolveRound,
    claimPrize,
    resetGame,
  } = useArena()

  const { isConnected, address } = useWallet()
  const [showAgents, setShowAgents] = useState(false)
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [dismissedModal, setDismissedModal] = useState(false)

  const activePlayers = useMemo(() => players.filter(p => p.status === PlayerStatus.ACTIVE), [players])
  const deadPlayers = useMemo(() => players.filter(p => p.status === PlayerStatus.DEAD), [players])

  const weakestPlayerAddr = useMemo(() => {
    if (activePlayers.length <= 1) return null
    return [...activePlayers].sort((a, b) => Number(a.health) - Number(b.health))[0]?.addr
  }, [activePlayers])

  const actionMap = useMemo(() => {
    const map = new Map<string, Action>()
    pendingActions.forEach(pa => {
      map.set(pa.player.toLowerCase(), pa.action)
    })
    return map
  }, [pendingActions])

  const isGameEnded = fullGameState?.gamePhase === GamePhase.ENDED
  const prizePool = fullGameState?.pool ?? 0n
  const maxRounds = fullGameState?.maxRounds ?? 5n
  const winners = fullGameState?.winners ?? ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'] as [`0x${string}`, `0x${string}`, `0x${string}`]

  return (
    <div className="min-h-screen flex flex-col bg-black text-white crt-overlay relative overflow-hidden">
      <div className="scanline" />
      <Guide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      {/* End Game Modal */}
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

      {/* Lobby Banner for dismissed modal */}
      {isGameEnded && dismissedModal && (
        <div className="bg-[#26D962] text-black text-[10px] font-bold py-2 px-4 flex items-center justify-between sticky top-0 z-[50]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            <span className="tracking-widest uppercase">PROTOCOL_HALTED: SESSION_COMPLETE</span>
          </div>
          <button 
            onClick={() => {
              setDismissedModal(false)
              resetGame()
            }}
            className="border border-black/20 font-black px-3 py-1 hover:bg-black hover:text-white transition-all text-[9px] uppercase tracking-tighter"
          >
            INITIALIZE NEW SESSION →
          </button>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 bg-black z-40">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <h1 className="text-sm font-bold tracking-tighter whitespace-nowrap cursor-pointer" onClick={() => setIsGuideOpen(true)}>
            PARALLEL<span className="text-[#555] font-light ml-1 lowercase">arena</span>
          </h1>
          <button 
            onClick={() => setIsGuideOpen(true)}
            className="hidden sm:block text-[9px] font-bold border border-white/20 px-2 py-0.5 hover:bg-white hover:text-black transition-all uppercase tracking-widest"
          >
            HOW TO PLAY
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Prize pool badge */}
          {prizePool > 0n && (
            <div className="hidden sm:flex items-center gap-1.5 border border-[#FDBA74]/30 px-2 py-1">
              <span className="text-[8px] text-[#555] uppercase tracking-widest">POOL</span>
              <span className="text-[10px] font-bold font-mono text-[#FDBA74]">
                {formatEther(prizePool)} MON
              </span>
            </div>
          )}

          {/* Agent panel toggle */}
          {isConnected && (
            <button
              onClick={() => setShowAgents(v => !v)}
              className={`hidden sm:flex items-center gap-1.5 border px-2 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                showAgents
                  ? 'border-[#26D962]/60 text-[#26D962] bg-[#26D962]/5'
                  : 'border-[#333] text-[#555] hover:border-[#555] hover:text-[#888]'
              }`}
            >
              <span>🤖</span>
              <span>AGENTS</span>
            </button>
          )}

          {gameState && (
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-center">
                <div className="text-[9px] text-[#555] uppercase tracking-widest">RND</div>
                <div className="text-xs font-bold font-mono">
                  {gameState.round.toString()}<span className="text-[#333]">/{maxRounds.toString()}</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-[#555] uppercase tracking-widest">TIME</div>
                <div
                  className="text-xs font-bold tabular-nums font-mono"
                  style={{ color: timeRemaining <= 10 ? '#EE0000' : '#fff' }}
                >
                  {timeRemaining}s
                </div>
              </div>
              <div className="hidden sm:block text-center">
                <div className="text-[9px] text-[#555] uppercase tracking-widest">ALIVE</div>
                <div className="text-xs font-bold font-mono">
                  {gameState.activePlayers.toString()}<span className="text-[#333] mx-0.5">/</span>{gameState.totalPlayers.toString()}
                </div>
              </div>
            </div>
          )}
          <WalletConnect />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:grid md:grid-cols-[1fr_360px] overflow-hidden">
        {/* Left: Player grid */}
        <div className="border-r border-[#1a1a1a] overflow-y-auto">
          <div className="p-3 sm:p-5">
            {/* Active players */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-white font-bold uppercase tracking-[0.2em]">
                ACTIVE PLAYERS
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-mono text-[#444]">
                  {activePlayers.length} alive · {deadPlayers.length} out
                </span>
              </div>
            </div>

            {activePlayers.length === 0 && (
              <div className="text-center py-12">
                <div className="text-[#333] font-mono text-sm mb-2">Arena is empty</div>
                {isConnected ? (
                  <div className="text-[#3396FF] text-xs">Click "JOIN + AUTHORIZE" to enter (0.01 MON)</div>
                ) : (
                  <div className="text-[#555] text-xs">Connect wallet to join</div>
                )}
              </div>
            )}

            {/* Active players grid — responsive columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {activePlayers.map(player => (
                <PlayerAvatar
                  key={player.addr}
                  player={player}
                  currentAction={actionMap.get(player.addr.toLowerCase())}
                  isMe={myPlayer?.addr.toLowerCase() === player.addr.toLowerCase()}
                  isTarget={player.addr.toLowerCase() === weakestPlayerAddr?.toLowerCase()}
                />
              ))}
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

        {/* Right: Agent panel (overlay) or Parallel visualization */}
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
            />
          )}
        </div>
      </div>

      {/* Bottom bar: action panel or spectator panel + battle log */}
      <div className="border-t border-[#1a1a1a] flex-shrink-0">
        {isConnected ? (
          <ActionPanel
            myPlayer={myPlayer}
            isInArena={isInArena}
            showJoinButton={showJoinButton}
            hasActed={hasActed}
            myAction={myAction}
            roundResolved={gameState?.resolved ?? false}
            timeRemaining={timeRemaining}
            joinStep={joinStep}
            onJoinAndAuthorize={joinAndAuthorize}
            onAction={submitAction}
            onResolve={resolveRound}
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

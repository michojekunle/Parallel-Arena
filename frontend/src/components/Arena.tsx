'use client'

import { useArena } from '@/hooks/useArena'
import { PlayerAvatar } from './PlayerAvatar'
import { ActionPanel } from './ActionPanel'
import { BattleLog } from './BattleLog'
import { ParallelVisualization } from './ParallelVisualization'
import { SpectatorPanel } from './SpectatorPanel'
import { WalletConnect } from './WalletConnect'
import { EndGameModal } from './EndGameModal'
import { useWallet } from '@/hooks/useWallet'
import { Action, PlayerStatus, GamePhase } from '@/lib/types'
import { formatEther } from 'viem'

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
    lastRoundMs,
    sessionKey,
    prizeAmounts,
    hasClaimed,
    joinAndAuthorize,
    submitAction,
    resolveRound,
    claimPrize,
    resetGame,
  } = useArena()

  const { isConnected, address } = useWallet()

  const activePlayers = players.filter(p => p.status === PlayerStatus.ACTIVE)
  const deadPlayers = players.filter(p => p.status === PlayerStatus.DEAD)

  const actionMap = new Map<string, Action>()
  pendingActions.forEach(pa => {
    actionMap.set(pa.player.toLowerCase(), pa.action)
  })

  const handleAuthorizeSession = async (): Promise<void> => {
    try {
      await sessionKey.authorize()
    } catch {
      // errors handled inside useSessionKey/useArena
    }
  }

  const isGameEnded = fullGameState?.gamePhase === GamePhase.ENDED
  const prizePool = fullGameState?.pool ?? 0n
  const maxRounds = fullGameState?.maxRounds ?? 5n
  const winners = fullGameState?.winners ?? ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'] as [`0x${string}`, `0x${string}`, `0x${string}`]

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* End Game Modal */}
      <EndGameModal
        isOpen={isGameEnded}
        winners={winners}
        players={players}
        prizeAmounts={prizeAmounts}
        myAddress={address}
        onClaim={claimPrize}
        onReset={resetGame}
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

      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 bg-black z-40">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <h1 className="text-sm font-bold tracking-tighter whitespace-nowrap">
            PARALLEL<span className="text-[#555] font-light ml-1">ARENA</span>
          </h1>
          <div className="hidden sm:block h-4 w-px bg-[#1a1a1a]" />
          <span className="hidden sm:block text-[9px] text-[#555] uppercase tracking-widest truncate">
            Monad Parallel Execution
          </span>
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

          {/* Session key indicator */}
          {sessionKey.isActive && (
            <div className="hidden sm:flex items-center gap-1.5 border border-[#26D962]/30 px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#26D962] animate-pulse" />
              <span className="text-[9px] font-bold text-[#26D962] uppercase tracking-widest">AUTO-SIGN</span>
            </div>
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
                {prizePool > 0n && (
                  <span className="sm:hidden text-[9px] font-mono text-[#FDBA74]">
                    POOL: {formatEther(prizePool)} MON
                  </span>
                )}
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

        {/* Right: Parallel visualization — desktop only */}
        <div className="hidden md:flex flex-col overflow-hidden">
          <ParallelVisualization
            pendingActions={pendingActions}
            lastResult={lastResult}
            currentRound={Number(gameState?.round ?? 0)}
            isFlashing={isFlashing}
            lastRoundMs={lastRoundMs}
          />
        </div>
      </div>

      {/* Bottom bar: action panel or spectator panel + battle log */}
      <div className="border-t border-[#1a1a1a] flex-shrink-0">
        {isConnected ? (
          <ActionPanel
            isInArena={isInArena}
            hasActed={hasActed}
            myAction={myAction}
            roundResolved={gameState?.resolved ?? false}
            timeRemaining={timeRemaining}
            joinStep={joinStep}
            sessionKey={sessionKey}
            onJoinAndAuthorize={joinAndAuthorize}
            onAction={submitAction}
            onResolve={resolveRound}
            onAuthorizeSession={handleAuthorizeSession}
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

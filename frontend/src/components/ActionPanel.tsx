'use client'

import { useState } from 'react'
import { Action, JoinStep, Player, PlayerStatus, GamePhase } from '@/lib/types'
import { TxStatus } from '@/hooks/useArena'

interface ActionPanelProps {
  myPlayer: Player | null
  isInArena: boolean
  isEliminated: boolean
  showJoinButton: boolean
  hasActed: boolean
  myAction: Action
  roundResolved: boolean
  timeRemaining: number
  gamePhase: GamePhase | undefined
  joinStep: JoinStep
  txStatus: TxStatus
  txHash: `0x${string}` | null
  onJoinAndAuthorize: () => void
  onAction: (action: Action) => void
  onResolve: () => void
  onAttackHoverChange: (hovered: boolean) => void
}

const ACTION_CONFIG = [
  { action: Action.ATTACK, label: '⚔ ATTACK', color: '#EE0000' },
  { action: Action.DEFEND, label: '🛡 DEFEND', color: '#3396FF' },
  { action: Action.HEAL,   label: '💚 HEAL',   color: '#26D962' },
] as const

const JOIN_STEPS: Record<JoinStep, string> = {
  idle:    '',
  joining: 'Joining arena (1 confirmation)...',
  done:    'Ready!',
}

const TX_STATUS_DISPLAY: Record<TxStatus, { label: string; color: string } | null> = {
  idle:       null,
  submitting: { label: '⟳ Submitting...', color: '#FDBA74' },
  pending:    { label: '⏳ Pending on-chain', color: '#3396FF' },
  confirmed:  { label: '✓ Confirmed', color: '#26D962' },
  failed:     { label: '✗ Failed', color: '#EE0000' },
}

export function ActionPanel({
  myPlayer,
  isInArena,
  isEliminated,
  showJoinButton,
  hasActed,
  myAction,
  roundResolved,
  timeRemaining,
  gamePhase,
  joinStep,
  txStatus,
  txHash,
  onJoinAndAuthorize,
  onAction,
  onResolve,
  onAttackHoverChange,
}: ActionPanelProps): React.ReactElement {
  const [isAttackHovered, setIsAttackHovered] = useState(false)

  const handleAttackHover = (hovered: boolean) => {
    setIsAttackHovered(hovered)
    onAttackHoverChange(hovered)
  }

  const isDead = myPlayer?.status === PlayerStatus.DEAD
  // Fallback: If phase is undefined (RPC failure), allow acting anyway to avoid hard-locking users
  const isPhaseActive = gamePhase === GamePhase.ACTIVE || gamePhase === undefined
  const canAct = isInArena && !hasActed && !roundResolved && isPhaseActive && gamePhase !== GamePhase.ENDED
  const canResolve = timeRemaining === 0 && !roundResolved
  const isJoining = joinStep === 'joining'
  const urgentTimer = timeRemaining <= 5 && timeRemaining > 0 && isInArena && !hasActed

  const txInfo = TX_STATUS_DISPLAY[txStatus]

  const getButtonStyle = (action: Action, color: string) => {
    const isSelected = myAction === action
    const isAttackPreview = action === Action.ATTACK && isAttackHovered && canAct
    if (!canAct && !isSelected) {
      return { borderColor: '#1a1a1a', color: '#333', background: 'transparent' }
    }
    if (isAttackPreview) {
      return { borderColor: '#EE0000', color: 'black', background: '#EE0000' }
    }
    return {
      borderColor: isSelected ? 'white' : color,
      color: isSelected ? 'black' : color,
      background: isSelected ? 'white' : 'transparent',
    }
  }

  return (
    <div className="border-b border-[#1a1a1a] bg-black">
      {/* Tx status bar */}
      {txInfo && (
        <div
          className="px-4 py-1.5 text-[10px] font-mono flex items-center justify-between border-b border-[#1a1a1a]"
          style={{ color: txInfo.color }}
        >
          <span>{txInfo.label}</span>
          {txHash && txStatus === 'pending' && (
            <a
              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] hover:underline opacity-70"
            >
              {txHash.slice(0, 10)}…
            </a>
          )}
        </div>
      )}

      {/* Eliminated → Spectator banner */}
      {isDead && (
        <div className="px-4 py-2 bg-[#EE0000]/10 border-b border-[#EE0000]/20 flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#EE0000] uppercase tracking-widest">
            ☠ SPECTATING — you were eliminated
          </span>
          <button
            className="text-[10px] font-bold text-white border border-white/40 px-3 py-1 hover:bg-white hover:text-black transition-all"
            onClick={onJoinAndAuthorize}
          >
            RE-INITIALIZE (0.01 MON)
          </button>
        </div>
      )}

      <div className="px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-white font-bold uppercase tracking-[0.2em]">
            {isEliminated ? 'SPECTATING' : isInArena ? 'CHOOSE ACTION' : 'JOIN ARENA'}
          </span>
          <div className="flex items-center gap-3">
            {/* Urgent timer */}
            <span
              className={`text-[10px] font-mono font-bold transition-colors ${urgentTimer ? 'text-red-500 animate-pulse' : 'text-[#444]'}`}
            >
              {isInArena && !roundResolved && timeRemaining > 0 ? `${timeRemaining}s` : ''}
            </span>
            {timeRemaining === 0 && isInArena && !roundResolved && (
              <span className="text-[10px] font-bold text-[#EE0000] animate-pulse">
                ROUND READY TO RESOLVE
              </span>
            )}
            {isJoining && (
              <span className="text-[10px] text-[#3396FF] animate-pulse">
                {JOIN_STEPS[joinStep]}
              </span>
            )}
          </div>
        </div>

        {/* Spectator-only: hide action buttons */}
        {!isEliminated && (
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            {showJoinButton ? (
              <div className="flex-1 flex flex-col gap-1">
                <button
                  className="flex-1 min-w-[140px] py-3 px-4 text-[11px] font-bold uppercase tracking-[0.15em] border-2 border-white text-white hover:bg-white hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onJoinAndAuthorize}
                  disabled={isJoining}
                >
                  {isJoining ? JOIN_STEPS[joinStep] : '⚡ JOIN GAME (0.01 MON)'}
                </button>
                {!isJoining && (
                  <span className="text-[9px] text-[#555] font-mono">
                    1 confirmation to join — all actions use gasless signatures
                  </span>
                )}
              </div>
            ) : (
              <>
                {ACTION_CONFIG.map(({ action, label, color }) => (
                  <button
                    key={action}
                    className="flex-1 min-w-[80px] py-3 px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.1em] border-2 transition-all disabled:cursor-not-allowed"
                    style={getButtonStyle(action, color)}
                    onClick={() => onAction(action)}
                    disabled={!canAct}
                    onMouseEnter={() => action === Action.ATTACK && handleAttackHover(true)}
                    onMouseLeave={() => action === Action.ATTACK && handleAttackHover(false)}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}

            {canResolve && (
              <button
                className="py-3 px-4 text-[10px] font-bold uppercase tracking-[0.15em] border-2 border-white text-white hover:bg-white hover:text-black transition-all"
                onClick={onResolve}
              >
                🔨 RESOLVE
              </button>
            )}
          </div>
        )}

        {hasActed && (
          <div className="mt-2 text-[10px] font-mono text-[#26D962]">
            ⚡ Signed — Action locked in. Waiting for round to resolve...
          </div>
        )}
        {roundResolved && (
          <div className="mt-2 text-[10px] font-mono text-[#555]">
            Round resolved — next round starting...
          </div>
        )}
      </div>
    </div>
  )
}

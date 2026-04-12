'use client'

import { Action, JoinStep, Player, PlayerStatus } from '@/lib/types'

interface ActionPanelProps {
  myPlayer: Player | null
  isInArena: boolean
  showJoinButton: boolean
  hasActed: boolean
  myAction: Action
  roundResolved: boolean
  timeRemaining: number
  joinStep: JoinStep
  onJoinAndAuthorize: () => void
  onAction: (action: Action) => void
  onResolve: () => void
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

export function ActionPanel({
  myPlayer,
  isInArena,
  showJoinButton,
  hasActed,
  myAction,
  roundResolved,
  timeRemaining,
  joinStep,
  onJoinAndAuthorize,
  onAction,
  onResolve,
}: ActionPanelProps): React.ReactElement {
  const isDead = myPlayer?.status === PlayerStatus.DEAD
  const canAct = isInArena && !hasActed && !roundResolved
  const canResolve = timeRemaining === 0 && !roundResolved
  const isJoining = joinStep === 'joining'

  const getButtonStyle = (action: Action, color: string) => {
    const isSelected = myAction === action
    if (!canAct && !isSelected) {
      return { borderColor: '#1a1a1a', color: '#333', background: 'transparent' }
    }
    return {
      borderColor: isSelected ? 'white' : color,
      color: isSelected ? 'black' : color,
      background: isSelected ? 'white' : 'transparent',
    }
  }

  return (
    <div className="border-b border-[#1a1a1a] bg-black">
      {/* Eliminated Overlay */}
      {isDead && (
        <div className="px-4 py-2 bg-[#EE0000]/10 border-b border-[#EE0000]/20 flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#EE0000] uppercase tracking-widest">
            ✕ NODE_TERMINATED: You were eliminated
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
            {isInArena ? 'CHOOSE ACTION' : 'JOIN ARENA'}
          </span>
          <div className="flex items-center gap-3">
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

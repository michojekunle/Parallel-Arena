'use client'

import { Action, JoinStep, SessionKeyState } from '@/lib/types'

interface ActionPanelProps {
  isInArena: boolean
  hasActed: boolean
  myAction: Action
  roundResolved: boolean
  timeRemaining: number
  joinStep: JoinStep
  sessionKey: SessionKeyState
  onJoinAndAuthorize: () => void
  onAction: (action: Action) => void
  onResolve: () => void
  onAuthorizeSession: () => void
}

const ACTION_CONFIG = [
  { action: Action.ATTACK, label: '⚔ ATTACK', color: '#EE0000' },
  { action: Action.DEFEND, label: '🛡 DEFEND', color: '#3396FF' },
  { action: Action.HEAL,   label: '💚 HEAL',   color: '#26D962' },
] as const

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const JOIN_STEPS: Record<JoinStep, string> = {
  idle:        '',
  joining:     '1/3 Joining arena...',
  authorizing: '2/3 Authorizing session key...',
  funding:     '3/3 Funding session key...',
  done:        'Ready!',
}

export function ActionPanel({
  isInArena,
  hasActed,
  myAction,
  roundResolved,
  timeRemaining,
  joinStep,
  sessionKey,
  onJoinAndAuthorize,
  onAction,
  onResolve,
  onAuthorizeSession,
}: ActionPanelProps): React.ReactElement {
  const canAct = isInArena && !hasActed && !roundResolved
  const canResolve = timeRemaining === 0 && !roundResolved
  const isJoining = joinStep !== 'idle' && joinStep !== 'done'

  return (
    <div className="border-b border-[#1a1a1a] bg-black">
      {/* Session key status bar */}
      {isInArena && (
        <div className={`px-4 py-2 flex items-center justify-between text-[10px] font-mono border-b ${
          sessionKey.isActive
            ? 'border-[#26D962]/20 bg-[#26D962]/5'
            : 'border-[#FDBA74]/20 bg-[#FDBA74]/5'
        }`}>
          {sessionKey.isActive ? (
            <>
              <span className="text-[#26D962] flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#26D962] animate-pulse" />
                AUTO-SIGNING ACTIVE — no popups
              </span>
              <span className="text-[#26D962]/60">
                expires {formatTime(sessionKey.secondsRemaining)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[#FDBA74]">
                ⚠ Each action requires a wallet popup
              </span>
              <button
                className="text-[#FDBA74] border border-[#FDBA74]/40 px-2 py-0.5 hover:bg-[#FDBA74]/10 transition-colors"
                onClick={onAuthorizeSession}
              >
                ACTIVATE SESSION KEY
              </button>
            </>
          )}
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
          {!isInArena ? (
            <button
              className="flex-1 min-w-[140px] py-3 px-4 text-[11px] font-bold uppercase tracking-[0.15em] border-2 border-white text-white hover:bg-white hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onJoinAndAuthorize}
              disabled={isJoining}
            >
              {isJoining ? JOIN_STEPS[joinStep] : '⚡ INITIALIZE + AUTHORIZE'}
            </button>
          ) : (
            <>
              {ACTION_CONFIG.map(({ action, label, color }) => (
                <button
                  key={action}
                  className="flex-1 min-w-[80px] py-3 px-2 sm:px-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.1em] border-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    borderColor: color,
                    color: myAction === action ? 'black' : color,
                    background: myAction === action ? color : 'transparent',
                  }}
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
            {sessionKey.isActive ? '⚡ Auto-signed — ' : '✓ '}
            Action locked in. Waiting for round to resolve...
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

'use client'

import { Player, PlayerStatus, Action } from '@/lib/types'
import { SHORT_ADDR, ACTION_LABELS, ACTION_COLORS } from '@/lib/constants'

interface PlayerCardProps {
  player: Player
  currentAction?: Action
  isMe?: boolean
  isTarget?: boolean
}

function HealthBar({ health }: { health: number }): React.ReactElement {
  const pct = Math.min(100, Math.max(0, health))
  const colorClass = pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''
  return (
    <div className="w-full bg-[#111111] h-[2px] overflow-hidden">
      <div
        className={`health-segment ${colorClass}`}
        style={{ width: `${pct}%`, background: pct <= 25 ? '#EE0000' : '#FFFFFF' }}
      />
    </div>
  )
}

export function PlayerCard({ player, currentAction, isMe, isTarget }: PlayerCardProps): React.ReactElement {
  const isDead = player.status === PlayerStatus.DEAD
  const hasActed = currentAction !== undefined && currentAction !== Action.NONE
  const health = Number(player.health)

  let cardClass = 'player-card border border-[#333333] p-4 relative overflow-hidden transition-all duration-200'
  if (isDead) cardClass += ' dead'
  else if (isTarget) cardClass += ' border-[#EE0000] bg-[#EE0000]/5'
  else if (hasActed) cardClass += ' acted'
  else if (isMe) cardClass += ' active'

  return (
    <div className={cardClass}>
      {isTarget && !isDead && (
        <div className="absolute top-0 left-0 bg-[#EE0000] text-white text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-tighter z-10">TARGET</div>
      )}
      {isMe && (
        <div className="absolute top-0 right-0 bg-white text-black text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-tighter">ME</div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#FFFFFF]">
          {SHORT_ADDR(player.addr)}
        </span>
        <span className="text-[10px] font-black tracking-tighter text-[#444444]">
          KILLS_{player.kills.toString().padStart(2, '0')}
        </span>
      </div>

      <HealthBar health={health} />

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] font-medium text-[#9EA9A9]">
          HP: <span className="text-[#FFFFFF]">{health}</span>
        </span>
        <span className="text-[10px] font-medium text-[#9EA9A9]">
          ATK:<span className="text-[#FDBA74] mr-1.5">{player.attack.toString()}</span>
          DEF:<span className="text-[#3396FF]">{player.defense.toString()}</span>
        </span>
      </div>

      {hasActed && currentAction !== undefined && (
        <div
          className="mt-2 text-xs font-display text-center py-1 rounded"
          style={{
            color: ACTION_COLORS[currentAction] || '#E8F0FE',
            background: `${ACTION_COLORS[currentAction]}22` || 'transparent',
          }}
        >
          {ACTION_LABELS[currentAction as keyof typeof ACTION_LABELS]}
        </div>
      )}

      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <span className="text-white border border-white px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest">OFFLINE</span>
        </div>
      )}
    </div>
  )
}

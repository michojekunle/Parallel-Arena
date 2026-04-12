'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Player, PlayerStatus, Action } from '@/lib/types'
import { SHORT_ADDR, ACTION_COLORS } from '@/lib/constants'
import { useEffect, useState } from 'react'

interface PlayerAvatarProps {
  player: Player
  currentAction?: Action
  isMe?: boolean
  isUnderAttack?: boolean   // flashed red when attacked this round
  isTarget?: boolean        // highlighted when lowest HP in arena
}

// Deterministic avatar glyph based on address
const AVATARS = ['⚔', '🗡', '🔱', '⚡', '💀', '🦂', '🐉', '🌑', '⭐', '🔥']
function getAvatar(addr: string): string {
  const idx = parseInt(addr.slice(2, 4), 16) % AVATARS.length
  return AVATARS[idx]
}

// Deterministic color from address
const COLORS = ['#EE0000', '#3396FF', '#26D962', '#FDBA74', '#c084fc', '#f472b6', '#38bdf8', '#a3e635']
function getColor(addr: string): string {
  const idx = parseInt(addr.slice(4, 6), 16) % COLORS.length
  return COLORS[idx]
}

function SegmentedHealthBar({ health, maxHealth = 100 }: { health: number; maxHealth?: number }): React.ReactElement {
  const segments = 10
  const filled = Math.ceil((health / maxHealth) * segments)
  const color = health <= 25 ? '#EE0000' : health <= 50 ? '#FDBA74' : '#26D962'

  return (
    <div className="flex gap-0.5 w-full">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-1.5 rounded-sm transition-all duration-300"
          style={{ background: i < filled ? color : '#1a1a1a' }}
        />
      ))}
    </div>
  )
}

export function PlayerAvatar({ player, currentAction, isMe, isUnderAttack, isTarget }: PlayerAvatarProps): React.ReactElement {
  const isDead = player.status === PlayerStatus.DEAD
  const hasActed = currentAction !== undefined && currentAction !== Action.NONE
  const health = Number(player.health)
  const addr = player.addr
  const avatarGlyph = getAvatar(addr)
  const playerColor = getColor(addr)

  const [showEffect, setShowEffect] = useState<'attack' | 'defend' | 'heal' | null>(null)

  useEffect(() => {
    if (currentAction === undefined || currentAction === Action.NONE) { setShowEffect(null); return }
    if (currentAction === Action.ATTACK) setShowEffect('attack')
    else if (currentAction === Action.DEFEND) setShowEffect('defend')
    else if (currentAction === Action.HEAL) setShowEffect('heal')
  }, [currentAction])

  useEffect(() => {
    if (isUnderAttack) {
      setShowEffect('attack')
      const t = setTimeout(() => setShowEffect(null), 600)
      return () => clearTimeout(t)
    }
  }, [isUnderAttack])

  const borderColor = isDead
    ? '#1a1a1a'
    : isTarget
      ? '#EE0000'
      : hasActed
        ? ACTION_COLORS[currentAction as Action] || '#333'
        : isMe
          ? playerColor
          : '#222'

  const isCritical = health > 0 && health < 30

  // Shudder on attack or taking damage
  const isImpacted = showEffect === 'attack' || isUnderAttack

  return (
    <motion.div
      className="relative rounded overflow-hidden select-none"
      style={{ 
        background: isTarget ? 'rgba(238,0,0,0.05)' : '#0a0a0a', 
        border: `1px solid ${borderColor}`,
        boxShadow: isTarget ? '0 0 10px rgba(238,0,0,0.2)' : 'none'
      }}
      animate={{
        x: isImpacted ? [-8, 8, -6, 6, -4, 4, 0] : 0,
        backgroundColor: isCritical ? ['#0a0a0a', '#300000', '#0a0a0a'] : (isTarget ? 'rgba(238,0,0,0.05)' : '#0a0a0a'),
        opacity: isDead ? 0.4 : 1
      }}
      transition={{ 
        duration: isImpacted ? 0.3 : 2, 
        repeat: isCritical && !isImpacted ? Infinity : 0,
        ease: 'easeInOut' 
      }}
    >
      {/* Target Badge */}
      {isTarget && !isDead && (
        <div className="absolute top-0 left-0 bg-[#EE0000] text-white text-[7px] font-bold px-1 py-0.5 uppercase tracking-tighter z-10">TARGET</div>
      )}
      
      {/* Background flash effects */}
      <AnimatePresence>
        {showEffect === 'attack' && (
          <motion.div
            key="attack-flash"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 z-10 pointer-events-none"
            style={{ background: 'rgba(238,0,0,0.4)' }}
          />
        )}
        {showEffect === 'defend' && (
          <motion.div
            key="defend-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, repeat: 2 }}
            className="absolute inset-0 z-10 pointer-events-none"
            style={{ background: 'rgba(51,150,255,0.3)' }}
          />
        )}
        {showEffect === 'heal' && (
          <>
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={`heal-particle-${i}`}
                initial={{ y: 0, x: (i - 1.5) * 8, opacity: 0.8, scale: 1 }}
                animate={{ y: -20, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                className="absolute bottom-4 left-1/2 w-1 h-1 rounded-full pointer-events-none z-10"
                style={{ background: '#26D962' }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Dead overlay */}
      {isDead && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <span className="text-[10px] font-bold text-[#EE0000] uppercase tracking-widest">DEAD</span>
        </div>
      )}

      <div className={`p-2 ${isDead ? 'opacity-30' : ''}`}>
        {/* Avatar glyph */}
        <div className="flex items-center justify-between mb-1.5">
          <motion.div
            className="text-lg"
            animate={showEffect === 'attack' ? { scale: [1, 1.3, 1], rotate: [-5, 5, 0] } : {}}
            transition={{ duration: 0.3 }}
          >
            {avatarGlyph}
          </motion.div>
          <div className="flex items-center gap-1">
            {isMe && (
              <span className="text-[8px] font-bold uppercase tracking-widest px-1 py-0.5"
                style={{ color: playerColor, border: `1px solid ${playerColor}40` }}>
                YOU
              </span>
            )}
            <span className="text-[9px] text-[#444]">☠{player.kills.toString()}</span>
          </div>
        </div>

        {/* Address */}
        <div className="text-[9px] font-mono text-[#555] mb-1.5 truncate">
          {SHORT_ADDR(addr)}
        </div>

        {/* Health bar */}
        <SegmentedHealthBar health={health} />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] font-mono" style={{ color: health <= 25 ? '#EE0000' : '#555' }}>
            {health}HP
          </span>
          <span className="text-[9px] font-mono text-[#333]">
            <span style={{ color: '#EE0000' }}>{player.attack.toString()}</span>
            <span className="text-[#222] mx-0.5">/</span>
            <span style={{ color: '#3396FF' }}>{player.defense.toString()}</span>
          </span>
        </div>

        {/* Current action badge */}
        {hasActed && currentAction !== undefined && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-1.5 text-center text-[8px] font-bold uppercase tracking-wider py-0.5"
            style={{
              color: ACTION_COLORS[currentAction] || '#fff',
              background: `${ACTION_COLORS[currentAction] || '#fff'}15`,
              border: `1px solid ${ACTION_COLORS[currentAction] || '#fff'}30`,
            }}
          >
            {currentAction === Action.ATTACK ? '⚔ ATTACK'
              : currentAction === Action.DEFEND ? '🛡 DEFEND'
              : '💚 HEAL'}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

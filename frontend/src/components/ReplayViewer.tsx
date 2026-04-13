'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Player } from '@/lib/types'
import { ReplayFrame } from '@/lib/types'
import { SHORT_ADDR } from '@/lib/constants'

interface ReplayViewerProps {
  frames: ReplayFrame[]
  players: Player[]
  loading: boolean
}

const COLORS = ['#EE0000', '#3396FF', '#26D962', '#FDBA74', '#c084fc', '#f472b6', '#38bdf8', '#a3e635']
function getColor(addr: string): string {
  return COLORS[parseInt(addr.slice(4, 6), 16) % COLORS.length]
}

function MiniPlayerCard({
  player,
  health,
  isAttacker,
  isTarget,
  isDead,
}: {
  player: Player
  health: number
  isAttacker: boolean
  isTarget: boolean
  isDead: boolean
}): React.ReactElement {
  const color = getColor(player.addr)
  const hpPct = Math.max(0, Math.min(100, health))
  const hpColor = hpPct <= 25 ? '#EE0000' : hpPct <= 50 ? '#FDBA74' : '#26D962'

  return (
    <motion.div
      className="border p-2 relative"
      style={{
        borderColor: isAttacker ? '#FDBA74' : isTarget ? '#EE0000' : isDead ? '#1a1a1a' : '#222',
        background: isTarget ? 'rgba(238,0,0,0.05)' : '#0a0a0a',
        opacity: isDead ? 0.4 : 1,
      }}
      animate={isTarget ? { x: [-3, 3, -2, 2, 0] } : {}}
      transition={{ duration: 0.3 }}
    >
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <span className="text-[8px] text-[#EE0000] font-bold uppercase">DEAD</span>
        </div>
      )}
      <div className="text-[8px] font-mono truncate mb-1" style={{ color }}>{SHORT_ADDR(player.addr)}</div>
      <div className="h-1 bg-[#111] w-full mb-0.5">
        <motion.div
          className="h-full"
          style={{ background: hpColor }}
          animate={{ width: `${hpPct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="text-[8px] font-mono" style={{ color: hpColor }}>{health}HP</div>
      {isAttacker && (
        <div className="absolute top-0 right-0 bg-[#FDBA74] text-black text-[6px] font-bold px-0.5">ATK</div>
      )}
    </motion.div>
  )
}

export function ReplayViewer({ frames, players, loading }: ReplayViewerProps): React.ReactElement {
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentFrame = frames[frameIdx] ?? null

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setFrameIdx(prev => {
          if (prev >= frames.length - 1) {
            setPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, 1200)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, frames.length])

  // Reset on new frames
  useEffect(() => { setFrameIdx(0); setPlaying(false) }, [frames])

  if (loading) {
    return (
      <div className="p-4 text-center text-[10px] text-[#444] animate-pulse">Loading replay data...</div>
    )
  }

  if (frames.length === 0) {
    return (
      <div className="p-4 text-center text-[10px] text-[#333]">No replay data available.</div>
    )
  }

  const attackerAddrs = new Set(currentFrame?.attacks.map(a => a.attacker) ?? [])
  const targetAddrs = new Set(currentFrame?.attacks.map(a => a.target) ?? [])

  return (
    <div className="border border-[#1a1a1a] bg-black p-4 space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="text-[10px] font-bold uppercase tracking-widest border border-white/20 px-3 py-1 hover:bg-white hover:text-black transition-all"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={frameIdx}
          onChange={e => { setPlaying(false); setFrameIdx(Number(e.target.value)) }}
          className="flex-1 accent-[#26D962]"
        />
        <span className="text-[10px] font-mono text-[#444] shrink-0">
          R{currentFrame?.round ?? 0} / {frames.length}
        </span>
      </div>

      {/* Frame events */}
      {currentFrame && (
        <div className="flex gap-4 text-[9px] font-mono">
          <span className="text-[#EE0000]">⚔ {currentFrame.attacks.length} attacks</span>
          <span className="text-[#26D962]">💚 {currentFrame.heals.length} heals</span>
          <span className="text-[#555]">☠ {currentFrame.deaths.length} deaths</span>
        </div>
      )}

      {/* Player grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
        <AnimatePresence>
          {players.map(player => {
            const addr = player.addr.toLowerCase() as `0x${string}`
            const health = currentFrame?.playerHealths[addr] ?? 100
            const isDead = health === 0

            return (
              <MiniPlayerCard
                key={player.addr}
                player={player}
                health={health}
                isAttacker={attackerAddrs.has(addr)}
                isTarget={targetAddrs.has(addr)}
                isDead={isDead}
              />
            )
          })}
        </AnimatePresence>
      </div>

      {/* Attack log for this frame */}
      {currentFrame && currentFrame.attacks.length > 0 && (
        <div className="space-y-0.5 border-t border-[#1a1a1a] pt-2">
          {currentFrame.attacks.map((atk, i) => (
            <div key={i} className="text-[9px] font-mono text-[#555]">
              <span className="text-[#FDBA74]">{SHORT_ADDR(atk.attacker)}</span>
              <span className="text-[#333] mx-1">→</span>
              <span className="text-[#EE0000]">{SHORT_ADDR(atk.target)}</span>
              <span className="text-[#333] ml-1">−{atk.damage}HP</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

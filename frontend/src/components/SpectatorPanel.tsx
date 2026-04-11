'use client'

import { motion } from 'framer-motion'
import { RoundResult } from '@/lib/types'

interface SpectatorPanelProps {
  activePlayers: number
  totalPlayers: number
  currentRound: number
  lastResult: RoundResult | null
  timeRemaining: number
}

export function SpectatorPanel({
  activePlayers,
  totalPlayers,
  currentRound,
  lastResult,
  timeRemaining,
}: SpectatorPanelProps): React.ReactElement {
  return (
    <div className="border-b border-[#1a1a1a] bg-black px-4 py-4 sm:px-6">
      {/* Speed comparison — the key demo stat */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        <div className="border border-[#1a1a1a] p-3">
          <div className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Ethereum (10 txs)</div>
          <div className="text-lg font-bold text-[#EE0000] font-mono">~120,000ms</div>
        </div>
        <div className="flex items-center justify-center">
          <span className="text-[#333] text-xl font-bold">VS</span>
        </div>
        <div className="border border-[#26D962]/30 p-3">
          <div className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Monad (10 txs)</div>
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-lg font-bold text-[#26D962] font-mono"
          >
            ~500ms
          </motion.div>
        </div>
      </div>

      {/* Live stats */}
      <div className="flex items-center justify-between mb-4 text-[10px] font-mono">
        <span className="text-[#555]">
          Round <span className="text-white">{currentRound}</span>
        </span>
        <span className="text-[#555]">
          <span className="text-[#26D962]">{activePlayers}</span> alive / {totalPlayers} total
        </span>
        <span style={{ color: timeRemaining <= 10 ? '#EE0000' : '#555' }}>
          {timeRemaining}s remaining
        </span>
      </div>

      {/* Last round result */}
      {lastResult && (
        <div className="border border-[#1a1a1a] p-3 text-center">
          <div className="text-[9px] text-[#555] uppercase tracking-widest mb-2">
            Last Round Result
          </div>
          <div className="text-xs font-bold text-white mb-1">
            {Number(lastResult.actionsProcessed)} parallel txs → 1 block
          </div>
          <div className="flex justify-center gap-4 text-[9px] font-mono text-[#555]">
            <span><span className="text-[#EE0000]">{Number(lastResult.attacksLanded)}</span> attacks</span>
            <span><span className="text-[#3396FF]">{Number(lastResult.defendersProtected)}</span> defended</span>
            <span><span className="text-[#26D962]">{Number(lastResult.healsApplied)}</span> heals</span>
            <span><span className="text-white">{Number(lastResult.playersEliminated)}</span> eliminated</span>
          </div>
        </div>
      )}

      <div className="mt-3 text-center">
        <div className="text-[10px] text-[#555] mb-1">Watching live — connect wallet to play</div>
        <div className="inline-block border border-[#333] px-3 py-1 text-[9px] text-[#555] uppercase tracking-widest">
          SPECTATOR MODE
        </div>
      </div>
    </div>
  )
}

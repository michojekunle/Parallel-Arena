'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PendingAction, RoundResult, Action } from '@/lib/types'
import { SHORT_ADDR, ACTION_LABELS, ACTION_COLORS } from '@/lib/constants'

interface ParallelVisualizationProps {
  pendingActions: PendingAction[]
  lastResult: RoundResult | null
  currentRound: number
  isFlashing: boolean
  lastRoundMs: number | null
}

// Animate a number from 0 to target when target changes
function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(0)
  const frameRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    fromRef.current = display
    startRef.current = null
    if (frameRef.current) cancelAnimationFrame(frameRef.current)

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const progress = Math.min((ts - startRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(Math.round(fromRef.current + (target - fromRef.current) * eased))
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  return display
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
  const displayed = useCountUp(value)
  return (
    <div className="text-center">
      <div className="text-xl font-bold font-mono" style={{ color }}>{displayed}</div>
      <div className="text-[9px] text-[#444] uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  )
}

export function ParallelVisualization({
  pendingActions,
  lastResult,
  currentRound,
  isFlashing,
  lastRoundMs,
}: ParallelVisualizationProps): React.ReactElement {
  return (
    <div
      className="flex flex-col h-full border-l border-[#1a1a1a] bg-black overflow-hidden"
      style={{ transition: 'background 0.3s', background: isFlashing ? 'rgba(38,217,98,0.08)' : undefined }}
    >
      {/* Flash overlay */}
      <AnimatePresence>
        {isFlashing && (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-10 pointer-events-none"
            style={{ background: 'rgba(38,217,98,0.25)' }}
          />
        )}
      </AnimatePresence>

      <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-[9px] text-[#555] uppercase tracking-widest">Parallel Execution</span>
        <span className="text-[9px] font-mono text-[#444]">Round {currentRound}</span>
      </div>

      {/* Speed comparison — static but impactful */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="text-[9px] text-[#333] uppercase tracking-widest mb-2">10-TX Execution Time</div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[9px] text-[#444] mb-1">Ethereum</div>
            <div className="text-base font-bold font-mono text-[#EE0000]">~120,000ms</div>
          </div>
          <div className="text-[#222] text-sm font-bold mb-1">vs</div>
          <div className="text-right">
            <div className="text-[9px] text-[#444] mb-1">Monad</div>
            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-base font-bold font-mono text-[#26D962]"
            >
              ~500ms
            </motion.div>
          </div>
        </div>
        {lastRoundMs !== null && (
          <div className="mt-2 text-[9px] font-mono text-[#555]">
            Last round: <span className="text-white">{lastRoundMs}ms</span> actual
          </div>
        )}
      </div>

      {/* Live action stream */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="text-[9px] text-[#333] uppercase tracking-widest mb-2">
          ↓ Actions arriving simultaneously
        </div>
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {pendingActions.slice(-7).map(pa => (
              <motion.div
                key={`${pa.player}-${pa.round}`}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 30, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 text-[10px] font-mono"
              >
                <span className="text-[#444] shrink-0">{SHORT_ADDR(pa.player)}</span>
                <span className="text-[#222]">──→</span>
                <span
                  className="px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={{
                    color: ACTION_COLORS[pa.action] || '#fff',
                    background: `${ACTION_COLORS[pa.action] || '#fff'}18`,
                    border: `1px solid ${ACTION_COLORS[pa.action] || '#fff'}30`,
                  }}
                >
                  {ACTION_LABELS[pa.action as keyof typeof ACTION_LABELS] || '?'}
                </span>
                {pa.txHash && (
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${pa.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#3396FF] text-[8px] hover:underline shrink-0"
                  >
                    {pa.txHash.slice(0, 8)}…
                  </a>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {pendingActions.length === 0 && (
            <div className="text-[9px] text-[#333] italic">Waiting for actions...</div>
          )}
        </div>
      </div>

      {/* Processing indicator */}
      <div className="px-4 py-2 border-t border-[#1a1a1a] flex items-center gap-3">
        <div className="flex-1 h-px bg-[#1a1a1a]" />
        <motion.div
          animate={pendingActions.length > 0 ? { scale: [1, 1.05, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border"
          style={{
            color: pendingActions.length > 0 ? '#FDBA74' : '#333',
            borderColor: pendingActions.length > 0 ? '#FDBA7440' : '#1a1a1a',
          }}
        >
          {pendingActions.length > 0 ? `⚡ ${pendingActions.length} PROCESSING` : 'IDLE'}
        </motion.div>
        <div className="flex-1 h-px bg-[#1a1a1a]" />
      </div>

      {/* Resolution stats */}
      {lastResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-[#1a1a1a] p-4"
        >
          <div className="text-[9px] text-[#555] uppercase tracking-widest text-center mb-3">
            Round {Number(lastResult.round)} Resolved
            {lastRoundMs !== null && (
              <span className="ml-2 text-white">{lastRoundMs}ms</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <StatBox label="Actions" value={Number(lastResult.actionsProcessed)} color="#fff" />
            <StatBox label="Attacks" value={Number(lastResult.attacksLanded)} color="#EE0000" />
            <StatBox label="Heals" value={Number(lastResult.healsApplied)} color="#26D962" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Defended" value={Number(lastResult.defendersProtected)} color="#3396FF" />
            <StatBox label="Eliminated" value={Number(lastResult.playersEliminated)} color="#EE0000" />
          </div>
          <div className="text-center mt-2 text-[9px] font-mono text-[#333]">
            {Number(lastResult.actionsProcessed)} parallel txs → 1 block
          </div>
        </motion.div>
      )}
    </div>
  )
}

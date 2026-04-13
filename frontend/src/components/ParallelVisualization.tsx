'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PendingAction, RoundResult, Action } from '@/lib/types'
import { SHORT_ADDR, ACTION_LABELS, ACTION_COLORS } from '@/lib/constants'
import { useBlockData } from '@/hooks/useBlockData'

interface ParallelVisualizationProps {
  pendingActions: PendingAction[]
  lastResult: RoundResult | null
  currentRound: number
  isFlashing: boolean
  lastRoundMs: number | null
  resolvedTxHashes: `0x${string}`[]
}

// Count-up animation hook
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
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(fromRef.current + (target - fromRef.current) * eased))
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

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

// A single tx execution lane
function TxLane({
  player,
  action,
  txHash,
  txIndex,
  resolved,
  sequential,
  sequentialDelay,
}: {
  player: `0x${string}`
  action: Action
  txHash?: `0x${string}`
  txIndex?: number
  resolved: boolean
  sequential: boolean
  sequentialDelay: number
}): React.ReactElement {
  const color = ACTION_COLORS[action] || '#fff'
  const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS] || '?'

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      <span className="text-[#555] shrink-0 w-[52px] truncate">{SHORT_ADDR(player)}</span>

      <div className="flex-1 relative h-4 bg-[#0d0d0d] border border-[#1a1a1a] overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: `${color}25`, borderRight: `1px solid ${color}` }}
          initial={{ width: 0 }}
          animate={{ width: resolved ? '100%' : '0%' }}
          transition={{
            duration: 0.4,
            delay: sequential ? sequentialDelay : 0,
            ease: 'easeOut',
          }}
        />
        <span
          className="absolute inset-0 flex items-center px-1.5 text-[8px] font-bold uppercase tracking-widest"
          style={{ color: resolved ? color : '#333' }}
        >
          {label}
        </span>
      </div>

      {txIndex !== undefined && txIndex >= 0 && (
        <span className="text-[8px] text-[#444] shrink-0">tx[{txIndex}]</span>
      )}

      {txHash && (
        <a
          href={`https://testnet.monadexplorer.com/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-[#3396FF] text-[8px] hover:underline shrink-0"
        >
          {txHash.slice(0, 6)}…
        </a>
      )}
    </div>
  )
}

export function ParallelVisualization({
  pendingActions,
  lastResult,
  currentRound,
  isFlashing,
  lastRoundMs,
  resolvedTxHashes,
}: ParallelVisualizationProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<'parallel' | 'sequential'>('parallel')

  const blockData = useBlockData(resolvedTxHashes)

  const isResolved = pendingActions.length === 0 && !!lastResult

  // Snapshot of pending actions at resolution time — used for resolved lane display
  const snapshotRef = useRef<PendingAction[]>([])
  useEffect(() => {
    if (pendingActions.length > 0) {
      snapshotRef.current = pendingActions
    }
  }, [pendingActions])

  const displayLanes: { player: `0x${string}`; action: Action; txHash?: `0x${string}`; txIndex?: number }[] =
    isResolved
      ? snapshotRef.current.map((pa, i) => ({
          player: pa.player,
          action: pa.action,
          txHash: pa.txHash as `0x${string}` | undefined,
          txIndex: blockData?.ourTxIndices[i],
        }))
      : pendingActions.map(pa => ({
          player: pa.player,
          action: pa.action,
          txHash: pa.txHash as `0x${string}` | undefined,
        }))

  const isSequential = viewMode === 'sequential'

  return (
    <div
      className="flex flex-col h-full border-l border-[#1a1a1a] bg-black overflow-hidden"
      style={{ transition: 'background 0.3s', background: isFlashing ? 'rgba(38,217,98,0.06)' : undefined }}
    >
      <AnimatePresence>
        {isFlashing && (
          <motion.div
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-10 pointer-events-none"
            style={{ background: 'rgba(38,217,98,0.2)' }}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between shrink-0">
        <div>
          <span className="text-[9px] text-[#555] uppercase tracking-widest">Parallel Execution</span>
          {blockData && (
            <div className="text-[8px] font-mono text-[#444] mt-0.5">
              Block #{blockData.number.toString()} · {blockData.txCount} txs
              {lastRoundMs !== null && <span className="ml-1 text-white">{lastRoundMs}ms</span>}
            </div>
          )}
          {!blockData && <div className="text-[8px] font-mono text-[#333]">Round {currentRound}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('parallel')}
            className={`text-[8px] px-2 py-0.5 border transition-colors uppercase tracking-widest font-bold ${
              viewMode === 'parallel' ? 'border-[#26D962] text-[#26D962] bg-[#26D962]/10' : 'border-[#222] text-[#444]'
            }`}
          >
            Parallel
          </button>
          <button
            onClick={() => setViewMode('sequential')}
            className={`text-[8px] px-2 py-0.5 border transition-colors uppercase tracking-widest font-bold ${
              viewMode === 'sequential' ? 'border-[#EE0000] text-[#EE0000] bg-[#EE0000]/10' : 'border-[#222] text-[#444]'
            }`}
          >
            Sequential
          </button>
        </div>
      </div>

      {/* Speed comparison */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] shrink-0">
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
          <div className="mt-1 text-[9px] font-mono text-[#555]">
            Last round: <span className="text-white">{lastRoundMs}ms</span> actual
          </div>
        )}
      </div>

      {/* Mode label */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <div className="text-[9px] text-[#333] uppercase tracking-widest">
          {isSequential
            ? <><span className="text-[#EE0000]">▶ </span>Sequential (Ethereum-style)</>
            : <><span className="text-[#26D962]">▶▶ </span>All lanes fire simultaneously</>
          }
        </div>
      </div>

      {/* Tx lanes */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
        <AnimatePresence initial={false}>
          {displayLanes.length === 0 && (
            <div className="text-[9px] text-[#333] italic pt-2">Waiting for actions...</div>
          )}
          {displayLanes.map((lane, i) => (
            <motion.div
              key={`${lane.player}-${currentRound}-${i}`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2, delay: isSequential ? i * 0.05 : 0 }}
            >
              <TxLane
                player={lane.player}
                action={lane.action}
                txHash={lane.txHash}
                txIndex={lane.txIndex}
                resolved={isResolved}
                sequential={isSequential}
                sequentialDelay={i * 0.3}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {blockData && resolvedTxHashes.length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 pt-2 border-t border-[#1a1a1a] text-[8px] font-mono text-[#444] text-center"
          >
            {resolvedTxHashes.length} txs → block #{blockData.number.toString()}
            {viewMode === 'parallel' && (
              <span className="ml-1 text-[#26D962] font-bold">= parallel</span>
            )}
          </motion.div>
        )}
      </div>

      {/* Processing indicator */}
      <div className="px-4 py-2 border-t border-[#1a1a1a] flex items-center gap-3 shrink-0">
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
          className="border-t border-[#1a1a1a] p-4 shrink-0"
        >
          <div className="text-[9px] text-[#555] uppercase tracking-widest text-center mb-3">
            Round {Number(lastResult.round)} Resolved
            {lastRoundMs !== null && <span className="ml-2 text-white">{lastRoundMs}ms</span>}
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

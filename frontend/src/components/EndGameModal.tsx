'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPublicClient, http, fallback } from 'viem'
import { PrizeAmounts, Player } from '@/lib/types'
import { SHORT_ADDR, monadTestnet, RPC_URLS } from '@/lib/constants'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { useGameReplay } from '@/hooks/useGameReplay'
import { ReplayViewer } from './ReplayViewer'
import { formatEther } from 'viem'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 }))),
})

interface EndGameModalProps {
  isOpen: boolean
  onClose: () => void
  winners: [`0x${string}`, `0x${string}`, `0x${string}`]
  players: Player[]
  prizeAmounts: PrizeAmounts | null
  myAddress: `0x${string}` | undefined
  onClaim: () => void
  onReset: () => void
  hasClaimed: boolean
}

const RANK_LABELS = ['🥇 1ST PLACE', '🥈 2ND PLACE', '🥉 3RD PLACE']
const RANK_COLORS = ['#FDBA74', '#aaaaaa', '#CD7F32']
const RANK_PCT    = ['50%', '30%', '20%']

export function EndGameModal({
  isOpen,
  onClose,
  winners,
  players,
  prizeAmounts,
  myAddress,
  onClaim,
  onReset,
  hasClaimed,
}: EndGameModalProps): React.ReactElement {
  const [showReplay, setShowReplay] = useState(false)
  const [gameEndBlock, setGameEndBlock] = useState<bigint | null>(null)

  // Fetch the block number of the GameEnded event when modal opens
  useEffect(() => {
    if (!isOpen || !CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return
    let cancelled = false

    publicClient
      .getBlockNumber()
      .then(latest => {
        const fromBlock = latest > 500n ? latest - 500n : 0n
        return publicClient.getContractEvents({
          address: CONTRACT_ADDRESS, abi: ABI, eventName: 'GameEnded', fromBlock,
        })
      })
      .then(events => {
        if (cancelled || events.length === 0) return
        const last = events[events.length - 1]
        setGameEndBlock((last as { blockNumber: bigint }).blockNumber)
      })
      .catch(() => null)

    return () => { cancelled = true }
  }, [isOpen])

  const { frames, loading: replayLoading } = useGameReplay(showReplay ? gameEndBlock : null, players)

  const prizeByRank = prizeAmounts
    ? [prizeAmounts.firstPrize, prizeAmounts.secondPrize, prizeAmounts.thirdPrize]
    : [0n, 0n, 0n]

  const myWinnerRank = winners.findIndex(w => w.toLowerCase() === myAddress?.toLowerCase())
  const isWinner = myWinnerRank >= 0

  // AnimatePresence MUST wrap the conditional, not be inside it.
  // Returning null before reaching AnimatePresence kills the exit animation entirely.
  return (
    <AnimatePresence>
      {isOpen && (
      <motion.div
        key="end-game-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        style={{ background: 'rgba(0,0,0,0.85)' }}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          className="w-full max-w-lg border border-[#1a1a1a] bg-black p-6 relative my-4"
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#444] hover:text-white transition-colors"
          >
            ✕
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-2xl mb-2"
            >
              ⚡
            </motion.div>
            <h2 className="text-sm font-bold tracking-widest uppercase text-white">BATTLE ENDED</h2>
            <p className="text-[9px] text-[#555] mt-1 uppercase tracking-widest">
              Top 3 survivors claim the prize pool
            </p>
          </div>

          {/* Prize pool total */}
          {prizeAmounts && (
            <div className="border border-[#1a1a1a] p-3 mb-4 text-center">
              <div className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Total Prize Pool</div>
              <div className="text-xl font-bold font-mono text-white">
                {formatEther(prizeAmounts.firstPrize + prizeAmounts.secondPrize + prizeAmounts.thirdPrize)} MON
              </div>
            </div>
          )}

          {/* Winners */}
          <div className="space-y-2 mb-4">
            {winners.map((addr, i) => {
              const isZero = !addr || addr === '0x0000000000000000000000000000000000000000'
              const isMyRow = addr.toLowerCase() === myAddress?.toLowerCase()
              const p = players.find(pl => pl.addr.toLowerCase() === addr.toLowerCase())
              if (isZero) return null

              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 border"
                  style={{
                    borderColor: isMyRow ? RANK_COLORS[i] + '60' : '#1a1a1a',
                    background: isMyRow ? RANK_COLORS[i] + '08' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold" style={{ color: RANK_COLORS[i] }}>
                      {RANK_LABELS[i]}
                    </span>
                    <span className="text-[9px] font-mono text-[#555]">{SHORT_ADDR(addr)}</span>
                    {p && <span className="text-[9px] text-[#333]">HP:{Number(p.health)}</span>}
                    {isMyRow && (
                      <span className="text-[8px] font-bold text-white border border-white/20 px-1">YOU</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold font-mono" style={{ color: RANK_COLORS[i] }}>
                      {prizeAmounts ? formatEther(prizeByRank[i]) : '?'} MON
                    </div>
                    <div className="text-[8px] text-[#555]">{RANK_PCT[i]}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Replay toggle */}
          <div className="mb-4">
            <button
              onClick={() => setShowReplay(v => !v)}
              className="w-full py-2 text-[10px] font-bold uppercase tracking-widest border border-[#333] text-[#555] hover:border-[#3396FF] hover:text-[#3396FF] transition-all"
            >
              {showReplay ? '▲ Hide Replay' : '▶ Watch Replay'}
            </button>
            {showReplay && (
              <div className="mt-2">
                <ReplayViewer frames={frames} players={players} loading={replayLoading} />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {isWinner && !hasClaimed && (
              <button
                className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest border-2 border-[#26D962] text-[#26D962] hover:bg-[#26D962] hover:text-black transition-all"
                onClick={onClaim}
              >
                CLAIM PRIZE 💰
              </button>
            )}
            {isWinner && hasClaimed && (
              <div className="flex-1 py-3 text-center text-[10px] font-bold text-[#26D962] border border-[#26D962]/30">
                ✓ Prize Claimed
              </div>
            )}
            <button
              className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest border border-[#333] text-[#555] hover:border-white hover:text-white transition-all"
              onClick={onReset}
            >
              NEW GAME →
            </button>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}

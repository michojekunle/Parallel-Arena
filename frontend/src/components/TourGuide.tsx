'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STEPS = [
  {
    title: 'CONNECT WALLET',
    icon: '🔗',
    color: '#3396FF',
    body: 'Click the connect button in the top-right corner. Use MetaMask or any WalletConnect-compatible wallet. You need to be on Monad Testnet (chain ID 10143).',
    tip: 'Don\'t have MON? Get free testnet tokens from faucet.monad.xyz',
    target: 'wallet',
  },
  {
    title: 'JOIN THE ARENA',
    icon: '⚡',
    color: '#FDBA74',
    body: 'Pay 0.01 MON to enter. This is the only on-chain transaction — it joins you and registers a session key so all future actions are gasless.',
    tip: 'The session key is encrypted and stored locally. It never leaves your browser.',
    target: 'join',
  },
  {
    title: 'VOTE TO START',
    icon: '🗳',
    color: '#26D962',
    body: 'Once you\'ve joined, click "READY TO START" to signal you want the game to begin. A quorum of players must agree before the game starts. AI agents auto-vote.',
    tip: 'Games with ≤10 players need 3 votes. Larger games need 30% of players.',
    target: 'vote',
  },
  {
    title: 'CHOOSE YOUR ACTION',
    icon: '⚔',
    color: '#EE0000',
    body: 'Each 30-second round, pick one action:\n\n⚔ ATTACK — deals damage to the lowest-HP opponent\n🛡 DEFEND — cuts incoming damage by 50%\n💚 HEAL — restores your HP (diminishing returns after consecutive heals)',
    tip: 'Hover ATTACK to preview which player you\'ll target.',
    target: 'actions',
  },
  {
    title: 'PARALLEL EXECUTION',
    icon: '⚡',
    color: '#c084fc',
    body: 'When the round resolves, ALL player actions execute in the same block simultaneously — this is what makes Monad unique. The right panel shows lanes of parallel execution vs sequential chains.',
    tip: 'The last player standing (or top 3 after 5 rounds) splits the prize pool 50/30/20%.',
    target: 'viz',
  },
]

const STORAGE_KEY = 'parallel_arena_tour_done'

interface TourGuideProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function TourGuide({ forceOpen, onClose }: TourGuideProps): React.ReactElement | null {
  const [step, setStep] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true)
      setStep(0)
      return
    }
    // Auto-show on first visit
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setIsOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [forceOpen])

  const close = () => {
    setIsOpen(false)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
    onClose?.()
  }

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-lg bg-black border border-[#222] shadow-2xl">
              {/* Progress bar */}
              <div className="h-0.5 bg-[#111]">
                <motion.div
                  className="h-full"
                  style={{ background: current.color }}
                  initial={{ width: `${(step / STEPS.length) * 100}%` }}
                  animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              <div className="p-6 lg:p-8">
                {/* Step indicator + close */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    {STEPS.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setStep(i)}
                        className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full transition-all"
                        style={{ background: i === step ? current.color : i < step ? '#333' : '#1a1a1a' }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={close}
                    className="text-[#444] hover:text-white transition-colors text-[10px] uppercase tracking-widest"
                  >
                    Skip tour
                  </button>
                </div>

                {/* Icon + title */}
                <div className="flex items-start gap-4 mb-5">
                  <div
                    className="w-10 h-10 lg:w-14 lg:h-14 flex-shrink-0 flex items-center justify-center text-xl lg:text-3xl border"
                    style={{ borderColor: `${current.color}40`, background: `${current.color}10` }}
                  >
                    {current.icon}
                  </div>
                  <div>
                    <div className="text-[9px] lg:text-[10px] font-bold tracking-[0.3em] mb-1" style={{ color: current.color }}>
                      STEP {step + 1} OF {STEPS.length}
                    </div>
                    <h2 className="text-lg lg:text-2xl font-black tracking-tighter">{current.title}</h2>
                  </div>
                </div>

                {/* Body */}
                <div className="text-[11px] lg:text-sm text-[#ccc] leading-relaxed mb-5 whitespace-pre-line">
                  {current.body}
                </div>

                {/* Tip */}
                <div
                  className="text-[10px] lg:text-xs font-mono p-3 border mb-6"
                  style={{ borderColor: `${current.color}30`, color: current.color, background: `${current.color}08` }}
                >
                  💡 {current.tip}
                </div>

                {/* Navigation */}
                <div className="flex items-center gap-3">
                  {step > 0 && (
                    <button
                      onClick={() => setStep(s => s - 1)}
                      className="px-4 py-2 text-[10px] lg:text-xs font-bold uppercase tracking-widest border border-[#333] text-[#555] hover:border-white hover:text-white transition-all"
                    >
                      ← Back
                    </button>
                  )}
                  <button
                    onClick={() => isLast ? close() : setStep(s => s + 1)}
                    className="flex-1 py-2.5 lg:py-3 text-[11px] lg:text-sm font-bold uppercase tracking-widest border-2 text-black transition-all"
                    style={{ background: current.color, borderColor: current.color }}
                  >
                    {isLast ? 'Enter the Arena →' : `Next: ${STEPS[step + 1].title} →`}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

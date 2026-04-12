'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface GuideProps {
  isOpen: boolean
  onClose: () => void
}

export function Guide({ isOpen, onClose }: GuideProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-black border-l border-[#1a1a1a] p-8 z-[70] overflow-y-auto"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-12">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold tracking-[0.3em] text-[#888] uppercase">Directive</span>
                  <span className="text-xl font-bold tracking-tighter">BATTLE_INTELLIGENCE</span>
                </div>
                <button 
                  onClick={onClose}
                  className="w-10 h-10 border border-[#1a1a1a] flex items-center justify-center hover:border-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-10">
                <section>
                  <h3 className="text-[10px] font-bold text-[#888] tracking-widest uppercase mb-4">Core Objective</h3>
                  <p className="text-sm leading-relaxed text-[#eee]">
                    Parallel Arena is a survival-of-the-fittest battle royale. Your goal is to outlast all other nodes (AI Agents) to claim the <span className="text-white font-bold">MON Prize Pool</span>.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-[#888] tracking-widest uppercase mb-4">Targeting Intel</h3>
                  <div className="p-4 border border-[#EE0000]/20 bg-[#EE0000]/5">
                    <p className="text-xs leading-relaxed text-[#EE0000]">
                      <span className="font-bold">LOWEST-HP TARGETING:</span> You do not manually pick targets. All <span className="font-bold uppercase">Attack</span> actions are automatically directed by the protocol to the <span className="font-bold underline">weakest opponent</span> in the arena. 
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-[#888] tracking-widest uppercase mb-4">Action Protocols</h3>
                  <div className="grid gap-4">
                    <div className="p-3 border border-[#1a1a1a]">
                      <div className="text-[10px] font-bold text-white mb-1 uppercase tracking-widest">⚔ ATTACK</div>
                      <p className="text-xs text-[#888]">Deals damage to the weakest node. Damage is cumulative—the more players attacking the same target, the faster they are eliminated.</p>
                    </div>
                    <div className="p-3 border border-[#1a1a1a]">
                      <div className="text-[10px] font-bold text-white mb-1 uppercase tracking-widest">🛡 DEFEND</div>
                      <p className="text-xs text-[#888]">Reduces incoming damage by 50%. Essential when you are the one with the lowest health, as the swarm will be targeting you.</p>
                    </div>
                    <div className="p-3 border border-[#1a1a1a]">
                      <div className="text-[10px] font-bold text-white mb-1 uppercase tracking-widest">💚 HEAL</div>
                      <p className="text-xs text-[#888]">Restores HP. Caution: You cannot defend while healing. High risk, high reward.</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-[#888] tracking-widest uppercase mb-4">Technical Advantage</h3>
                  <p className="text-xs leading-relaxed text-[#555]">
                    Leveraging Monad's Parallel Execution, all actions land in the same block. Use <span className="text-white">Session Keys</span> to bypass wallet popups and react at machine-speed.
                  </p>
                </section>
              </div>

              <div className="mt-auto pt-12">
                <button 
                  onClick={onClose}
                  className="w-full py-4 bg-white text-black font-bold text-[10px] uppercase tracking-widest hover:bg-[#888] transition-colors"
                >
                  Acknowledge Directive
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

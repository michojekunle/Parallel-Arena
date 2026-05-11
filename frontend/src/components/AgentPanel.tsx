'use client'

import { useState } from 'react'
import { formatEther } from 'viem'
import { useAgent } from '@/hooks/useAgent'
import { AgentStrategy, AgentInfo } from '@/lib/types'

const STRATEGY_CONFIG: Record<AgentStrategy, { label: string; color: string }> = {
  [AgentStrategy.RANDOM]:     { label: 'RANDOM',     color: '#555'    },
  [AgentStrategy.AGGRESSIVE]: { label: 'AGGRESSIVE', color: '#EE0000' },
  [AgentStrategy.DEFENSIVE]:  { label: 'DEFENSIVE',  color: '#3396FF' },
  [AgentStrategy.ADAPTIVE]:   { label: 'ADAPTIVE',   color: '#26D962' },
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function AgentCard({ address, info, isMe }: { address: `0x${string}`; info: AgentInfo; isMe: boolean }) {
  const strat = STRATEGY_CONFIG[info.strategy as AgentStrategy]
  const balMON = Number(formatEther(info.balance)).toFixed(3)
  return (
    <div className={`p-3 border font-mono text-[10px] ${isMe ? 'border-white/30 bg-white/3' : 'border-[#1a1a1a]'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold" style={{ color: strat.color }}>{strat.label}</span>
        <div className="flex items-center gap-2">
          {!info.active && <span className="text-[#EE0000]">PAUSED</span>}
          {isMe && <span className="text-[#26D962]">YOUR AGENT</span>}
        </div>
      </div>
      <div className="text-[#555] mb-1">{shortenAddr(address)}</div>
      <div className="grid grid-cols-3 gap-1 text-[9px]">
        <div><div className="text-[#333]">BALANCE</div><div className="text-white">{balMON} MON</div></div>
        <div><div className="text-[#333]">GAMES</div><div className="text-white">{info.gamesPlayed.toString()}</div></div>
        <div><div className="text-[#333]">KILLS</div><div className="text-[#EE0000]">{info.totalKills.toString()}</div></div>
      </div>
      {info.topThreeFinishes > 0n && (
        <div className="mt-1 text-[9px] text-[#FDBA74]">
          🏆 {info.topThreeFinishes.toString()} top-3 finish{info.topThreeFinishes === 1n ? '' : 'es'}
        </div>
      )}
    </div>
  )
}

export function AgentPanel({ myAddress }: { myAddress?: `0x${string}` }) {
  const { allAgents } = useAgent()
  const [tab, setTab] = useState<'mine' | 'all'>('mine')

  return (
    <div className="bg-black border border-[#1a1a1a] font-mono text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]">AI AGENTS</span>
          <span className="text-[8px] font-bold uppercase tracking-widest border border-[#FDBA74]/40 text-[#FDBA74] px-1.5 py-0.5">
            COMING SOON
          </span>
        </div>
        <div className="flex gap-2">
          {(['mine', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[9px] uppercase tracking-widest px-2 py-1 border transition-colors ${
                tab === t ? 'border-white text-white' : 'border-[#333] text-[#555] hover:border-[#555]'
              }`}
            >
              {t === 'mine' ? 'MY AGENT' : `ALL (${allAgents.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* ── MY AGENT TAB — Coming Soon ── */}
        {tab === 'mine' && (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <div className="text-4xl">🤖</div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-1 text-white">
                Personal Agents
              </div>
              <div className="text-[10px] text-[#555] leading-relaxed max-w-[240px]">
                Deploy your own AI agent that joins and plays every round automatically — no manual input needed.
              </div>
            </div>

            <div className="w-full space-y-2 text-left">
              {[
                { icon: '⚙️', label: 'Choose a strategy', desc: 'Aggressive, Defensive, Adaptive, or Random' },
                { icon: '💰', label: 'Fund its balance',  desc: 'Agent pays its own 0.01 MON entry fee each game' },
                { icon: '⚡', label: 'It plays for you',  desc: 'Submits actions in parallel with other agents each round' },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex gap-3 px-3 py-2 border border-[#1a1a1a] bg-[#0a0a0a]">
                  <span className="text-lg flex-shrink-0">{icon}</span>
                  <div>
                    <div className="text-[10px] font-bold text-white">{label}</div>
                    <div className="text-[9px] text-[#555]">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              disabled
              className="w-full py-3 text-[11px] font-bold uppercase tracking-[0.15em] border-2 border-[#333] text-[#444] cursor-not-allowed"
            >
              🔒 REGISTER AGENT — COMING SOON
            </button>

            <p className="text-[9px] text-[#333] leading-relaxed">
              The agent runner is not yet available to the public. Watch this space.
            </p>
          </div>
        )}

        {/* ── ALL AGENTS TAB — live data ── */}
        {tab === 'all' && (
          <div>
            {allAgents.length === 0 ? (
              <div className="text-center py-8 text-[#333] text-[10px]">No agents registered yet</div>
            ) : (
              <>
                <div className="text-[9px] text-[#555] mb-3 leading-relaxed">
                  These AI agents are run by the arena operator and compete every round automatically,
                  demonstrating Monad's parallel transaction execution.
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {allAgents.map(({ address: addr, info }) => (
                    <AgentCard
                      key={addr}
                      address={addr}
                      info={info}
                      isMe={myAddress?.toLowerCase() === info.owner.toLowerCase()}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

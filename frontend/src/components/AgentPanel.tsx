'use client'

import { useState } from 'react'
import { formatEther } from 'viem'
import { useAgent } from '@/hooks/useAgent'
import { AgentStrategy, AgentInfo } from '@/lib/types'
import { AGENT_CREATION_FEE } from '@/lib/contract'

const STRATEGY_CONFIG: Record<AgentStrategy, { label: string; desc: string; color: string }> = {
  [AgentStrategy.RANDOM]:     { label: 'RANDOM',     color: '#555',    desc: 'Chaotic — picks any action, weighted toward attack' },
  [AgentStrategy.AGGRESSIVE]: { label: 'AGGRESSIVE', color: '#EE0000', desc: 'Always attacks — maximum damage, no self-care' },
  [AgentStrategy.DEFENSIVE]:  { label: 'DEFENSIVE',  color: '#3396FF', desc: 'Attacks when healthy, defends when damaged' },
  [AgentStrategy.ADAPTIVE]:   { label: 'ADAPTIVE',   color: '#26D962', desc: 'Reads round history — heals, defends, or attacks intelligently' },
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
        {!info.active && <span className="text-[#EE0000]">PAUSED</span>}
        {isMe && <span className="text-[#26D962]">YOUR AGENT</span>}
      </div>
      <div className="text-[#555] mb-1">{shortenAddr(address)}</div>
      <div className="grid grid-cols-3 gap-1 text-[9px]">
        <div><div className="text-[#333]">BALANCE</div><div className="text-white">{balMON} MON</div></div>
        <div><div className="text-[#333]">GAMES</div><div className="text-white">{info.gamesPlayed.toString()}</div></div>
        <div><div className="text-[#333]">KILLS</div><div className="text-[#EE0000]">{info.totalKills.toString()}</div></div>
      </div>
      {info.topThreeFinishes > 0n && (
        <div className="mt-1 text-[9px] text-[#FDBA74]">🏆 {info.topThreeFinishes.toString()} top-3 finish{info.topThreeFinishes === 1n ? '' : 'es'}</div>
      )}
    </div>
  )
}

export function AgentPanel({ myAddress }: { myAddress?: `0x${string}` }) {
  const {
    myAgentAddress, myAgentInfo, allAgents, pendingRewards,
    isRegistering, isDepositing, error,
    registerAgent, depositAgent, toggleAgent, claimRewards,
  } = useAgent()

  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  const [agentAddr, setAgentAddr] = useState('')
  const [strategy, setStrategy] = useState<AgentStrategy>(AgentStrategy.ADAPTIVE)
  const [depositMON, setDepositMON] = useState('0.05')
  const [topUpMON, setTopUpMON] = useState('0.05')

  const totalCost = (Number(formatEther(AGENT_CREATION_FEE)) + Number(depositMON || '0')).toFixed(3)

  const handleRegister = async (): Promise<void> => {
    if (!agentAddr.startsWith('0x') || agentAddr.length !== 42) {
      return
    }
    await registerAgent(agentAddr as `0x${string}`, strategy, depositMON)
    setAgentAddr('')
  }

  return (
    <div className="bg-black border border-[#1a1a1a] font-mono text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em]">AI AGENTS</span>
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
        {error && (
          <div className="mb-3 px-3 py-2 border border-[#EE0000]/40 bg-[#EE0000]/5 text-[10px] text-[#EE0000]">
            {error}
          </div>
        )}

        {/* ── MY AGENT TAB ── */}
        {tab === 'mine' && (
          <div>
            {myAgentAddress && myAgentInfo ? (
              // Existing agent dashboard
              <div>
                <AgentCard address={myAgentAddress} info={myAgentInfo} isMe />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {/* Top up */}
                  <div>
                    <div className="text-[9px] text-[#555] mb-1">TOP UP BALANCE</div>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={topUpMON}
                        onChange={e => setTopUpMON(e.target.value)}
                        className="flex-1 bg-transparent border border-[#333] px-2 py-1.5 text-[10px] text-white focus:border-white outline-none w-0"
                        placeholder="MON"
                      />
                      <button
                        onClick={() => depositAgent(topUpMON)}
                        disabled={isDepositing}
                        className="px-3 py-1.5 text-[10px] border border-[#3396FF] text-[#3396FF] hover:bg-[#3396FF] hover:text-black transition-colors disabled:opacity-40"
                      >
                        {isDepositing ? '…' : '+ ADD'}
                      </button>
                    </div>
                  </div>

                  {/* Toggle */}
                  <div className="flex flex-col justify-end">
                    <button
                      onClick={toggleAgent}
                      className={`py-1.5 px-3 text-[10px] font-bold border transition-colors ${
                        myAgentInfo.active
                          ? 'border-[#EE0000]/60 text-[#EE0000] hover:bg-[#EE0000]/10'
                          : 'border-[#26D962]/60 text-[#26D962] hover:bg-[#26D962]/10'
                      }`}
                    >
                      {myAgentInfo.active ? '⏸ PAUSE AGENT' : '▶ RESUME AGENT'}
                    </button>
                  </div>
                </div>

                {/* Pending rewards */}
                {pendingRewards > 0n && (
                  <div className="mt-3 flex items-center justify-between px-3 py-2 border border-[#FDBA74]/30 bg-[#FDBA74]/5">
                    <span className="text-[10px] text-[#FDBA74]">
                      💰 Resolver rewards: {Number(formatEther(pendingRewards)).toFixed(4)} MON
                    </span>
                    <button
                      onClick={claimRewards}
                      className="text-[10px] text-[#FDBA74] border border-[#FDBA74]/50 px-2 py-1 hover:bg-[#FDBA74]/10 transition-colors"
                    >
                      CLAIM
                    </button>
                  </div>
                )}

                {/* Strategy description */}
                <div className="mt-3 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a]">
                  <div className="text-[9px] text-[#555] mb-0.5">STRATEGY</div>
                  <div className="text-[10px]" style={{ color: STRATEGY_CONFIG[myAgentInfo.strategy as AgentStrategy].color }}>
                    {STRATEGY_CONFIG[myAgentInfo.strategy as AgentStrategy].label}
                  </div>
                  <div className="text-[9px] text-[#444] mt-0.5">
                    {STRATEGY_CONFIG[myAgentInfo.strategy as AgentStrategy].desc}
                  </div>
                </div>
              </div>
            ) : (
              // Registration form
              <div>
                <div className="text-[9px] text-[#555] mb-3 leading-relaxed">
                  Register an AI agent that competes every round automatically.
                  The agent runner uses your agent's wallet to sign actions —
                  no manual input needed. Costs <span className="text-white">0.05 MON</span> to register
                  + a balance for entry fees (0.01 MON/game).
                </div>

                {/* Agent address */}
                <div className="mb-3">
                  <div className="text-[9px] text-[#555] mb-1">AGENT WALLET ADDRESS <span className="text-[#333]">(0x...)</span></div>
                  <input
                    type="text"
                    value={agentAddr}
                    onChange={e => setAgentAddr(e.target.value)}
                    className="w-full bg-transparent border border-[#333] px-3 py-2 text-[10px] text-white font-mono focus:border-white outline-none"
                    placeholder="0x..."
                  />
                  <div className="text-[9px] text-[#444] mt-1">
                    Generate a fresh wallet. The runner script needs its private key.
                  </div>
                </div>

                {/* Strategy */}
                <div className="mb-3">
                  <div className="text-[9px] text-[#555] mb-1">STRATEGY</div>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(STRATEGY_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setStrategy(Number(key) as AgentStrategy)}
                        className={`px-2 py-2 text-[10px] border text-left transition-colors ${
                          strategy === Number(key)
                            ? 'border-white bg-white/5'
                            : 'border-[#1a1a1a] hover:border-[#333]'
                        }`}
                        style={{ color: strategy === Number(key) ? cfg.color : '#555' }}
                      >
                        <div className="font-bold">{cfg.label}</div>
                        <div className="text-[8px] text-[#444] mt-0.5">{cfg.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Initial deposit */}
                <div className="mb-3">
                  <div className="text-[9px] text-[#555] mb-1">INITIAL BALANCE (for entry fees)</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={depositMON}
                      onChange={e => setDepositMON(e.target.value)}
                      className="flex-1 bg-transparent border border-[#333] px-3 py-2 text-[10px] text-white focus:border-white outline-none"
                    />
                    <span className="text-[10px] text-[#555]">MON</span>
                  </div>
                  <div className="text-[9px] text-[#444] mt-1">
                    Each game costs 0.01 MON → {depositMON ? Math.floor(Number(depositMON) / 0.01) : 0} games
                  </div>
                </div>

                {/* Total & register */}
                <div className="flex items-center justify-between mb-3 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a]">
                  <span className="text-[10px] text-[#555]">Total cost</span>
                  <span className="text-[11px] font-bold text-white">{totalCost} MON</span>
                </div>
                <button
                  onClick={handleRegister}
                  disabled={isRegistering || !agentAddr.startsWith('0x')}
                  className="w-full py-3 text-[11px] font-bold uppercase tracking-[0.15em] border-2 border-white text-white hover:bg-white hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRegistering ? 'REGISTERING...' : `⚡ REGISTER AGENT (${totalCost} MON)`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ALL AGENTS TAB ── */}
        {tab === 'all' && (
          <div>
            {allAgents.length === 0 ? (
              <div className="text-center py-8 text-[#333] text-[10px]">No agents registered yet</div>
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}

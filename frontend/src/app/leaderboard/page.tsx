'use client'

import { useEffect, useState } from 'react'
import { createPublicClient, http, fallback } from 'viem'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import Link from 'next/link'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 }))),
})

interface PlayerStats {
  gamesPlayed: number
  wins: number
  kills: number
  totalDamage: number
}

interface LeaderboardEntry {
  addr: `0x${string}`
  stats: PlayerStats
  winRate: number
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function LeaderboardPage(): React.ReactElement {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setError('Contract not deployed')
      setLoading(false)
      return
    }

    publicClient
      .readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getLeaderboard' })
      .then(result => {
        const [addrs, statsRaw] = result as [
          `0x${string}`[],
          { gamesPlayed: number; wins: number; kills: number; totalDamage: number }[],
        ]

        const parsed: LeaderboardEntry[] = addrs
          .map((addr, i) => {
            const s = statsRaw[i]
            const stats: PlayerStats = {
              gamesPlayed: Number(s.gamesPlayed),
              wins: Number(s.wins),
              kills: Number(s.kills),
              totalDamage: Number(s.totalDamage),
            }
            return {
              addr,
              stats,
              winRate: stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0,
            }
          })
          .filter(e => e.stats.gamesPlayed > 0)
          .sort((a, b) => b.stats.wins - a.stats.wins || b.stats.kills - a.stats.kills)

        setEntries(parsed)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-sm font-bold tracking-tighter hover:text-[#26D962] transition-colors">
          PARALLEL<span className="text-[#555] font-light ml-1 lowercase">arena</span>
        </Link>
        <span className="text-[10px] text-[#555] uppercase tracking-widest">Leaderboard</span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-[11px] uppercase tracking-[0.3em] text-[#555] mb-6">All-Time Rankings</h2>

        {loading && (
          <div className="text-center py-12 text-[#444] text-sm animate-pulse">Loading chain data...</div>
        )}

        {error && (
          <div className="text-center py-12 text-[#EE0000] text-sm">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-12 text-[#444] text-sm">No games played yet.</div>
        )}

        {!loading && !error && entries.length > 0 && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] text-[#444] uppercase tracking-widest border-b border-[#1a1a1a]">
                <th className="pb-2 pr-4 w-8">#</th>
                <th className="pb-2 pr-6">Player</th>
                <th className="pb-2 pr-4 text-right">Wins</th>
                <th className="pb-2 pr-4 text-right">Kills</th>
                <th className="pb-2 pr-4 text-right">Games</th>
                <th className="pb-2 text-right">Win%</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const rankColor = i === 0 ? '#FDBA74' : i === 1 ? '#888' : i === 2 ? '#c084fc' : '#333'
                return (
                  <tr
                    key={entry.addr}
                    className="border-b border-[#0d0d0d] hover:bg-[#0a0a0a] transition-colors"
                  >
                    <td className="py-2 pr-4 text-[10px]" style={{ color: rankColor }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </td>
                    <td className="py-2 pr-6">
                      <a
                        href={`https://testnet.monadexplorer.com/address/${entry.addr}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[#3396FF] hover:underline"
                      >
                        {short(entry.addr)}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-right text-[11px] text-[#26D962] font-bold">
                      {entry.stats.wins}
                    </td>
                    <td className="py-2 pr-4 text-right text-[11px] text-[#EE0000]">
                      {entry.stats.kills}
                    </td>
                    <td className="py-2 pr-4 text-right text-[11px] text-[#555]">
                      {entry.stats.gamesPlayed}
                    </td>
                    <td className="py-2 text-right text-[11px]" style={{ color: entry.winRate >= 50 ? '#26D962' : '#555' }}>
                      {entry.winRate}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <p className="mt-8 text-[9px] text-[#333] text-center">
          Data reads directly from contract on Monad Testnet · refreshes on page load
        </p>
      </div>
    </div>
  )
}

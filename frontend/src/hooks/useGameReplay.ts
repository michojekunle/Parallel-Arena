'use client'

import { useState, useEffect, useRef } from 'react'
import { createPublicClient, http, fallback } from 'viem'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'
import { Player, ReplayFrame, ReplayAttack } from '@/lib/types'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 }))),
})

/**
 * Build a round-by-round replay from on-chain events.
 *
 * Strategy:
 * 1. Fetch PlayerJoined events to get initial health snapshots.
 * 2. Fetch PlayerAttacked, PlayerHealed, PlayerEliminated events per round.
 * 3. Simulate health changes forward in time to produce ReplayFrame[].
 *
 * Only runs when gameEndBlock is provided (game has ended).
 */
export function useGameReplay(
  gameEndBlock: bigint | null,
  initialPlayers: Player[],
): { frames: ReplayFrame[]; loading: boolean } {
  const [frames, setFrames] = useState<ReplayFrame[]>([])
  const [loading, setLoading] = useState(false)

  // Stable reference for players — prevents re-running the effect when the
  // parent passes a new array object with the same contents on every render.
  const playersRef = useRef(initialPlayers)
  useEffect(() => { playersRef.current = initialPlayers }, [initialPlayers])

  // Derive a stable string key from player addresses for the dependency array
  const playerKey = initialPlayers.map(p => p.addr).join(',')

  useEffect(() => {
    if (!gameEndBlock || playersRef.current.length === 0) return
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return

    let cancelled = false
    setLoading(true)

    // Look back up to 1000 blocks to find game events
    const fromBlock = gameEndBlock > 1000n ? gameEndBlock - 1000n : 0n

    Promise.all([
      publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: ABI, eventName: 'PlayerAttacked', fromBlock, toBlock: gameEndBlock }),
      publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: ABI, eventName: 'PlayerHealed', fromBlock, toBlock: gameEndBlock }),
      publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: ABI, eventName: 'PlayerEliminated', fromBlock, toBlock: gameEndBlock }),
      publicClient.getContractEvents({ address: CONTRACT_ADDRESS, abi: ABI, eventName: 'RoundResolved', fromBlock, toBlock: gameEndBlock }),
    ])
      .then(([attacks, heals, deaths, resolutions]) => {
        if (cancelled) return

        // Build initial health map from Player[] prop
        const healthMap: Record<`0x${string}`, number> = {}
        for (const p of playersRef.current) {
          // If game ended, use final health (DEAD = 0)
          // We need to reconstruct per-round — start from known starting health
          healthMap[p.addr.toLowerCase() as `0x${string}`] = 100
        }

        // Determine rounds from resolution events
        const roundNums = Array.from(
          new Set(
            (resolutions as { args: { round: bigint } }[]).map(e => Number(e.args.round))
          )
        ).sort((a, b) => a - b)

        if (roundNums.length === 0) {
          setFrames([])
          setLoading(false)
          return
        }

        const builtFrames: ReplayFrame[] = []

        for (const round of roundNums) {
          const roundAttacks: ReplayAttack[] = (attacks as { args: { attacker: `0x${string}`; target: `0x${string}`; damage: bigint }; blockNumber: bigint }[])
            .filter(e => {
              // Attribute to this round by checking adjacent resolution block numbers
              const resolveBlock = (resolutions as { args: { round: bigint }; blockNumber: bigint }[])
                .find(r => Number(r.args.round) === round)?.blockNumber
              return resolveBlock !== undefined && e.blockNumber <= resolveBlock
                && (round === roundNums[0] || e.blockNumber > ((resolutions as { args: { round: bigint }; blockNumber: bigint }[])
                  .find(r => Number(r.args.round) === round - 1)?.blockNumber ?? 0n))
            })
            .map(e => ({
              attacker: e.args.attacker.toLowerCase() as `0x${string}`,
              target: e.args.target.toLowerCase() as `0x${string}`,
              damage: Number(e.args.damage),
            }))

          const roundHeals: `0x${string}`[] = (heals as { args: { player: `0x${string}` }; blockNumber: bigint }[])
            .filter(e => {
              const resolveBlock = (resolutions as { args: { round: bigint }; blockNumber: bigint }[])
                .find(r => Number(r.args.round) === round)?.blockNumber
              return resolveBlock !== undefined && e.blockNumber <= resolveBlock
                && (round === roundNums[0] || e.blockNumber > ((resolutions as { args: { round: bigint }; blockNumber: bigint }[])
                  .find(r => Number(r.args.round) === round - 1)?.blockNumber ?? 0n))
            })
            .map(e => e.args.player.toLowerCase() as `0x${string}`)

          const roundDeaths: `0x${string}`[] = (deaths as { args: { player: `0x${string}` }; blockNumber: bigint }[])
            .filter(e => {
              const resolveBlock = (resolutions as { args: { round: bigint }; blockNumber: bigint }[])
                .find(r => Number(r.args.round) === round)?.blockNumber
              return resolveBlock !== undefined && e.blockNumber <= resolveBlock
                && (round === roundNums[0] || e.blockNumber > ((resolutions as { args: { round: bigint }; blockNumber: bigint }[])
                  .find(r => Number(r.args.round) === round - 1)?.blockNumber ?? 0n))
            })
            .map(e => e.args.player.toLowerCase() as `0x${string}`)

          // Apply damage
          for (const atk of roundAttacks) {
            const cur = healthMap[atk.target] ?? 0
            healthMap[atk.target] = Math.max(0, cur - atk.damage)
          }
          // Apply heals
          for (const addr of roundHeals) {
            healthMap[addr] = Math.min(100, (healthMap[addr] ?? 0) + 20)
          }
          // Apply deaths
          for (const addr of roundDeaths) {
            healthMap[addr] = 0
          }

          builtFrames.push({
            round,
            playerHealths: { ...healthMap },
            attacks: roundAttacks,
            deaths: roundDeaths,
            heals: roundHeals,
          })
        }

        setFrames(builtFrames)
      })
      .catch(() => setFrames([]))
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [gameEndBlock, playerKey])

  return { frames, loading }
}

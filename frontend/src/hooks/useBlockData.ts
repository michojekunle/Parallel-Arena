'use client'

import { useState, useEffect } from 'react'
import { createPublicClient, http } from 'viem'
import { monadTestnet } from '@/lib/constants'

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'),
})

export interface BlockData {
  number: bigint
  timestamp: number
  txCount: number
  /** Index of each queried tx in the block (-1 if not found) */
  ourTxIndices: number[]
}

/**
 * After a round resolves, fetch the block that contained the player txs.
 * Returns null until data arrives or if txHashes is empty.
 */
export function useBlockData(txHashes: `0x${string}`[]): BlockData | null {
  const [blockData, setBlockData] = useState<BlockData | null>(null)

  // Stable key — only re-fetch when the hash list actually changes
  const hashKey = txHashes.join(',')

  useEffect(() => {
    if (!txHashes.length) { setBlockData(null); return }
    let cancelled = false

    const firstHash = txHashes[0]
    publicClient
      .getTransactionReceipt({ hash: firstHash })
      .then(receipt =>
        publicClient.getBlock({ blockNumber: receipt.blockNumber, includeTransactions: true }),
      )
      .then(block => {
        if (cancelled) return
        const txList = block.transactions as { hash: string }[]
        const ourTxIndices = txHashes.map(h =>
          txList.findIndex(t => t.hash.toLowerCase() === h.toLowerCase()),
        )
        setBlockData({
          number: block.number!,
          timestamp: Number(block.timestamp),
          txCount: txList.length,
          ourTxIndices,
        })
      })
      .catch(() => {
        if (!cancelled) setBlockData(null)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hashKey])

  return blockData
}

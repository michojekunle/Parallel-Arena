#!/usr/bin/env node
// Separate process that resolves rounds automatically
// Run alongside agents: node autoResolve.js

import { createWalletClient, createPublicClient, http, parseAbi, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from './lib/chain.js'
import dotenv from 'dotenv'
dotenv.config()

const RESOLVER_KEY = process.env.RESOLVER_KEY || process.env.AGENT_KEY_0
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

if (!RESOLVER_KEY || !CONTRACT_ADDRESS) {
  console.error('ERROR: RESOLVER_KEY and CONTRACT_ADDRESS must be set in .env')
  process.exit(1)
}

const ABI = parseAbi([
  'function resolveRound() external',
  'function getGameState() external view returns (uint256, uint256, uint256, uint256, bool)',
])

const account = privateKeyToAccount(RESOLVER_KEY)
const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL),
})
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL),
})

let isResolving = false

async function tryResolve() {
  if (isResolving) return // prevent concurrent calls
  try {
    const [round, deadline,,, resolved] = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getGameState',
    })
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (!resolved && now >= deadline) {
      isResolving = true
      console.log(`[AutoResolve] Triggering resolution for round ${round}`)
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'resolveRound',
        gasPrice: parseGwei('200'),
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log(`[AutoResolve] ✅ Round ${round} resolved in block ${receipt.blockNumber}`)
    }
  } catch (e) {
    const skip = ['Already resolved', 'Round not ready', 'An existing transaction', 'higher priority']
    if (!skip.some(s => e.message.includes(s))) {
      console.error('[AutoResolve] Error:', e.message)
    }
  } finally {
    isResolving = false
  }
}

setInterval(tryResolve, 5000)
console.log('[AutoResolve] Daemon started — checking every 5s')
tryResolve()

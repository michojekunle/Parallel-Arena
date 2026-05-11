#!/usr/bin/env node
// Separate process that resolves rounds automatically
// Run alongside agents: node autoResolve.js

import { createWalletClient, createPublicClient, http, fallback, parseAbi, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from './lib/chain.js'
import dotenv from 'dotenv'
dotenv.config()

// Use master key (30+ MON) to ensure resolver never runs out of gas
const RESOLVER_KEY = process.env.PRIVATE_KEY || process.env.RESOLVER_KEY || process.env.AGENT_KEY_0
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

if (!RESOLVER_KEY || !CONTRACT_ADDRESS) {
  console.error('ERROR: RESOLVER_KEY and CONTRACT_ADDRESS must be set in .env')
  process.exit(1)
}

const ABI = parseAbi([
  'function resolveRound() external',
  // V2 renamed getGameState → getFullGameState with extra fields
  'function getFullGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved, uint256 pool, uint256 maxRounds, uint8 gamePhase, address[3] topWinners)',
])

// RPC fallback for resilience
const RPC_URLS = [
  process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  'https://monad-testnet.drpc.org',
].filter(Boolean)

const transport = fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 })))

const account = privateKeyToAccount(RESOLVER_KEY)
const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport,
})
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport,
})

let isResolving = false
let rateLimitBackoffUntil = 0

async function tryResolve() {
  if (isResolving) return // prevent concurrent calls

  // If we hit rate limit, back off exponentially
  if (Date.now() < rateLimitBackoffUntil) {
    return
  }

  try {
    const [round, deadline,,, resolved] = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getFullGameState',
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
    const shouldLog = !skip.some(s => e.message.includes(s))

    // Handle rate limiting with exponential backoff
    if (e.message.includes('requests limited') || e.message.includes('rate limit')) {
      rateLimitBackoffUntil = Date.now() + 5000 // back off 5 seconds
      if (shouldLog) console.warn('[AutoResolve] Rate limited — backing off 5s')
    } else if (shouldLog) {
      console.error('[AutoResolve] Error:', e.message)
    }
  } finally {
    isResolving = false
  }
}

setInterval(tryResolve, 7500) // slightly longer interval (7.5s) to reduce RPC load
console.log('[AutoResolve] Daemon started — checking every 7.5s')
tryResolve()

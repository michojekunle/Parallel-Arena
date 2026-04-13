#!/usr/bin/env node
// Auto-reset daemon — continuously restarts games after they end
// Run alongside autoResolve.js: node scripts/autoReset.js
// This enables infinite game loops without admin intervention.

import { createWalletClient, createPublicClient, http, fallback, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from './lib/chain.js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const RESET_KEY = process.env.RESET_KEY || process.env.PRIVATE_KEY
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

if (!RESET_KEY || !CONTRACT_ADDRESS) {
  console.error('ERROR: RESET_KEY/PRIVATE_KEY and CONTRACT_ADDRESS must be set')
  process.exit(1)
}

// RPC Fallback for resilience
const RPC_URLS = [
  process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  'https://testnet-rpc2.monad.xyz',
].filter(Boolean)

const transport = fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 })))

const account = privateKeyToAccount(RESET_KEY)
const walletClient = createWalletClient({ account, chain: monadTestnet, transport })
const publicClient = createPublicClient({ chain: monadTestnet, transport })

let isResetting = false

async function tryReset() {
  if (isResetting) return
  try {
    // Check game state: phase 2 = ENDED
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: [
        {
          type: 'function',
          name: 'getFullGameState',
          inputs: [],
          outputs: [
            { name: 'round', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'activePlayers', type: 'uint256' },
            { name: 'totalPlayers', type: 'uint256' },
            { name: 'resolved', type: 'bool' },
            { name: 'pool', type: 'uint256' },
            { name: 'maxRounds', type: 'uint256' },
            { name: 'phase', type: 'uint8' },
            { name: 'topWinners', type: 'tuple', components: [
              { name: 'addr1', type: 'address' },
              { name: 'addr2', type: 'address' },
              { name: 'addr3', type: 'address' },
            ]},
          ],
          stateMutability: 'view',
        },
      ],
      functionName: 'getFullGameState',
    })

    const [, , , , , , , phase] = result as unknown[]
    const ENDED = 2

    if (Number(phase) === ENDED) {
      isResetting = true
      console.log(`[AutoReset] Game ended (phase=${phase}) — calling resetGame()`)

      try {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: [
          {
            type: 'function',
            name: 'resetGame',
            inputs: [],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
          functionName: 'resetGame',
          gasPrice: parseGwei('250'),
        })

        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        console.log(`[AutoReset] ✅ Game reset in block ${receipt.blockNumber}`)
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr)
        // Ignore expected errors
        if (!['Game not ended', 'not yet claimable', 'An existing transaction'].some(s => msg.includes(s))) {
          console.error('[AutoReset] Write error:', msg.slice(0, 100))
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('Unknown')) {
      console.error('[AutoReset] Read error:', msg.slice(0, 100))
    }
  } finally {
    isResetting = false
  }
}

// Check every 5s for ended games
setInterval(tryReset, 5000)
console.log('[AutoReset] Daemon started — checking every 5s for ended games')
tryReset()

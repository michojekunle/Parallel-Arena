#!/usr/bin/env node
// =============================================================
// PARALLEL ARENA — AI AGENT SWARM
// Demonstrates parallel tx submission: Promise.all sends N txs
// simultaneously. This is what Monad was built for.
// =============================================================

import { createWalletClient, createPublicClient, http, parseAbi, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from './lib/chain.js'
import dotenv from 'dotenv'
dotenv.config()

const NUM_AGENTS = parseInt(process.env.NUM_AGENTS || '10')
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const RPC_URL = process.env.MONAD_RPC_URL

if (!CONTRACT_ADDRESS) {
  console.error('ERROR: CONTRACT_ADDRESS not set in .env')
  process.exit(1)
}

const ACTIONS = [1, 1, 1, 2, 3] // weighted toward attack
const ACTION_NAMES = { 1: 'ATTACK', 2: 'DEFEND', 3: 'HEAL' }

const ABI = parseAbi([
  'function joinArena() external',
  'function submitAction(uint8 action) external',
  'function resolveRound() external',
  'function getGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved)',
  'function getMyAction(uint256 round) external view returns (uint8)',
])

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// =============================================================
// AGENT CLASS
// =============================================================

class Agent {
  constructor(id, privateKey) {
    this.id = id
    this.account = privateKeyToAccount(privateKey)
    this.client = createWalletClient({
      account: this.account,
      chain: monadTestnet,
      transport: http(RPC_URL),
    })
    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(RPC_URL),
    })
    this.address = this.account.address
    this.joined = false
  }

  async join() {
    try {
      const hash = await this.client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'joinArena',
        gasPrice: parseGwei('200'),
      })
      await this.publicClient.waitForTransactionReceipt({ hash })
      this.joined = true
      console.log(`[Agent ${this.id}] ✅ Joined arena — ${this.address.slice(0,6)}...`)
    } catch (e) {
      if (e.message.includes('Already in arena')) {
        this.joined = true
        console.log(`[Agent ${this.id}] Already in arena`)
      } else {
        console.error(`[Agent ${this.id}] Join failed:`, e.message)
      }
    }
  }

  pickAction() {
    return ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
  }

  async submitAction(round) {
    const action = this.pickAction()
    // Random delay 0-500ms to create realistic parallel spread
    await sleep(Math.random() * 500)

    try {
      const hash = await this.client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitAction',
        args: [action],
        gasPrice: parseGwei('200'),
      })
      // Don't wait for receipt — fire and continue
      console.log(`[Agent ${this.id}] 📤 Round ${round}: ${ACTION_NAMES[action]} — tx ${hash.slice(0,10)}...`)
      return { success: true, hash, action }
    } catch (e) {
      if (!e.message.includes('Already acted')) {
        console.error(`[Agent ${this.id}] submitAction failed:`, e.message)
      }
      return { success: false }
    }
  }
}

// =============================================================
// SWARM CONTROLLER
// =============================================================

async function loadAgents() {
  const agents = []
  for (let i = 0; i < NUM_AGENTS; i++) {
    const key = process.env[`AGENT_KEY_${i}`]
    if (!key) {
      console.warn(`Missing AGENT_KEY_${i}, skipping`)
      continue
    }
    agents.push(new Agent(i, key))
  }
  return agents
}

async function joinPhase(agents) {
  console.log('\n🏟️  JOIN PHASE — Agents entering arena...')
  await Promise.all(agents.map(a => a.join()))
  console.log(`✅ ${agents.filter(a => a.joined).length} agents ready\n`)
}

async function actionPhase(agents, round) {
  const active = agents.filter(a => a.joined)
  console.log(`\n⚡ ROUND ${round} — PARALLEL ACTION PHASE`)
  console.log(`   Sending ${active.length} transactions SIMULTANEOUSLY...`)
  console.log('   ' + '─'.repeat(50))

  const t0 = Date.now()

  // THIS IS THE KEY MOMENT:
  // Promise.all fires all transactions at the same time.
  // On Monad, these are executed in parallel.
  // On legacy chains, they'd queue sequentially.
  const results = await Promise.all(
    active.map(agent => agent.submitAction(round))
  )

  const elapsed = Date.now() - t0
  const successes = results.filter(r => r.success).length

  console.log('   ' + '─'.repeat(50))
  console.log(`⚡ ${successes} actions fired in ${elapsed}ms (wall time)`)
  console.log(`   That's ${successes} parallel transactions, not sequential.`)
  console.log()
}

async function resolvePhase(resolverAgent, round) {
  console.log(`\n🔨 RESOLVING ROUND ${round}...`)
  try {
    const hash = await resolverAgent.client.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'resolveRound',
      gasPrice: parseGwei('200'),
    })
    const receipt = await resolverAgent.publicClient.waitForTransactionReceipt({ hash })
    console.log(`✅ Round ${round} resolved in block ${receipt.blockNumber}`)
    console.log(`   All parallel actions → 1 block → done.`)
  } catch (e) {
    console.error('Resolve failed:', e.message)
  }
}

async function getGameState(client) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getGameState',
  })
}

// =============================================================
// MAIN LOOP
// =============================================================

async function main() {
  console.log('╔═══════════════════════════════════════╗')
  console.log('║        PARALLEL ARENA — AGENTS        ║')
  console.log(`║     ${NUM_AGENTS} AI agents entering the arena  ║`)
  console.log('╚═══════════════════════════════════════╝\n')

  const agents = await loadAgents()
  if (agents.length === 0) {
    console.error('No agents found. Check your .env file.')
    process.exit(1)
  }

  await joinPhase(agents)

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(RPC_URL),
  })

  let lastRound = -1

  while (true) {
    try {
      const [round, deadline, activePlayers,, resolved] = await getGameState(publicClient)
      const roundNum = Number(round)

      if (roundNum !== lastRound && !resolved) {
        lastRound = roundNum
        await actionPhase(agents, roundNum)
      }

      // Auto-resolve check
      const now = BigInt(Math.floor(Date.now() / 1000))
      if (!resolved && now >= deadline) {
        await resolvePhase(agents[0], roundNum)
      }
    } catch (err) {
      console.error('Network catch:', err.message)
    }

    await sleep(3000)
  }
}

main().catch(console.error)

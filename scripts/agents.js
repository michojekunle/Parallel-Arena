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

const ENTRY_FEE = 10_000_000_000_000_000n // 0.01 MON in wei

// GamePhase enum values from contract
const GamePhase = { WAITING: 0, ACTIVE: 1, ENDED: 2 }

const ABI = parseAbi([
  'function joinArena() external payable',
  'function submitAction(uint8 action) external',
  'function resolveRound() external',
  'function resetGame() external',
  'function getFullGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved, uint256 pool, uint256 maxRounds, uint8 gamePhase, address[3] topWinners)',
  'function getPlayer(address addr) external view returns (address addr, uint256 health, uint256 attack, uint256 defense, uint8 status, uint256 roundsPlayed, uint256 kills, uint256 rank)',
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
    this.dead = false
  }

  // Check on-chain if this agent is still an active player
  async syncStatus() {
    try {
      const player = await this.publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPlayer',
        args: [this.address],
      })
      // status: 0=INACTIVE, 1=ACTIVE, 2=DEAD
      const status = Number(player[4])
      this.joined = status === 1
      this.dead   = status === 2
    } catch {
      this.joined = false
      this.dead   = false
    }
  }

  async join() {
    // Don't try to join if already confirmed active on-chain
    await this.syncStatus()
    if (this.joined) {
      console.log(`[Agent ${this.id}] Already active on-chain — skipping join`)
      return
    }
    if (this.dead) {
      console.log(`[Agent ${this.id}] Was eliminated — will rejoin next game`)
      return
    }

    try {
      const hash = await this.client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'joinArena',
        value: ENTRY_FEE,
        gasPrice: parseGwei('200'),
      })
      await this.publicClient.waitForTransactionReceipt({ hash })
      this.joined = true
      this.dead   = false
      console.log(`[Agent ${this.id}] ✅ Joined arena — ${this.address.slice(0,6)}...`)
    } catch (e) {
      if (e.message.includes('Already in arena')) {
        this.joined = true
        console.log(`[Agent ${this.id}] Already in arena`)
      } else {
        console.error(`[Agent ${this.id}] Join failed:`, e.message.slice(0, 80))
      }
    }
  }

  // Reset local state when a new game starts (after resetGame())
  reset() {
    this.joined = false
    this.dead   = false
  }

  async pickAction() {
    try {
      const player = await this.publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPlayer',
        args: [this.address],
      })
      // status: 0=INACTIVE, 1=ACTIVE, 2=DEAD
      const hp = Number(player[1])

      // DECISION ENGINE:
      // 1. If critical (HP < 30), high chance to Heal
      if (hp < 30) {
        return Math.random() < 0.7 ? 3 : (Math.random() < 0.5 ? 2 : 1)
      }
      // 2. If healthy (HP > 90), high chance to Attack
      if (hp > 90) {
        return Math.random() < 0.8 ? 1 : (Math.random() < 0.5 ? 2 : 3)
      }
    } catch (e) {
      // Fallback to weighted random if fetch fails
    }
    return ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
  }

  async submitAction(round) {
    if (!this.joined || this.dead) return { success: false }

    const action = await this.pickAction()
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
      // Don't wait for receipt — fire and move on (true parallel demo)
      console.log(`[Agent ${this.id}] 📤 Round ${round}: ${ACTION_NAMES[action]} — tx ${hash.slice(0,10)}...`)
      return { success: true, hash, action }
    } catch (e) {
      if (e.message.includes('Already acted')) return { success: false }
      if (e.message.includes('Not an active player')) {
        // Agent was eliminated — update local state
        this.joined = false
        this.dead   = true
        console.log(`[Agent ${this.id}] ☠ Eliminated`)
        return { success: false }
      }
      console.error(`[Agent ${this.id}] submitAction failed:`, e.message.slice(0, 80))
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
  // Join in parallel — this itself demonstrates Monad
  await Promise.all(agents.map(a => a.join()))
  const ready = agents.filter(a => a.joined).length
  console.log(`✅ ${ready}/${agents.length} agents active in arena\n`)
}

async function actionPhase(agents, round) {
  const active = agents.filter(a => a.joined && !a.dead)
  if (active.length === 0) {
    console.log(`[Round ${round}] No active agents to act`)
    return
  }

  console.log(`\n⚡ ROUND ${round} — PARALLEL ACTION PHASE`)
  console.log(`   Sending ${active.length} transactions SIMULTANEOUSLY...`)
  console.log('   ' + '─'.repeat(50))

  const t0 = Date.now()

  // THE KEY MOMENT: all txs fire at the same time.
  // On Monad these are executed in parallel — not sequential.
  const results = await Promise.all(active.map(agent => agent.submitAction(round)))

  const elapsed = Date.now() - t0
  const successes = results.filter(r => r.success).length

  console.log('   ' + '─'.repeat(50))
  console.log(`⚡ ${successes} actions fired in ${elapsed}ms (wall time)`)
  console.log(`   ${successes} parallel transactions — not sequential.`)
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
    const skip = ['Already resolved', 'Round not ready', 'Game not active']
    if (!skip.some(s => e.message.includes(s))) {
      console.error('Resolve failed:', e.message.slice(0, 100))
    }
  }
}

async function resetPhase(resolverAgent) {
  console.log('\n🔄 GAME ENDED — Resetting for next session...')
  try {
    const hash = await resolverAgent.client.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'resetGame',
      gasPrice: parseGwei('200'),
    })
    await resolverAgent.publicClient.waitForTransactionReceipt({ hash })
    console.log('✅ Game reset — new session ready')
  } catch (e) {
    if (!e.message.includes('Game not ended')) {
      console.error('Reset failed:', e.message.slice(0, 100))
    }
  }
}

async function getFullState(client) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getFullGameState',
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

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(RPC_URL),
  })

  let lastRound = -1
  let lastPhase = -1

  // Initial join
  await joinPhase(agents)

  while (true) {
    try {
      const state = await getFullState(publicClient)
      const round    = Number(state[0])
      const deadline = state[1]
      const resolved = state[4]
      const phase    = Number(state[7]) // 0=WAITING, 1=ACTIVE, 2=ENDED

      // ── Game ended → auto-reset, then all agents re-join ──
      if (phase === GamePhase.ENDED) {
        if (lastPhase !== GamePhase.ENDED) {
          console.log('\n🏆 GAME OVER — top 3 winners set on-chain')
          lastPhase = GamePhase.ENDED
          await sleep(3000) // brief pause before auto-reset
          await resetPhase(agents[0])
          // Reset local agent state so they re-join next iteration
          agents.forEach(a => a.reset())
          lastRound = -1
        }
        await sleep(3000)
        continue
      }

      // ── WAITING: game just reset — agents need to re-join ──
      if (phase === GamePhase.WAITING) {
        lastPhase = GamePhase.WAITING
        const anyJoined = agents.some(a => a.joined)
        if (!anyJoined) {
          console.log('\n⏳ New session detected — agents joining...')
          await joinPhase(agents)
        }
        await sleep(3000)
        continue
      }

      // ── ACTIVE ──
      lastPhase = GamePhase.ACTIVE

      // New round detected — fire parallel actions
      if (round !== lastRound && !resolved) {
        lastRound = round
        await actionPhase(agents, round)
      }

      // Auto-resolve when deadline passes
      const now = BigInt(Math.floor(Date.now() / 1000))
      if (!resolved && deadline > 0n && now >= deadline) {
        await resolvePhase(agents[0], round)
      }

    } catch (err) {
      console.error('Network error:', err.message.slice(0, 100))
    }

    await sleep(3000)
  }
}

main().catch(console.error)

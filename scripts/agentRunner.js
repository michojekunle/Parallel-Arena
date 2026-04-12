#!/usr/bin/env node
// =============================================================
// PARALLEL ARENA — INTELLIGENT AGENT RUNNER
//
// This runner manages registered AI agents on-chain. Each agent
// has a strategy (RANDOM / AGGRESSIVE / DEFENSIVE / ADAPTIVE).
// The runner signs EIP-712 permits on behalf of each agent
// and submits via the relayer key — agents pay no gas.
//
// Setup:
//   1. Register agents on-chain via the UI (owner pays 0.05 MON)
//   2. Set AGENT_KEY_<n> env vars (private keys for each agent EOA)
//   3. Run: node scripts/agentRunner.js
// =============================================================

import { createWalletClient, createPublicClient, http, parseAbi, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from './lib/chain.js'
import dotenv from 'dotenv'
dotenv.config()

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const RELAYER_KEY      = process.env.RELAYER_PRIVATE_KEY
const RPC_URL          = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'
const NUM_AGENTS       = parseInt(process.env.NUM_AGENTS || '10')

if (!CONTRACT_ADDRESS) { console.error('ERROR: CONTRACT_ADDRESS not set'); process.exit(1) }
if (!RELAYER_KEY)      { console.error('ERROR: RELAYER_PRIVATE_KEY not set'); process.exit(1) }

// ── ABI (subset needed by runner) ───────────────────────────
const ABI = parseAbi([
  'struct Player { address addr; uint256 health; uint256 attack; uint256 defense; uint8 status; uint256 roundsPlayed; uint256 kills; uint256 rank; }',
  'struct AgentInfo { address owner; uint8 strategy; uint256 balance; bool active; uint256 gamesPlayed; uint256 totalKills; uint256 topThreeFinishes; }',
  'function joinArena() external payable',
  'function resolveRound() external',
  'function resetGame() external',
  'function getFullGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved, uint256 pool, uint256 maxRounds, uint8 gamePhase, address[3] topWinners)',
  'function getPlayer(address addr) external view returns (Player)',
  'function getAllAgents() external view returns (address[] addrs, AgentInfo[] infos)',
  'function getAgentInfo(address agentAddress) external view returns (AgentInfo)',
  'function isRegisteredAgent(address agent) external view returns (bool)',
  'function agentJoinArena(address agentAddress) external',
  'function submitActionWithPermit(address player, uint8 action, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  'function nonces(address player) external view returns (uint256)',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
  'function getRoundResult(uint256 round) external view returns (uint256 round_, uint256 actionsProcessed, uint256 attacksLanded, uint256 healsApplied, uint256 defendersProtected, uint256 playersEliminated, uint256 resolvedAt)',
])

// ── Strategy enum (must match contract) ─────────────────────
const AgentStrategy = { RANDOM: 0, AGGRESSIVE: 1, DEFENSIVE: 2, ADAPTIVE: 3 }
const GamePhase     = { WAITING: 0, ACTIVE: 1, ENDED: 2 }
const ACTION        = { ATTACK: 1, DEFEND: 2, HEAL: 3 }
const ACTION_NAMES  = { 1: 'ATTACK', 2: 'DEFEND', 3: 'HEAL' }

const ENTRY_FEE = 10_000_000_000_000_000n // 0.01 MON

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── EIP-712 helpers ──────────────────────────────────────────

async function getDomainSeparator(publicClient) {
  return publicClient.readContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: 'DOMAIN_SEPARATOR',
  })
}

function buildActionPermitDigest(domainSeparator, player, action, round, nonce, deadline) {
  const ACTION_PERMIT_TYPEHASH = '0x' + Buffer.from(
    // keccak256("ActionPermit(address player,uint8 action,uint256 round,uint256 nonce,uint256 deadline)")
    'ActionPermit(address player,uint8 action,uint256 round,uint256 nonce,uint256 deadline)'
  ).toString('hex') // We compute this properly below

  // Use viem's hashTypedData equivalent
  return {
    domain: {
      name: 'ParallelArena',
      version: '1',
      chainId: monadTestnet.id,
      verifyingContract: CONTRACT_ADDRESS,
    },
    types: {
      ActionPermit: [
        { name: 'player',   type: 'address' },
        { name: 'action',   type: 'uint8'   },
        { name: 'round',    type: 'uint256' },
        { name: 'nonce',    type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'ActionPermit',
    message: { player, action: BigInt(action), round: BigInt(round), nonce: BigInt(nonce), deadline: BigInt(deadline) },
  }
}

function splitSig(sig) {
  return {
    r: sig.slice(0, 66),
    s: '0x' + sig.slice(66, 130),
    v: parseInt(sig.slice(130, 132), 16),
  }
}

// ── Round history tracking (for ADAPTIVE strategy) ──────────

class RoundHistory {
  constructor() {
    this.rounds = [] // { attacksLanded, healsApplied, defendersProtected, playersEliminated }
  }

  record(result) {
    this.rounds.push(result)
  }

  // Returns recommended action based on recent patterns
  recommend(myHp, totalPlayers) {
    const recent = this.rounds.slice(-3)
    const avgAttacks    = recent.reduce((s, r) => s + Number(r.attacksLanded), 0) / Math.max(recent.length, 1)
    const avgHeals      = recent.reduce((s, r) => s + Number(r.healsApplied), 0) / Math.max(recent.length, 1)
    const avgDefenders  = recent.reduce((s, r) => s + Number(r.defendersProtected), 0) / Math.max(recent.length, 1)
    const avgEliminated = recent.reduce((s, r) => s + Number(r.playersEliminated), 0) / Math.max(recent.length, 1)

    // Critical health — prioritise heal
    if (myHp < 25) return ACTION.HEAL
    // Many attackers flying this game and not many defenders — defend
    if (avgAttacks > totalPlayers * 0.6 && avgDefenders < totalPlayers * 0.3) return ACTION.DEFEND
    // Lots of eliminations happening — heal to survive if medium health
    if (avgEliminated >= 1 && myHp < 60) return ACTION.HEAL
    // Healthy — attack to get kills (and a share of ranking)
    return ACTION.ATTACK
  }
}

// ── Agent class ──────────────────────────────────────────────

class Agent {
  constructor(id, privateKey, strategy) {
    this.id       = id
    this.account  = privateKeyToAccount(privateKey)
    this.address  = this.account.address
    this.strategy = strategy ?? AgentStrategy.ADAPTIVE
    this.joined   = false
    this.dead     = false
    this.history  = new RoundHistory()
  }

  reset() { this.joined = false; this.dead = false }

  async syncStatus(publicClient) {
    try {
      const player = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getPlayer', args: [this.address],
      })
      const status = Number(player[4])
      this.joined = status === 1
      this.dead   = status === 2
    } catch { this.joined = false; this.dead = false }
  }

  async pickAction(publicClient, round, totalPlayers) {
    let myHp = 100
    try {
      const player = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getPlayer', args: [this.address],
      })
      myHp = Number(player[1])
    } catch { /* use default */ }

    switch (this.strategy) {
      case AgentStrategy.RANDOM:
        return [ACTION.ATTACK, ACTION.ATTACK, ACTION.ATTACK, ACTION.DEFEND, ACTION.HEAL][
          Math.floor(Math.random() * 5)
        ]

      case AgentStrategy.AGGRESSIVE:
        return ACTION.ATTACK

      case AgentStrategy.DEFENSIVE:
        if (myHp < 40) return ACTION.HEAL
        if (myHp < 70) return ACTION.DEFEND
        return ACTION.ATTACK

      case AgentStrategy.ADAPTIVE:
      default:
        return this.history.recommend(myHp, totalPlayers)
    }
  }

  async submitActionViaPermit(relayerAccount, walletClient, publicClient, round, totalPlayers) {
    if (!this.joined || this.dead) return { success: false }

    const action   = await this.pickAction(publicClient, round, totalPlayers)
    const nonce    = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: 'nonces', args: [this.address],
    })
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60)

    // Sign the ActionPermit with the AGENT's own key
    // (runner holds agent private key; signs on agent's behalf)
    const agentWalletClient = createWalletClient({
      account: this.account,
      chain: monadTestnet,
      transport: http(RPC_URL),
    })

    const typedData = buildActionPermitDigest(null, this.address, action, round, nonce, deadline)
    let signature
    try {
      signature = await agentWalletClient.signTypedData(typedData)
    } catch (e) {
      console.error(`[Agent ${this.id}] Sign failed:`, e.message.slice(0, 60))
      return { success: false }
    }

    const { v, r, s } = splitSig(signature)

    // Relayer submits on chain (pays gas)
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitActionWithPermit',
        args: [this.address, action, nonce, deadline, v, r, s],
        gasPrice: parseGwei('200'),
      })
      console.log(`[Agent ${this.id}] 📤 Round ${round}: ${ACTION_NAMES[action]} tx ${hash.slice(0, 10)}…`)
      return { success: true, hash, action }
    } catch (e) {
      if (e.message.includes('Already acted')) return { success: false }
      if (e.message.includes('Not active')) {
        this.dead = true; this.joined = false
        console.log(`[Agent ${this.id}] ☠ Eliminated`)
      } else {
        console.error(`[Agent ${this.id}] Permit submit failed:`, e.message.slice(0, 80))
      }
      return { success: false }
    }
  }
}

// ── Relayer client (pays gas for all permit submissions) ──────

function buildRelayerClient() {
  const relayerAccount = privateKeyToAccount(RELAYER_KEY)
  const walletClient   = createWalletClient({
    account: relayerAccount,
    chain: monadTestnet,
    transport: http(RPC_URL),
  })
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) })
  console.log(`🔑 Relayer: ${relayerAccount.address}`)
  return { relayerAccount, walletClient, publicClient }
}

// ── Load agents: combine on-chain registry + env private keys ─

async function loadAgents(publicClient) {
  const agents = []

  // First, load any on-chain registered agents whose keys we have
  try {
    const [addrs, infos] = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getAllAgents',
    })
    for (let i = 0; i < addrs.length; i++) {
      const addr     = addrs[i].toLowerCase()
      const strategy = Number(infos[i].strategy)
      // Find matching private key in env
      for (let j = 0; j < NUM_AGENTS; j++) {
        const key = process.env[`AGENT_KEY_${j}`]
        if (!key) continue
        const account = privateKeyToAccount(key)
        if (account.address.toLowerCase() === addr) {
          agents.push(new Agent(j, key, strategy))
          console.log(`✅ Loaded registered agent ${j}: ${addr.slice(0,8)}… strategy=${Object.keys(AgentStrategy)[strategy]}`)
          break
        }
      }
    }
  } catch (e) {
    console.warn('Could not load on-chain agents:', e.message.slice(0, 60))
  }

  // Fallback: load unregistered agents from env keys (play as regular players)
  const registeredAddrs = new Set(agents.map(a => a.address.toLowerCase()))
  for (let i = 0; i < NUM_AGENTS; i++) {
    const key = process.env[`AGENT_KEY_${i}`]
    if (!key) continue
    const account = privateKeyToAccount(key)
    if (!registeredAddrs.has(account.address.toLowerCase())) {
      agents.push(new Agent(i, key, AgentStrategy.ADAPTIVE))
      console.log(`ℹ️  Unregistered agent ${i}: ${account.address.slice(0,8)}… (plays as regular player)`)
    }
  }

  return agents
}

// ── Phase handlers ────────────────────────────────────────────

async function joinPhase(agents, walletClient, publicClient) {
  console.log('\n🏟️  JOIN PHASE')
  await Promise.all(agents.map(async agent => {
    await agent.syncStatus(publicClient)
    if (agent.joined) { console.log(`[Agent ${agent.id}] Already in arena`); return }
    if (agent.dead)   { return }

    try {
      // Check if on-chain registered agent (runner calls agentJoinArena via relayer)
      const isReg = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'isRegisteredAgent', args: [agent.address],
      })

      let hash
      if (isReg) {
        // Relayer calls agentJoinArena (deducts from agent's on-chain balance)
        hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS, abi: ABI, functionName: 'agentJoinArena',
          args: [agent.address], gasPrice: parseGwei('200'),
        })
      } else {
        // Unregistered: agent sends joinArena directly from its own wallet
        const agentWalletClient = createWalletClient({
          account: agent.account, chain: monadTestnet, transport: http(RPC_URL),
        })
        hash = await agentWalletClient.writeContract({
          address: CONTRACT_ADDRESS, abi: ABI, functionName: 'joinArena',
          value: ENTRY_FEE, gasPrice: parseGwei('200'),
        })
      }

      await publicClient.waitForTransactionReceipt({ hash })
      agent.joined = true
      console.log(`[Agent ${agent.id}] ✅ Joined — ${agent.address.slice(0,8)}…`)
    } catch (e) {
      if (e.message.includes('Already in arena')) { agent.joined = true; return }
      if (e.message.includes('Insufficient agent balance')) {
        console.log(`[Agent ${agent.id}] ⚠ Insufficient balance — needs top up in UI`)
        return
      }
      console.error(`[Agent ${agent.id}] Join failed:`, e.message.slice(0, 80))
    }
  }))
  const ready = agents.filter(a => a.joined).length
  console.log(`✅ ${ready}/${agents.length} agents active\n`)
}

async function actionPhase(agents, walletClient, publicClient, round, totalPlayers) {
  const active = agents.filter(a => a.joined && !a.dead)
  if (active.length === 0) return

  console.log(`\n⚡ ROUND ${round} — ${active.length} agents acting in parallel`)
  const t0 = Date.now()

  // Add a small random delay per agent to spread the parallel load visually
  const results = await Promise.all(active.map(async agent => {
    await sleep(Math.random() * 300)
    return agent.submitActionViaPermit(null, walletClient, publicClient, round, totalPlayers)
  }))

  const ok = results.filter(r => r.success).length
  console.log(`⚡ ${ok} actions submitted in ${Date.now() - t0}ms`)
}

async function resolvePhase(walletClient, publicClient, round) {
  console.log(`\n🔨 RESOLVING ROUND ${round}…`)
  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: 'resolveRound', gasPrice: parseGwei('200'),
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`✅ Round ${round} resolved in block ${receipt.blockNumber}`)

    // Fetch result for ADAPTIVE strategy history
    try {
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getRoundResult', args: [BigInt(round)],
      })
      const roundResult = {
        attacksLanded: result[2], healsApplied: result[3],
        defendersProtected: result[4], playersEliminated: result[5],
      }
      // Share history with all ADAPTIVE agents
      agents_global.forEach(a => {
        if (a.strategy === AgentStrategy.ADAPTIVE) a.history.record(roundResult)
      })
    } catch { /* non-fatal */ }
  } catch (e) {
    const skip = ['Already resolved', 'Round not ready', 'Game not active']
    if (!skip.some(s => e.message.includes(s))) {
      console.error('Resolve failed:', e.message.slice(0, 100))
    }
  }
}

async function resetPhase(walletClient, publicClient) {
  console.log('\n🔄 GAME ENDED — Resetting…')
  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: 'resetGame', gasPrice: parseGwei('200'),
    })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log('✅ Game reset — new session starting')
  } catch (e) {
    if (!e.message.includes('Game not ended')) console.error('Reset failed:', e.message.slice(0, 100))
  }
}

// ── Main loop ────────────────────────────────────────────────

let agents_global = [] // global ref so resolvePhase can update history

async function main() {
  console.log('╔═══════════════════════════════════════════╗')
  console.log('║   PARALLEL ARENA — INTELLIGENT RUNNER     ║')
  console.log('╚═══════════════════════════════════════════╝\n')

  const { relayerAccount, walletClient, publicClient } = buildRelayerClient()

  agents_global = await loadAgents(publicClient)
  if (agents_global.length === 0) {
    console.warn('No agents loaded. Set AGENT_KEY_0, AGENT_KEY_1, … in .env')
    console.warn('Running in resolver-only mode.')
  }

  let lastRound = -1
  let lastPhase = -1

  if (agents_global.length > 0) {
    await joinPhase(agents_global, walletClient, publicClient)
  }

  while (true) {
    try {
      const state     = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getFullGameState',
      })
      const round     = Number(state[0])
      const deadline  = state[1]
      const resolved  = state[4]
      const phase     = Number(state[7])
      const totalPlayers = Number(state[2])

      if (phase === GamePhase.ENDED) {
        if (lastPhase !== GamePhase.ENDED) {
          console.log('\n🏆 GAME OVER')
          lastPhase = GamePhase.ENDED
          await sleep(3000)
          await resetPhase(walletClient, publicClient)
          agents_global.forEach(a => a.reset())
          lastRound = -1
        }
        await sleep(3000)
        continue
      }

      if (phase === GamePhase.WAITING) {
        lastPhase = GamePhase.WAITING
        if (!agents_global.some(a => a.joined)) {
          console.log('\n⏳ New session — joining…')
          await joinPhase(agents_global, walletClient, publicClient)
        }
        await sleep(3000)
        continue
      }

      lastPhase = GamePhase.ACTIVE

      if (round !== lastRound && !resolved) {
        lastRound = round
        await actionPhase(agents_global, walletClient, publicClient, round, totalPlayers)
      }

      const now = BigInt(Math.floor(Date.now() / 1000))
      if (!resolved && deadline > 0n && now >= deadline) {
        await resolvePhase(walletClient, publicClient, round)
      }

    } catch (err) {
      console.error('Loop error:', err.message.slice(0, 100))
    }

    await sleep(3000)
  }
}

main().catch(console.error)

#!/usr/bin/env node
/**
 * Balance Manager — Unified gas pool for all agents
 *
 * Collects MON from all agents into master account, then redistributes
 * evenly. Runs periodically to ensure no agent ever runs dry.
 *
 * Usage: node scripts/balanceManager.js
 */

import { createWalletClient, createPublicClient, http, fallback, parseEther, formatEther, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

// ─── Config ─────────────────────────────────────────────────────────────────
const MASTER_KEY = process.env.PRIVATE_KEY
const AGENT_KEYS = []
const RPC_URLS = [
  process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
].filter(Boolean)

// Gas cost breakdown per game (200 Gwei on Monad testnet):
//   joinArena:    ~400k gas × 200 Gwei = 0.08 MON + 0.01 entry fee = 0.09 MON
//   submitAction: ~50k gas × 200 Gwei  = 0.01 MON per round
//   5 rounds = ~0.14 MON total per agent per game
//   Safe minimum: 0.5 MON (allows ~3 full games before needing rebalance)
const MIN_AGENT_BALANCE = parseEther('0.3')
// Target balance per agent after rebalance — 1 MON = ~7 full games
const TARGET_AGENT_BALANCE = parseEther('1.0')
// Master account minimum buffer (reserved, never distributed)
const MASTER_MIN_BUFFER = parseEther('0.5')

if (!MASTER_KEY) {
  console.error('ERROR: PRIVATE_KEY not set in .env')
  process.exit(1)
}

for (let i = 0; i < 20; i++) {
  const key = process.env[`AGENT_KEY_${i}`]
  if (key) AGENT_KEYS.push(key)
}

if (AGENT_KEYS.length === 0) {
  console.warn('WARN: No AGENT_KEY_n found in .env')
}

// ─── Clients ────────────────────────────────────────────────────────────────
const transport = fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 })))
const publicClient = createPublicClient({ chain: { id: 10143 }, transport })
const masterAccount = privateKeyToAccount(MASTER_KEY)
const masterWallet = createWalletClient({ account: masterAccount, chain: { id: 10143 }, transport })

// ─── Structured logging ──────────────────────────────────────────────────────
function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }))
}

// ─── Core logic ──────────────────────────────────────────────────────────────

async function getAgentBalance(key) {
  const account = privateKeyToAccount(key)
  return publicClient.getBalance({ address: account.address })
}

async function getMasterBalance() {
  return publicClient.getBalance({ address: masterAccount.address })
}

async function collectFromAgents() {
  log('info', 'Collecting gas from agents into master account')

  const agentsWithBalance = []
  for (const key of AGENT_KEYS) {
    const account = privateKeyToAccount(key)
    const balance = await getAgentBalance(key)
    agentsWithBalance.push({ address: account.address, balance, key })
    log('debug', 'Agent balance checked', { address: account.address, balance: formatEther(balance) })
  }

  // Collect from agents with > 0.02 MON (keep small buffer for them)
  const collectionThreshold = parseEther('0.02')
  let totalCollected = 0n

  for (const agent of agentsWithBalance) {
    if (agent.balance > collectionThreshold) {
      const amountToSend = agent.balance - collectionThreshold
      try {
        const hash = await createWalletClient({
          account: privateKeyToAccount(agent.key),
          chain: { id: 10143 },
          transport,
        }).sendTransaction({
          to: masterAccount.address,
          value: amountToSend,
          gasPrice: parseGwei('250'),
        })

        await publicClient.waitForTransactionReceipt({ hash })
        totalCollected += amountToSend
        log('info', 'Collected from agent', {
          from: agent.address,
          amount: formatEther(amountToSend),
          hash,
        })
      } catch (err) {
        log('error', 'Failed to collect from agent', {
          agent: agent.address,
          error: err.message,
        })
      }
    }
  }

  log('info', 'Collection complete', { totalCollected: formatEther(totalCollected) })
  return totalCollected
}

async function redistributeToAgents() {
  log('info', 'Redistributing gas evenly to all agents')

  const masterBalance = await getMasterBalance()
  log('info', 'Master balance before redistribution', { balance: formatEther(masterBalance) })

  // Calculate per-agent allocation: (total - buffer) / num_agents
  const availableBalance = masterBalance > MASTER_MIN_BUFFER ? masterBalance - MASTER_MIN_BUFFER : 0n
  const perAgentAmount = availableBalance / BigInt(AGENT_KEYS.length)

  log('info', 'Redistribution plan', {
    masterBalance: formatEther(masterBalance),
    buffer: formatEther(MASTER_MIN_BUFFER),
    available: formatEther(availableBalance),
    perAgent: formatEther(perAgentAmount),
    numAgents: AGENT_KEYS.length,
  })

  if (perAgentAmount < parseEther('0.01')) {
    log('warn', 'Per-agent allocation too low, skipping redistribution', {
      perAgent: formatEther(perAgentAmount),
    })
    return false
  }

  let successCount = 0
  for (const key of AGENT_KEYS) {
    const agent = privateKeyToAccount(key)
    try {
      const hash = await masterWallet.sendTransaction({
        to: agent.address,
        value: perAgentAmount,
        gasPrice: parseGwei('250'),
      })

      await publicClient.waitForTransactionReceipt({ hash })
      successCount++
      log('info', 'Sent to agent', {
        to: agent.address,
        amount: formatEther(perAgentAmount),
        hash,
      })
    } catch (err) {
      log('error', 'Failed to send to agent', {
        agent: agent.address,
        error: err.message,
      })
    }
  }

  log('info', 'Redistribution complete', { successCount, totalAgents: AGENT_KEYS.length })
  return successCount === AGENT_KEYS.length
}

async function rebalanceIfNeeded() {
  log('info', 'Checking if rebalance needed')

  const balances = []
  let totalBalance = 0n

  for (const key of AGENT_KEYS) {
    const balance = await getAgentBalance(key)
    balances.push(balance)
    totalBalance += balance
  }

  const minBalance = balances.reduce((a, b) => (a < b ? a : b))
  const avgBalance = totalBalance / BigInt(AGENT_KEYS.length)

  log('info', 'Balance status', {
    minBalance: formatEther(minBalance),
    avgBalance: formatEther(avgBalance),
    totalBalance: formatEther(totalBalance),
    threshold: formatEther(MIN_AGENT_BALANCE),
  })

  if (minBalance < MIN_AGENT_BALANCE) {
    log('warn', 'Agent(s) below threshold, triggering rebalance')
    await collectFromAgents()
    await redistributeToAgents()
    return true
  }

  return false
}

async function fullRebalanceCycle() {
  try {
    log('info', '═══ BALANCE MANAGER CYCLE START ═══')

    // Step 1: Check if rebalance needed (automatic trigger)
    await rebalanceIfNeeded()

    // Step 2: Summary
    const masterBal = await getMasterBalance()
    log('info', '═══ CYCLE COMPLETE ═══', { masterBalance: formatEther(masterBal) })
  } catch (err) {
    log('error', 'Rebalance cycle failed', { error: err.message, stack: err.stack })
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('info', 'Balance Manager initialized', {
    agents: AGENT_KEYS.length,
    minThreshold: formatEther(MIN_AGENT_BALANCE),
    targetPerAgent: formatEther(TARGET_AGENT_BALANCE),
    masterBuffer: formatEther(MASTER_MIN_BUFFER),
  })

  // Run immediately
  await fullRebalanceCycle()

  // Then every 90 seconds — fast enough to catch mid-game depletion
  setInterval(fullRebalanceCycle, 90 * 1000)
  log('info', 'Balance Manager running — checks every 90 seconds')
}

main().catch(err => {
  log('error', 'Fatal error', { error: err.message, stack: err.stack })
  process.exit(1)
})

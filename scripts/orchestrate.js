import { spawn } from 'child_process'
import { createPublicClient, createWalletClient, http, fallback, parseEther, formatEther, parseGwei, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

// ─── Structured logger ────────────────────────────────────────────────────────
// NDJSON to stdout — pipe to a file or log aggregator in production:
//   node scripts/orchestrate.js >> logs/orchestrate.ndjson 2>&1
function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }))
}

// ─── Chain + RPC fallback ─────────────────────────────────────────────────────
const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  testnet: true,
})

// Use process.env or defaults; first URL is primary, remainder are fallbacks.
const RPC_URLS = [
  process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  'https://testnet-rpc2.monad.xyz',
  'https://monad-testnet.drpc.org',
].filter(Boolean)

const transport = fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 })))

// ─── Keys ─────────────────────────────────────────────────────────────────────
const MASTER_KEY = process.env.PRIVATE_KEY
const AGENT_KEYS = []

if (!MASTER_KEY) {
  log('error', 'PRIVATE_KEY not set in .env')
  process.exit(1)
}

for (let i = 0; i < 20; i++) {
  const key = process.env[`AGENT_KEY_${i}`]
  if (key) AGENT_KEYS.push(key)
}

if (AGENT_KEYS.length === 0) {
  log('warn', 'No AGENT_KEY_n env vars found — agents will not participate')
}

// ─── Clients ──────────────────────────────────────────────────────────────────
const publicClient = createPublicClient({ chain: monadTestnet, transport })
const masterAccount = privateKeyToAccount(MASTER_KEY)
const walletClient = createWalletClient({ account: masterAccount, chain: monadTestnet, transport })

// ─── Constants ────────────────────────────────────────────────────────────────
const AGENT_MIN_BALANCE = parseEther('0.3')   // joinArena costs ~0.09 MON + 5 rounds ≈ 0.14 MON total
const AGENT_TOPUP = parseEther('1.0')          // 1 MON ≈ 7 full games per agent
const RELAYER_WARN_BALANCE = parseEther('2.0') // warn when master drops below 2 MON
const RELAYER_CRIT_BALANCE = parseEther('0.5') // error — resolver will fail soon

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function checkBalance(address, label, warnThreshold, critThreshold) {
  const balance = await publicClient.getBalance({ address })
  const formatted = formatEther(balance)
  if (balance < critThreshold) {
    log('error', `${label} balance critically low`, { address, balance: formatted })
  } else if (balance < warnThreshold) {
    log('warn', `${label} balance low`, { address, balance: formatted })
  } else {
    log('info', `${label} balance ok`, { address, balance: formatted })
  }
  return balance
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function orchestrate() {
  log('info', 'Parallel Arena Orchestrator starting', { agents: AGENT_KEYS.length })

  // 1. Check master/relayer balance
  const relayerAddr = process.env.RELAYER_ADDRESS || masterAccount.address
  await checkBalance(relayerAddr, 'relayer', RELAYER_WARN_BALANCE, RELAYER_CRIT_BALANCE)

  // 2. Fund agents that are below minimum
  log('info', 'Checking agent balances')
  for (const key of AGENT_KEYS) {
    const acc = privateKeyToAccount(key)
    const balance = await publicClient.getBalance({ address: acc.address })

    if (balance < AGENT_MIN_BALANCE) {
      log('info', 'Topping up agent', { address: acc.address, current: formatEther(balance) })
      try {
        const hash = await walletClient.sendTransaction({
          to: acc.address,
          value: AGENT_TOPUP,
          gasPrice: parseGwei('250'),
        })
        await publicClient.waitForTransactionReceipt({ hash })
        log('info', 'Agent topped up', { address: acc.address, amount: formatEther(AGENT_TOPUP), hash })
      } catch (err) {
        log('error', 'Failed to top up agent', { address: acc.address, error: err.message })
      }
    }
  }
  log('info', 'Agent balance check complete')

  // 3. Spawn sub-processes with auto-restart on crash
  const DAEMONS = [
    { name: 'agents',       script: 'scripts/agents.js' },
    { name: 'autoResolve',  script: 'scripts/autoResolve.js' },
    { name: 'autoReset',    script: 'scripts/autoReset.js' },
    { name: 'balanceMgr',   script: 'scripts/balanceManager.js' },
  ]

  let shutdownRequested = false
  const procs = new Map()

  function spawnDaemon({ name, script }) {
    const proc = spawn('node', [script], { stdio: 'inherit', env: { ...process.env } })
    procs.set(name, proc)
    log('info', `${name} spawned`, { pid: proc.pid })

    proc.on('exit', (code, signal) => {
      procs.delete(name)
      if (shutdownRequested) return
      const level = code === 0 ? 'info' : 'error'
      log(level, `${name} exited`, { code, signal })
      if (code !== 0 || signal) {
        // Back-off restart: 5s after first crash, max 30s
        const delay = 5_000
        log('warn', `Restarting ${name} in ${delay / 1000}s...`)
        setTimeout(() => {
          if (!shutdownRequested) spawnDaemon({ name, script })
        }, delay)
      }
    })
    return proc
  }

  DAEMONS.forEach(spawnDaemon)

  // 4. Periodic relayer gas check every 5 minutes
  const gasMonitor = setInterval(async () => {
    try {
      await checkBalance(relayerAddr, 'relayer', RELAYER_WARN_BALANCE, RELAYER_CRIT_BALANCE)
    } catch (err) {
      log('error', 'Gas monitor RPC error', { error: err.message })
    }
  }, 5 * 60 * 1000)

  // 5. Graceful shutdown
  function shutdown(signal) {
    log('info', 'Shutdown signal received', { signal })
    shutdownRequested = true
    clearInterval(gasMonitor)
    for (const proc of procs.values()) {
      try { proc.kill() } catch { /* already dead */ }
    }
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

orchestrate().catch(err => {
  log('error', 'Orchestrator fatal error', { error: err.message, stack: err.stack })
  process.exit(1)
})

import { spawn } from 'child_process'
import { createPublicClient, createWalletClient, http, parseEther, formatEther, parseGwei, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  testnet: true,
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'
const MASTER_KEY = process.env.PRIVATE_KEY
const AGENT_KEYS = []

if (!MASTER_KEY) {
  console.error('ERROR: PRIVATE_KEY not set in .env')
  process.exit(1)
}

for (let i = 0; i < 20; i++) {
  const key = process.env[`AGENT_KEY_${i}`]
  if (key) AGENT_KEYS.push(key)
}

const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) })
const masterAccount = privateKeyToAccount(MASTER_KEY)
const walletClient = createWalletClient({ 
  account: masterAccount, 
  chain: monadTestnet, 
  transport: http(RPC_URL) 
})

async function orchestrate() {
  console.log('\n🚀 [ORCHESTRATOR] Initializing Parallel Arena Swarm...')
  
  // 1. FUNDING CHECK
  console.log('💰 Checking Agent Balances...')
  for (const key of AGENT_KEYS) {
    const acc = privateKeyToAccount(key)
    const balance = await publicClient.getBalance({ address: acc.address })
    
    // Ensure agent has at least 0.05 MON
    if (balance < parseEther('0.05')) {
      console.log(`   └─ [Top-up] ${acc.address.slice(0,6)}... needs gas (${formatEther(balance)} MON). Sending 0.1 MON.`)
      const hash = await walletClient.sendTransaction({
        to: acc.address,
        value: parseEther('0.1'),
        gasPrice: parseGwei('250')
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }
  }
  console.log('✅ All agents adequately funded.')

  // 2. START AGENTS
  console.log('⚔️ Launching Combatants...')
  const agentProc = spawn('node', ['scripts/agents.js'], { stdio: 'inherit' })

  // 3. START RESOLVER
  console.log('⏱️ Launching Auto-Resolver...')
  const resolveProc = spawn('node', ['scripts/autoResolve.js'], { stdio: 'inherit' })

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down arena...')
    agentProc.kill()
    resolveProc.kill()
    process.exit()
  })
}

orchestrate().catch(console.error)

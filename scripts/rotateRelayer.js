/**
 * Rotate the relayer address in ParallelArenaV2 without redeploying.
 *
 * Usage:
 *   NEW_RELAYER=0x... node scripts/rotateRelayer.js
 *
 * Env vars required:
 *   PRIVATE_KEY          — owner wallet private key
 *   CONTRACT_ADDRESS     — deployed ParallelArenaV2 address
 *   NEW_RELAYER          — new relayer EOA address
 *   MONAD_RPC_URL        — (optional) override primary RPC
 */
import { createPublicClient, createWalletClient, http, fallback, defineChain, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }))
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  testnet: true,
})

const RPC_URLS = [
  process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  'https://testnet-rpc2.monad.xyz',
  'https://monad-testnet.drpc.org',
].filter(Boolean)

const OWNER_KEY = process.env.PRIVATE_KEY
const CONTRACT  = process.env.CONTRACT_ADDRESS
const NEW_RELAYER = process.env.NEW_RELAYER

if (!OWNER_KEY || !CONTRACT || !NEW_RELAYER) {
  log('error', 'Missing env: PRIVATE_KEY, CONTRACT_ADDRESS, and NEW_RELAYER are all required')
  process.exit(1)
}

// Minimal ABI — only what we need
const ABI = [
  {
    type: 'function',
    name: 'setRelayerAddress',
    inputs: [{ name: 'newRelayer', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'relayerAddress',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
]

async function main() {
  const transport = fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 })))
  const account = privateKeyToAccount(OWNER_KEY)
  const publicClient = createPublicClient({ chain: monadTestnet, transport })
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport })

  // Pre-flight checks
  const [contractOwner, currentRelayer] = await Promise.all([
    publicClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'owner' }),
    publicClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'relayerAddress' }),
  ])

  log('info', 'Pre-flight check', { contractOwner, currentRelayer, newRelayer: NEW_RELAYER, caller: account.address })

  if (contractOwner.toLowerCase() !== account.address.toLowerCase()) {
    log('error', 'Caller is not the contract owner', { owner: contractOwner, caller: account.address })
    process.exit(1)
  }

  if (currentRelayer.toLowerCase() === NEW_RELAYER.toLowerCase()) {
    log('warn', 'New relayer is the same as current relayer — no-op', { relayer: NEW_RELAYER })
    process.exit(0)
  }

  log('info', 'Submitting setRelayerAddress transaction...')
  const hash = await walletClient.writeContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'setRelayerAddress',
    args: [NEW_RELAYER],
    gasPrice: parseGwei('250'),
  })
  log('info', 'Transaction submitted', { hash })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  log('info', 'Transaction confirmed', { hash, blockNumber: receipt.blockNumber.toString(), status: receipt.status })

  // Verify
  const updatedRelayer = await publicClient.readContract({
    address: CONTRACT, abi: ABI, functionName: 'relayerAddress',
  })
  if (updatedRelayer.toLowerCase() !== NEW_RELAYER.toLowerCase()) {
    log('error', 'Relayer address mismatch after tx — investigate', { expected: NEW_RELAYER, got: updatedRelayer })
    process.exit(1)
  }

  log('info', 'Relayer rotation complete', { newRelayer: updatedRelayer })
}

main().catch(err => {
  log('error', 'Fatal error', { error: err.message, stack: err.stack })
  process.exit(1)
})

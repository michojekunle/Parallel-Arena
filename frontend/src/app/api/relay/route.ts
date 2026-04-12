import { createPublicClient, createWalletClient, http, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from '@/lib/constants'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'

// Server-side only — never exposed to client.
// Supports both RELAYER_PRIVATE_KEY (server-only) and NEXT_PUBLIC_RPC_URL (shared).
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'

const TX_TIMEOUT_MS = 25_000 // 25s — Next.js routes default to 30s limit

function getClients() {
  if (!RELAYER_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY not configured on server')
  }
  const account    = privateKeyToAccount(RELAYER_KEY)
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) })
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC) })
  return { walletClient, publicClient, account }
}

interface RelayBody {
  type: 'action' | 'claim'
  player: `0x${string}`
  action?: number
  nonce: string
  deadline: string
  v: number
  r: `0x${string}`
  s: `0x${string}`
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as RelayBody
    const { type, player, nonce, deadline, v, r, s } = body

    if (!player || !nonce || !deadline || v === undefined || !r || !s) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { walletClient, publicClient } = getClients()
    let hash: `0x${string}`

    if (type === 'action') {
      if (body.action === undefined || body.action === null) {
        return Response.json({ error: 'Missing action' }, { status: 400 })
      }
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitActionWithPermit',
        args: [player, body.action, BigInt(nonce), BigInt(deadline), v, r, s],
        gasPrice: parseGwei('250'),
      })
    } else if (type === 'claim') {
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'claimPrizeWithPermit',
        args: [player, BigInt(nonce), BigInt(deadline), v, r, s],
        gasPrice: parseGwei('250'),
      })
    } else {
      return Response.json({ error: 'Unknown relay type' }, { status: 400 })
    }

    // Wait for receipt with timeout to avoid Next.js route timeout
    const receipt = await Promise.race([
      publicClient.waitForTransactionReceipt({ hash }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Receipt timeout — tx may still confirm')), TX_TIMEOUT_MS)
      ),
    ])

    return Response.json({ txHash: hash, blockNumber: Number((receipt as { blockNumber: bigint }).blockNumber) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Relay failed'
    console.error('[relay]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

import { createPublicClient, createWalletClient, http, fallback, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract'

// Server-side only — never exposed to client.
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`

const TX_TIMEOUT_MS = 25_000 // 25s — Next.js routes default to 30s limit

// ---------------------------------------------------------------------------
// In-process sliding-window rate limiter (10 req / 60s per IP)
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10
// Map is module-scoped — shared across requests in the same worker process.
// Fine for a single-server deployment; use Redis for multi-instance.
const rateBuckets = new Map<string, number[]>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const hits = (rateBuckets.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) return false
  rateBuckets.set(ip, [...hits, now])
  return true
}

// Evict stale buckets every 5 minutes to prevent unbounded Map growth
setInterval(() => {
  const now = Date.now()
  for (const [ip, hits] of rateBuckets) {
    if (hits.every(t => now - t >= RATE_WINDOW_MS)) rateBuckets.delete(ip)
  }
}, 5 * 60 * 1000)

function getClients() {
  if (!RELAYER_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY not configured on server')
  }
  const transport = fallback(RPC_URLS.map(url => http(url, { timeout: 10_000 })))
  const account = privateKeyToAccount(RELAYER_KEY)
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport })
  const publicClient = createPublicClient({ chain: monadTestnet, transport })
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
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return Response.json({ error: 'Rate limit exceeded — try again in a minute' }, { status: 429 })
  }

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
        gasPrice: parseGwei('52'),
      })
    } else if (type === 'claim') {
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'claimPrizeWithPermit',
        args: [player, BigInt(nonce), BigInt(deadline), v, r, s],
        gasPrice: parseGwei('52'),
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

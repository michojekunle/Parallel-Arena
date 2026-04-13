import { createPublicClient, http } from 'viem'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { CONTRACT_ADDRESS } from '@/lib/contract'

// Lightweight health check used by monitoring, load balancers, and the
// frontend's ErrorBoundary to detect total outages before showing users
// a confusing blank screen.
export async function GET(): Promise<Response> {
  const results = await Promise.allSettled(
    RPC_URLS.map(async url => {
      const client = createPublicClient({ chain: monadTestnet, transport: http(url, { timeout: 5_000 }) })
      const blockNumber = await client.getBlockNumber()
      return { url, blockNumber: blockNumber.toString() }
    })
  )

  const rpcs = results.map((r, i) => ({
    url: RPC_URLS[i],
    ok: r.status === 'fulfilled',
    blockNumber: r.status === 'fulfilled' ? r.value.blockNumber : null,
    error: r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null,
  }))

  const anyOk = rpcs.some(r => r.ok)

  return Response.json(
    {
      status: anyOk ? 'ok' : 'degraded',
      contract: CONTRACT_ADDRESS,
      rpcs,
      ts: Date.now(),
    },
    { status: anyOk ? 200 : 503 }
  )
}

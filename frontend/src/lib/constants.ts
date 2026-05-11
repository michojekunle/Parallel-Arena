import { defineChain } from 'viem'

// Primary + fallback RPC endpoints — viem's fallback() transport will retry
// the next URL automatically on timeout or 5xx errors.
export const RPC_URLS: string[] = [
  process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz',
  'https://monad-testnet.drpc.org',
].filter(Boolean)

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: RPC_URLS },
  },
  blockExplorers: {
    default: { name: 'MonadScan', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})

export const ACTION_LABELS = {
  0: 'NONE',
  1: '⚔ ATTACK',
  2: '🛡 DEFEND',
  3: '💚 HEAL',
} as const

export const ACTION_COLORS: Record<number, string> = {
  1: '#F25A67',
  2: '#3396FF',
  3: '#26D962',
}

export const ACTION_BG_COLORS: Record<number, string> = {
  1: 'rgba(242,90,103,0.1)',
  2: 'rgba(51,150,255,0.1)',
  3: 'rgba(38,217,98,0.1)',
}

// 4s polling reduces RPC load while keeping UX snappy enough for a 30s round
export const POLL_INTERVAL = 4000

export const SHORT_ADDR = (addr: string): string =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`

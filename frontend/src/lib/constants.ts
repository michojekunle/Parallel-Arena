import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz'] },
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

export const POLL_INTERVAL = 2000

export const SHORT_ADDR = (addr: string): string =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`

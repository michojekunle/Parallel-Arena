import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: {
      http: [
        process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
        'https://testnet-rpc2.monad.xyz',
        'https://monad-testnet.drpc.org',
      ].filter(Boolean),
    },
  },
  blockExplorers: {
    default: { name: 'MonadScan', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})

// Fallback URLs in priority order for use with viem's fallback() transport.
export const RPC_URLS = [
  process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  'https://testnet-rpc2.monad.xyz',
  'https://monad-testnet.drpc.org',
].filter(Boolean)

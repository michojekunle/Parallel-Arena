'use client'

import './globals.css'
import '@/styles/animations.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { http, fallback } from 'wagmi'

const wagmiConfig = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: fallback(RPC_URLS.map(url => http(url, { timeout: 8_000 }))),
  },
})

const queryClient = new QueryClient()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <title>Arena — Monad</title>
        <meta name="description" content="Parallel execution visualizer" />
      </head>
      <body>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'your-privy-app-id'}
          config={{
            appearance: {
              theme: 'dark',
              accentColor: '#26D962', // toxic green accent for the arena
              logo: '/logo.png',
              showWalletLoginFirst: true,
              walletChainType: 'ethereum-only',
            },
            embeddedWallets: {
              ethereum: {
                createOnLogin: 'users-without-wallets',
              },
            },
            supportedChains: [monadTestnet],
          }}
        >
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig}>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </WagmiProvider>
          </QueryClientProvider>
        </PrivyProvider>
      </body>
    </html>
  )
}

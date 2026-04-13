'use client'

import './globals.css'
import '@/styles/animations.css'
import '@rainbow-me/rainbowkit/styles.css'
import { WagmiProvider, createConfig, http, fallback } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { monadTestnet, RPC_URLS } from '@/lib/constants'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const config = createConfig({
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
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: '#FFFFFF',
                accentColorForeground: '#000000',
                borderRadius: 'small',
                fontStack: 'system',
              })}
            >
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  )
}

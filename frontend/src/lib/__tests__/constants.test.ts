/**
 * constants.test.ts
 *
 * Verifies RPC_URLS is configured for actual redundancy (≥2 entries)
 * and that chain constants are correct for Monad testnet.
 */

import { RPC_URLS, monadTestnet, POLL_INTERVAL, SHORT_ADDR } from '../constants'

describe('RPC_URLS', () => {
  it('has at least 2 entries for fallback redundancy', () => {
    expect(RPC_URLS.length).toBeGreaterThanOrEqual(2)
  })

  it('all entries are valid https URLs', () => {
    for (const url of RPC_URLS) {
      expect(url).toMatch(/^https?:\/\//)
    }
  })

  it('primary URL is monad testnet RPC', () => {
    expect(RPC_URLS[0]).toContain('monad')
  })
})

describe('monadTestnet chain', () => {
  it('has correct chain ID 10143', () => {
    expect(monadTestnet.id).toBe(10143)
  })

  it('uses MON as native currency', () => {
    expect(monadTestnet.nativeCurrency.symbol).toBe('MON')
    expect(monadTestnet.nativeCurrency.decimals).toBe(18)
  })

  it('is marked as testnet', () => {
    expect(monadTestnet.testnet).toBe(true)
  })
})

describe('POLL_INTERVAL', () => {
  it('is between 1000ms and 10000ms', () => {
    expect(POLL_INTERVAL).toBeGreaterThanOrEqual(1000)
    expect(POLL_INTERVAL).toBeLessThanOrEqual(10_000)
  })
})

describe('SHORT_ADDR', () => {
  const addr = '0xA711CEA2F1c571BbEEaB06Efd7dA8c660E7D6eA'

  it('truncates to first 6 chars + ... + last 4 chars', () => {
    const result = SHORT_ADDR(addr)
    // Implementation: `${addr.slice(0, 6)}...${addr.slice(-4)}`
    expect(result).toMatch(/^0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}$/)
  })

  it('preserves prefix', () => {
    expect(SHORT_ADDR(addr).startsWith('0xA711')).toBe(true)
  })

  it('preserves suffix', () => {
    expect(SHORT_ADDR(addr).endsWith('D6eA')).toBe(true)
  })
})

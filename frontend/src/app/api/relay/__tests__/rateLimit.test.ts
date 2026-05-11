/**
 * rateLimit.test.ts
 *
 * Tests the in-process sliding-window rate limiter used by the relay endpoint.
 * We test the logic in isolation by extracting it from route.ts — the real
 * implementation is module-scope so we replicate the same algorithm here to
 * keep tests fast and dependency-free.
 */

// ─── Replicate the rate-limit logic (same algorithm as route.ts) ─────────────

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10

function makeRateLimiter() {
  const buckets = new Map<string, number[]>()

  function check(ip: string, nowMs: number): boolean {
    const hits = (buckets.get(ip) ?? []).filter(t => nowMs - t < RATE_WINDOW_MS)
    if (hits.length >= RATE_MAX) return false
    buckets.set(ip, [...hits, nowMs])
    return true
  }

  function evict(nowMs: number): void {
    for (const [ip, hits] of buckets) {
      if (hits.every(t => nowMs - t >= RATE_WINDOW_MS)) buckets.delete(ip)
    }
  }

  return { check, evict, buckets }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('rate limiter', () => {
  it('allows RATE_MAX requests within the window', () => {
    const { check } = makeRateLimiter()
    const ip = '1.2.3.4'
    const now = Date.now()

    for (let i = 0; i < RATE_MAX; i++) {
      expect(check(ip, now + i)).toBe(true)
    }
  })

  it('blocks the (RATE_MAX + 1)th request', () => {
    const { check } = makeRateLimiter()
    const ip = '1.2.3.4'
    const now = Date.now()

    for (let i = 0; i < RATE_MAX; i++) check(ip, now + i)
    expect(check(ip, now + RATE_MAX)).toBe(false)
  })

  it('allows requests again after the window expires', () => {
    const { check } = makeRateLimiter()
    const ip = '1.2.3.4'
    const now = Date.now()

    for (let i = 0; i < RATE_MAX; i++) check(ip, now + i)
    // One full window later
    expect(check(ip, now + RATE_WINDOW_MS + 1)).toBe(true)
  })

  it('tracks different IPs independently', () => {
    const { check } = makeRateLimiter()
    const now = Date.now()

    for (let i = 0; i < RATE_MAX; i++) check('1.1.1.1', now + i)

    // 1.1.1.1 is blocked — 2.2.2.2 should be fine
    expect(check('1.1.1.1', now + RATE_MAX)).toBe(false)
    expect(check('2.2.2.2', now + RATE_MAX)).toBe(true)
  })

  it('sliding window: only requests inside the window count', () => {
    const { check } = makeRateLimiter()
    const ip = '1.2.3.4'
    const now = Date.now()

    // 5 old requests (outside window)
    for (let i = 0; i < 5; i++) check(ip, now - RATE_WINDOW_MS - 1000 + i)

    // 9 new requests (inside window) — should all pass
    for (let i = 0; i < 9; i++) {
      expect(check(ip, now + i)).toBe(true)
    }
    // 10th still passes (5 old expired + 9 new = 9 in window)
    expect(check(ip, now + 9)).toBe(true)
    // 11th blocked
    expect(check(ip, now + 10)).toBe(false)
  })

  it('evict removes IPs with all expired hits', () => {
    const { check, evict, buckets } = makeRateLimiter()
    const ip = '1.2.3.4'
    const now = Date.now()

    check(ip, now - RATE_WINDOW_MS - 1)
    expect(buckets.has(ip)).toBe(true)

    evict(now)
    expect(buckets.has(ip)).toBe(false)
  })

  it('evict does not remove IPs with recent hits', () => {
    const { check, evict, buckets } = makeRateLimiter()
    const ip = '1.2.3.4'
    const now = Date.now()

    check(ip, now - 1000) // recent
    evict(now)
    expect(buckets.has(ip)).toBe(true)
  })
})

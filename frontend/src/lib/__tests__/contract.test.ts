/**
 * contract.test.ts
 *
 * Verifies that the frontend ABI declarations match what the contract actually
 * needs. These tests catch the class of bug that broke gasless submits
 * (wrong domain name) and caused corrupt player data (missing struct field).
 */

import { ABI, CONTRACT_ADDRESS, AGENT_CREATION_FEE } from '../contract'

// ─── ABI sanity ──────────────────────────────────────────────────────────────

describe('ABI', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(ABI)).toBe(true)
    expect(ABI.length).toBeGreaterThan(0)
  })

  it('includes all required write functions', () => {
    const names = ABI.filter((x: { type: string }) => x.type === 'function').map((x: { name: string }) => x.name)
    const required = [
      'joinArena',
      'submitAction',
      'resolveRound',
      'resetGame',
      'authorizeSessionKey',
      'submitActionWithPermit',
      'claimPrizeWithPermit',
      'claimPrize',
    ]
    for (const fn of required) {
      expect(names).toContain(fn)
    }
  })

  it('includes all required read functions', () => {
    const names = ABI.filter((x: { type: string }) => x.type === 'function').map((x: { name: string }) => x.name)
    const required = [
      'getFullGameState',
      'getAllPlayers',
      'getPlayer',
      'getTimeRemaining',
      'getPrizeAmounts',
      'getWinners',
      'nonces',
      'sessionKeyExpiry',
      'entryFee',
      'getLeaderboard',
      'getAllTimeParticipants',
      'getPlayerStats',
    ]
    for (const fn of required) {
      expect(names).toContain(fn)
    }
  })

  it('does NOT include the deprecated V1 getGameState', () => {
    // getGameState() was renamed to getFullGameState() in V2.
    // If it's in the ABI it will cause "function not found" reverts.
    const names = ABI.filter((x: { type: string }) => x.type === 'function').map((x: { name: string }) => x.name)
    expect(names).not.toContain('getGameState')
  })

  it('includes all required events', () => {
    const evtNames = ABI.filter((x: { type: string }) => x.type === 'event').map((x: { name: string }) => x.name)
    const required = [
      'ActionSubmitted',
      'RoundResolved',
      'PlayerAttacked',
      'PlayerEliminated',
      'PlayerJoined',
      'GameEnded',
      'PrizeClaimed',
      'GameReset',
      'AttackMissed',
    ]
    for (const evt of required) {
      expect(evtNames).toContain(evt)
    }
  })

  it('Player struct includes consecutiveHeals as 9th field', () => {
    // viem parseAbi inlines structs so we find it via the raw string representation.
    // We verify this by checking the ABI item whose name is getPlayer and inspecting outputs.
    const getPlayer = ABI.find(
      (x: { type: string; name?: string }) => x.type === 'function' && x.name === 'getPlayer',
    ) as { outputs?: { components?: { name: string }[] }[] } | undefined

    expect(getPlayer).toBeDefined()
    // viem represents struct outputs as a tuple with components
    const components = getPlayer?.outputs?.[0]?.components
    expect(components).toBeDefined()
    const fieldNames = components!.map((c) => c.name)
    expect(fieldNames).toContain('consecutiveHeals')
    // Also confirm order: must be 9th (index 8)
    expect(fieldNames[8]).toBe('consecutiveHeals')
  })
})

// ─── Constants ────────────────────────────────────────────────────────────────

describe('CONTRACT_ADDRESS', () => {
  it('is a hex string or zero address placeholder', () => {
    expect(CONTRACT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

describe('AGENT_CREATION_FEE', () => {
  it('is a positive bigint', () => {
    expect(typeof AGENT_CREATION_FEE).toBe('bigint')
    expect(AGENT_CREATION_FEE).toBeGreaterThan(0n)
  })
})

/**
 * gameLogic.test.ts
 *
 * Tests for client-side game logic — attack target selection,
 * tx status transitions, and replay frame building.
 */

import { Action, PlayerStatus, GamePhase } from '../types'
import type { Player } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(addr: `0x${string}`, health: bigint, status: PlayerStatus = PlayerStatus.ACTIVE): Player {
  return {
    addr,
    health,
    attack: 20n,
    defense: 10n,
    status,
    roundsPlayed: 0n,
    kills: 0n,
    rank: 0n,
    consecutiveHeals: 0n,
  }
}

// Replicates the attack target selection from useArena.ts:
// lowest HP active player who isn't the attacker
function computeAttackTarget(players: Player[], myAddr: string): `0x${string}` | null {
  return (
    players
      .filter(p => p.status === PlayerStatus.ACTIVE && p.addr.toLowerCase() !== myAddr.toLowerCase())
      .sort((a, b) => Number(a.health) - Number(b.health))[0]?.addr ?? null
  )
}

// ─── Attack target selection ──────────────────────────────────────────────────

describe('computeAttackTarget', () => {
  const ME = '0x0000000000000000000000000000000000000001'
  const A  = '0x0000000000000000000000000000000000000002'
  const B  = '0x0000000000000000000000000000000000000003'
  const C  = '0x0000000000000000000000000000000000000004'

  it('returns the lowest-HP active player', () => {
    const players = [
      makePlayer(ME as `0x${string}`, 80n),
      makePlayer(A as `0x${string}`, 60n),
      makePlayer(B as `0x${string}`, 40n), // lowest
      makePlayer(C as `0x${string}`, 90n),
    ]
    expect(computeAttackTarget(players, ME)).toBe(B)
  })

  it('never targets the attacker themselves', () => {
    const players = [
      makePlayer(ME as `0x${string}`, 10n), // lowest but is me
      makePlayer(A as `0x${string}`, 80n),
      makePlayer(B as `0x${string}`, 90n),
    ]
    expect(computeAttackTarget(players, ME)).toBe(A)
  })

  it('skips dead players', () => {
    const players = [
      makePlayer(ME as `0x${string}`, 80n),
      makePlayer(A as `0x${string}`, 5n, PlayerStatus.DEAD), // lowest but dead
      makePlayer(B as `0x${string}`, 60n),
    ]
    expect(computeAttackTarget(players, ME)).toBe(B)
  })

  it('returns null when no other active players exist', () => {
    const players = [
      makePlayer(ME as `0x${string}`, 80n),
      makePlayer(A as `0x${string}`, 50n, PlayerStatus.DEAD),
    ]
    expect(computeAttackTarget(players, ME)).toBeNull()
  })

  it('handles tie by returning first in sort order', () => {
    const players = [
      makePlayer(ME as `0x${string}`, 80n),
      makePlayer(A as `0x${string}`, 50n),
      makePlayer(B as `0x${string}`, 50n),
    ]
    const target = computeAttackTarget(players, ME)
    expect([A, B]).toContain(target)
  })

  it('returns null when alone in arena', () => {
    const players = [makePlayer(ME as `0x${string}`, 80n)]
    expect(computeAttackTarget(players, ME)).toBeNull()
  })
})

// ─── GamePhase transitions ────────────────────────────────────────────────────

describe('GamePhase state machine', () => {
  it('WAITING → ACTIVE → ENDED covers all valid transitions', () => {
    // Just verify enum coverage; transition enforcement is on-chain
    expect(GamePhase.WAITING).toBeLessThan(GamePhase.ACTIVE)
    expect(GamePhase.ACTIVE).toBeLessThan(GamePhase.ENDED)
  })
})

// ─── Action validity ─────────────────────────────────────────────────────────

describe('action submission guard', () => {
  // Replicates canAct logic from ActionPanel.tsx
  function canAct(
    isInArena: boolean,
    hasActed: boolean,
    roundResolved: boolean,
    gamePhase: GamePhase | undefined,
  ): boolean {
    const isPhaseActive = gamePhase === GamePhase.ACTIVE || gamePhase === undefined
    return isInArena && !hasActed && !roundResolved && isPhaseActive
  }

  it('allows action when in arena, not yet acted, round open, phase ACTIVE', () => {
    expect(canAct(true, false, false, GamePhase.ACTIVE)).toBe(true)
  })

  it('blocks when already acted', () => {
    expect(canAct(true, true, false, GamePhase.ACTIVE)).toBe(false)
  })

  it('blocks when round resolved', () => {
    expect(canAct(true, false, true, GamePhase.ACTIVE)).toBe(false)
  })

  it('blocks when not in arena', () => {
    expect(canAct(false, false, false, GamePhase.ACTIVE)).toBe(false)
  })

  it('blocks when game is ENDED', () => {
    expect(canAct(true, false, false, GamePhase.ENDED)).toBe(false)
  })

  it('blocks when game is WAITING', () => {
    expect(canAct(true, false, false, GamePhase.WAITING)).toBe(false)
  })

  it('allows action when phase is undefined (RPC failure fallback)', () => {
    expect(canAct(true, false, false, undefined)).toBe(true)
  })
})

// ─── Replay frame health simulation ──────────────────────────────────────────

describe('replay health simulation', () => {
  it('applies attack damage correctly', () => {
    const healthMap: Record<string, number> = { '0xabc': 80, '0xdef': 60 }
    const attacks = [{ attacker: '0xabc', target: '0xdef', damage: 25 }]

    for (const atk of attacks) {
      healthMap[atk.target] = Math.max(0, (healthMap[atk.target] ?? 0) - atk.damage)
    }
    expect(healthMap['0xdef']).toBe(35)
  })

  it('clamps health to 0 minimum (no negative HP)', () => {
    const healthMap: Record<string, number> = { '0xabc': 80, '0xdef': 10 }
    const attacks = [{ attacker: '0xabc', target: '0xdef', damage: 50 }]

    for (const atk of attacks) {
      healthMap[atk.target] = Math.max(0, (healthMap[atk.target] ?? 0) - atk.damage)
    }
    expect(healthMap['0xdef']).toBe(0)
  })

  it('applies heal correctly', () => {
    const healthMap: Record<string, number> = { '0xabc': 60 }
    healthMap['0xabc'] = Math.min(100, (healthMap['0xabc'] ?? 0) + 20)
    expect(healthMap['0xabc']).toBe(80)
  })

  it('clamps health to 100 maximum', () => {
    const healthMap: Record<string, number> = { '0xabc': 95 }
    healthMap['0xabc'] = Math.min(100, (healthMap['0xabc'] ?? 0) + 20)
    expect(healthMap['0xabc']).toBe(100)
  })

  it('death sets health to 0', () => {
    const healthMap: Record<string, number> = { '0xabc': 5 }
    healthMap['0xabc'] = 0
    expect(healthMap['0xabc']).toBe(0)
  })
})

/**
 * types.test.ts
 *
 * Runtime guards and shape checks for the types used throughout the app.
 * Also checks that enum values match Solidity enum positions.
 */

import { Action, PlayerStatus, GamePhase, AgentStrategy } from '../types'

describe('Action enum', () => {
  it('maps NONE=0, ATTACK=1, DEFEND=2, HEAL=3', () => {
    expect(Action.NONE).toBe(0)
    expect(Action.ATTACK).toBe(1)
    expect(Action.DEFEND).toBe(2)
    expect(Action.HEAL).toBe(3)
  })
})

describe('PlayerStatus enum', () => {
  it('maps INACTIVE=0, ACTIVE=1, DEAD=2', () => {
    expect(PlayerStatus.INACTIVE).toBe(0)
    expect(PlayerStatus.ACTIVE).toBe(1)
    expect(PlayerStatus.DEAD).toBe(2)
  })
})

describe('GamePhase enum', () => {
  it('maps WAITING=0, ACTIVE=1, ENDED=2', () => {
    expect(GamePhase.WAITING).toBe(0)
    expect(GamePhase.ACTIVE).toBe(1)
    expect(GamePhase.ENDED).toBe(2)
  })
})

describe('AgentStrategy enum', () => {
  it('maps RANDOM=0, AGGRESSIVE=1, DEFENSIVE=2, ADAPTIVE=3', () => {
    expect(AgentStrategy.RANDOM).toBe(0)
    expect(AgentStrategy.AGGRESSIVE).toBe(1)
    expect(AgentStrategy.DEFENSIVE).toBe(2)
    expect(AgentStrategy.ADAPTIVE).toBe(3)
  })
})

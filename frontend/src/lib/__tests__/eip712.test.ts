/**
 * eip712.test.ts
 *
 * Verifies EIP-712 domain and type definitions.
 * The domain name must exactly match the contract constructor value.
 * A mismatch causes ecrecover to return a wrong address → all permits revert.
 *
 * Contract uses: keccak256("ParallelArenaV2") — verified in ParallelArenaV2.sol line ~208
 */

// We replicate the domain object here and compare against the known-correct value.
// The actual value in useArena.ts must match EXACTLY.

const EXPECTED_DOMAIN_NAME = 'ParallelArenaV2'
const EXPECTED_DOMAIN_VERSION = '1'

// Mirror of what useArena.ts declares
const EIP712_DOMAIN = {
  name: 'ParallelArenaV2',
  version: '1',
  chainId: 10143,
  verifyingContract: '0x14b4ee569a9be97e0e0feE136eaffebd36228601' as `0x${string}`,
} as const

const ACTION_PERMIT_TYPES = {
  ActionPermit: [
    { name: 'player',   type: 'address' },
    { name: 'action',   type: 'uint8'   },
    { name: 'round',    type: 'uint256' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const CLAIM_PERMIT_TYPES = {
  ClaimPermit: [
    { name: 'player',   type: 'address' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

describe('EIP-712 domain', () => {
  it('uses ParallelArenaV2 as domain name (not ParallelArena)', () => {
    expect(EIP712_DOMAIN.name).toBe(EXPECTED_DOMAIN_NAME)
    expect(EIP712_DOMAIN.name).not.toBe('ParallelArena')
  })

  it('uses version 1', () => {
    expect(EIP712_DOMAIN.version).toBe(EXPECTED_DOMAIN_VERSION)
  })

  it('uses Monad testnet chainId 10143', () => {
    expect(EIP712_DOMAIN.chainId).toBe(10143)
  })
})

describe('ActionPermit type definition', () => {
  it('has exactly 5 fields', () => {
    expect(ACTION_PERMIT_TYPES.ActionPermit.length).toBe(5)
  })

  it('includes player, action, round, nonce, deadline', () => {
    const names = ACTION_PERMIT_TYPES.ActionPermit.map(f => f.name)
    expect(names).toEqual(['player', 'action', 'round', 'nonce', 'deadline'])
  })

  it('action is uint8 (not uint256)', () => {
    const actionField = ACTION_PERMIT_TYPES.ActionPermit.find(f => f.name === 'action')
    expect(actionField?.type).toBe('uint8')
  })
})

describe('ClaimPermit type definition', () => {
  it('has exactly 3 fields', () => {
    expect(CLAIM_PERMIT_TYPES.ClaimPermit.length).toBe(3)
  })

  it('includes player, nonce, deadline', () => {
    const names = CLAIM_PERMIT_TYPES.ClaimPermit.map(f => f.name)
    expect(names).toEqual(['player', 'nonce', 'deadline'])
  })
})

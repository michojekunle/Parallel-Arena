export enum Action {
  NONE = 0,
  ATTACK = 1,
  DEFEND = 2,
  HEAL = 3,
}

export enum PlayerStatus {
  INACTIVE = 0,
  ACTIVE = 1,
  DEAD = 2,
}

export enum GamePhase {
  WAITING = 0,
  ACTIVE  = 1,
  ENDED   = 2,
}

export enum AgentStrategy {
  RANDOM     = 0,
  AGGRESSIVE = 1,
  DEFENSIVE  = 2,
  ADAPTIVE   = 3,
}

export interface Player {
  addr: `0x${string}`
  health: bigint
  attack: bigint
  defense: bigint
  status: PlayerStatus
  roundsPlayed: bigint
  kills: bigint
  rank: bigint
}

export interface GameState {
  round: bigint
  deadline: bigint
  activePlayers: bigint
  totalPlayers: bigint
  resolved: boolean
}

export interface FullGameState extends GameState {
  pool: bigint
  maxRounds: bigint
  gamePhase: GamePhase
  winners: [`0x${string}`, `0x${string}`, `0x${string}`]
}

export interface RoundResult {
  round: bigint
  actionsProcessed: bigint
  attacksLanded: bigint
  healsApplied: bigint
  defendersProtected: bigint
  playersEliminated: bigint
  resolvedAt: bigint
}

export interface LogEntry {
  id: string
  round: number
  message: string
  type: 'action' | 'resolve' | 'attack' | 'heal' | 'death' | 'join' | 'system'
  timestamp: number
  txHash?: string
}

export interface PendingAction {
  player: `0x${string}`
  action: Action
  round: number
  txHash?: string
}

export interface AgentInfo {
  owner: `0x${string}`
  strategy: AgentStrategy
  balance: bigint
  active: boolean
  gamesPlayed: bigint
  totalKills: bigint
  topThreeFinishes: bigint
}

export interface PrizeAmounts {
  firstPrize: bigint
  secondPrize: bigint
  thirdPrize: bigint
}

export type JoinStep = 'idle' | 'joining' | 'done'

// Replay
export interface ReplayAttack {
  attacker: `0x${string}`
  target: `0x${string}`
  damage: number
}

export interface ReplayFrame {
  round: number
  /** Health snapshot AFTER this round resolved */
  playerHealths: Record<`0x${string}`, number>
  attacks: ReplayAttack[]
  deaths: `0x${string}`[]
  heals: `0x${string}`[]
}

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

export type JoinStep = 'idle' | 'joining' | 'authorizing' | 'funding' | 'done'

export interface SessionKeyState {
  isActive: boolean
  isExpired: boolean
  address: `0x${string}` | null
  expiresAt: number | null
  secondsRemaining: number
  authorize: () => Promise<void>
  revoke: () => Promise<void>
  signAction: (action: Action) => Promise<`0x${string}`>
}

export enum GamePhase {
  WAITING = 0,
  ACTIVE  = 1,
  ENDED   = 2,
}

export interface FullGameState extends GameState {
  pool: bigint
  maxRounds: bigint
  gamePhase: GamePhase
  winners: [`0x${string}`, `0x${string}`, `0x${string}`]
}

export interface PrizeAmounts {
  firstPrize: bigint
  secondPrize: bigint
  thirdPrize: bigint
}

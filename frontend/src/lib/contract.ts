import { parseAbi } from 'viem'

export const ABI = parseAbi([
  'struct Player { address addr; uint256 health; uint256 attack; uint256 defense; uint8 status; uint256 roundsPlayed; uint256 kills; uint256 rank; }',
  'struct RoundResult { uint256 round; uint256 actionsProcessed; uint256 attacksLanded; uint256 healsApplied; uint256 defendersProtected; uint256 playersEliminated; uint256 resolvedAt; }',
  'function joinArena() external payable',
  'function submitAction(uint8 action) external',
  'function resolveRound() external',
  'function getGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved)',
  'function getAllPlayers() external view returns (Player[])',
  'function getMyAction(uint256 round) external view returns (uint8)',
  'function getRoundResult(uint256 round) external view returns (RoundResult)',
  'function getTimeRemaining() external view returns (uint256)',
  'event ActionSubmitted(address indexed player, uint8 action, uint256 round)',
  'event RoundResolved(uint256 indexed round, uint256 actionsProcessed, uint256 resolvedAt)',
  'event PlayerAttacked(address indexed attacker, address indexed target, uint256 damage)',
  'event PlayerHealed(address indexed player, uint256 amount)',
  'event PlayerEliminated(address indexed player, address indexed killedBy)',
  'event PlayerJoined(address indexed player, uint256 health, uint256 attack)',
  'event PlayerDefended(address indexed player)',
  'event GameReset(uint256 newRound)',
  // Session key system
  'function authorizeSessionKey(address sessionKey, uint256 expiresAt) external',
  'function revokeSessionKey() external',
  'function getActionFor(uint256 round, address player) external view returns (uint8)',
  'function sessionKeys(address player) external view returns (address)',
  'function sessionKeyExpiry(address player) external view returns (uint256)',
  'event SessionKeyAuthorized(address indexed player, address indexed sessionKey, uint256 expiresAt)',
  'event SessionKeyRevoked(address indexed player, address indexed sessionKey)',
  // Prize pool & game phase
  'function getFullGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved, uint256 pool, uint256 maxRounds, uint8 gamePhase, address[3] topWinners)',
  'function getPrizeAmounts() external view returns (uint256 firstPrize, uint256 secondPrize, uint256 thirdPrize)',
  'function claimPrize() external',
  'function resetGame() external',
  'function entryFee() external pure returns (uint256)',
  'event GameEnded(address[3] winners, uint256 prizePool)',
  'event PrizeClaimed(address indexed winner, uint256 rank, uint256 amount)',
])

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`

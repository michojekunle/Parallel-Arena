import { parseAbi } from 'viem'

export const ABI = parseAbi([
  // Structs
  'struct Player { address addr; uint256 health; uint256 attack; uint256 defense; uint8 status; uint256 roundsPlayed; uint256 kills; uint256 rank; uint256 consecutiveHeals; }',
  'struct RoundResult { uint256 round; uint256 actionsProcessed; uint256 attacksLanded; uint256 healsApplied; uint256 defendersProtected; uint256 playersEliminated; uint256 resolvedAt; }',
  'struct AgentInfo { address owner; uint8 strategy; uint256 balance; bool active; uint256 gamesPlayed; uint256 totalKills; uint256 topThreeFinishes; }',
  'struct PlayerStats { uint32 gamesPlayed; uint32 wins; uint32 kills; uint32 totalDamage; }',

  // Join & game
  'function joinArena() external payable',
  'function submitAction(uint8 action) external',
  'function resolveRound() external',
  'function resetGame() external',
  'function entryFee() external pure returns (uint256)',

  // Quorum / start voting
  'function voteToStart() external',
  'function startGame() external',
  'function quorumRequired() external view returns (uint256)',
  'function startVoteCount() external view returns (uint256)',
  'function startVotes(address player) external view returns (bool)',
  'function humanPlayerCount() external view returns (uint256)',

  // Read
  'function getFullGameState() external view returns (uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers, bool resolved, uint256 pool, uint256 maxRounds, uint8 gamePhase, address[3] topWinners)',
  'function getAllPlayers() external view returns (Player[])',
  'function getPlayer(address addr) external view returns (Player)',
  'function getMyAction(uint256 round) external view returns (uint8)',
  'function getActionFor(uint256 round, address player) external view returns (uint8)',
  'function getRoundResult(uint256 round) external view returns (RoundResult)',
  'function getTimeRemaining() external view returns (uint256)',
  'function getPrizeAmounts() external view returns (uint256 firstPrize, uint256 secondPrize, uint256 thirdPrize)',
  'function getWinners() external view returns (address[3])',

  // Leaderboard
  'function getPlayerStats(address player) external view returns (PlayerStats)',
  'function getAllTimeParticipants() external view returns (address[])',
  'function getLeaderboard() external view returns (address[] addrs, PlayerStats[] stats)',

  // Prize
  'function claimPrize() external',

  // Session keys (legacy)
  'function authorizeSessionKey(address sessionKey, uint256 expiresAt) external',
  'function revokeSessionKey() external',
  'function sessionKeys(address player) external view returns (address)',
  'function sessionKeyExpiry(address player) external view returns (uint256)',

  // EIP-712 gasless permits
  'function submitActionWithPermit(address player, uint8 action, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  'function claimPrizeWithPermit(address player, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  'function nonces(address player) external view returns (uint256)',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',

  // Agent registry
  'function registerAgent(address agentAddress, uint8 strategy) external payable',
  'function depositAgent(address agentAddress) external payable',
  'function deactivateAgent() external',
  'function activateAgent() external',
  'function agentJoinArena(address agentAddress) external',
  'function getAgentInfo(address agentAddress) external view returns (AgentInfo)',
  'function getMyAgent() external view returns (address agentAddress, AgentInfo info)',
  'function getAllAgents() external view returns (address[] addrs, AgentInfo[] infos)',
  'function ownerAgent(address owner) external view returns (address)',
  'function isRegisteredAgent(address agent) external view returns (bool)',
  'function relayerAddress() external view returns (address)',

  // Rewards
  'function withdrawRewards() external',
  'function pendingRewards(address addr) external view returns (uint256)',

  // Events
  'event ActionSubmitted(address indexed player, uint8 action, uint256 round)',
  'event RoundResolved(uint256 indexed round, uint256 actionsProcessed, uint256 resolvedAt)',
  'event PlayerAttacked(address indexed attacker, address indexed target, uint256 damage)',
  'event PlayerHealed(address indexed player, uint256 amount)',
  'event PlayerEliminated(address indexed player, address indexed killedBy, uint256 rank)',
  'event PlayerJoined(address indexed player, uint256 health, uint256 attack, uint256 prizePool)',
  'event PlayerDefended(address indexed player)',
  'event GameEnded(address[3] winners, uint256 prizePool)',
  'event PrizeClaimed(address indexed winner, uint256 rank, uint256 amount)',
  'event GameReset(uint256 newRound)',
  'event AgentRegistered(address indexed owner, address indexed agentAddress, uint8 strategy, uint256 initialBalance)',
  'event AgentDeposited(address indexed agentAddress, uint256 amount)',
  'event RewardClaimed(address indexed recipient, uint256 amount)',
  'event SessionKeyAuthorized(address indexed player, address indexed sessionKey, uint256 expiresAt)',
  'event SessionKeyRevoked(address indexed player, address indexed sessionKey)',
  'event AttackMissed(address indexed attacker, uint256 round)',
  'event StartVoted(address indexed player, uint256 voteCount, uint256 quorumRequired)',
  'event GameStarted(uint256 roundDeadline)',
])

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`

export const AGENT_CREATION_FEE = 50_000_000_000_000_000n // 0.05 MON
export const AGENT_ROUND_FEE    = 1_000_000_000_000_000n  // 0.001 MON

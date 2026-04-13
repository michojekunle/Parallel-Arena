// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ParallelArenaV2
/// @notice Upgraded battle game contract with:
///   - Mutable game params (owner-configurable without redeploy)
///   - Mutable relayer address (operator rotation without redeploy)
///   - 7-day prize claim window before reset is allowed
///   - Emergency reset override for owner
///   - Paginated leaderboard getter (O(page) instead of O(all))
///   - O(1) allTimeParticipant membership check
///   - O(n+defCount) defender flagging (eliminates inner nested loop)
///   - Consecutive heal penalty: 20→10→5 HP after 2/4 consecutive heals
///   - 2-second resolve cooldown after deadline (MEV sandwich mitigation)
///   - block.prevrandao salt in target selection (unpredictable ordering)
contract ParallelArenaV2 {

    // ============================================================
    // TYPES
    // ============================================================

    enum Action       { NONE, ATTACK, DEFEND, HEAL }
    enum PlayerStatus { INACTIVE, ACTIVE, DEAD }
    enum GamePhase    { WAITING, ACTIVE, ENDED }
    enum AgentStrategy { RANDOM, AGGRESSIVE, DEFENSIVE, ADAPTIVE }

    struct Player {
        address addr;
        uint256 health;
        uint256 attack;
        uint256 defense;
        PlayerStatus status;
        uint256 roundsPlayed;
        uint256 kills;
        uint256 rank;
        uint256 consecutiveHeals; // tracks heal streaks for diminishing returns
    }

    struct RoundResult {
        uint256 round;
        uint256 actionsProcessed;
        uint256 attacksLanded;
        uint256 healsApplied;
        uint256 defendersProtected;
        uint256 playersEliminated;
        uint256 resolvedAt;
    }

    struct AgentInfo {
        address owner;
        AgentStrategy strategy;
        uint256 balance;
        bool active;
        uint256 gamesPlayed;
        uint256 totalKills;
        uint256 topThreeFinishes;
    }

    struct PlayerStats {
        uint32 gamesPlayed;
        uint32 wins;
        uint32 kills;
        uint32 totalDamage;
    }

    // ============================================================
    // MUTABLE GAME PARAMS (owner-settable)
    // ============================================================

    uint256 public ROUND_DURATION;
    uint256 public MAX_PLAYERS;
    uint256 public MAX_ROUNDS;
    uint256 public ENTRY_FEE;

    uint256 public constant STARTING_HEALTH = 100;

    // Prize split basis points
    uint256 public constant PRIZE_FIRST  = 5000;
    uint256 public constant PRIZE_SECOND = 3000;
    uint256 public constant PRIZE_THIRD  = 2000;

    // Agent economics (not user-facing, keep constant)
    uint256 public constant AGENT_CREATION_FEE = 0.05 ether;
    uint256 public constant AGENT_ROUND_FEE    = 0.001 ether;
    uint256 public constant RESOLVER_FEE_SHARE = 50;
    uint256 public constant RELAYER_FEE_SHARE  = 40;

    // 7-day window: winners must claim before owner can reset
    uint256 public constant CLAIM_WINDOW = 7 days;

    // 2s MEV mitigation: resolver must wait 2 seconds after deadline before calling resolveRound
    uint256 public constant RESOLVE_COOLDOWN = 2 seconds;

    // Diminishing heal amounts: index = min(consecutiveHeals, 2)
    uint256[3] private HEAL_AMOUNTS = [uint256(20), 10, 5];

    // ============================================================
    // STORAGE — Game
    // ============================================================

    uint256 public currentRound;
    uint256 public roundDeadline;
    GamePhase public phase;
    uint256 public prizePool;
    uint256 public gameEndedAt; // timestamp when _endGame() was called

    mapping(address => Player) public players;
    address[] public playerList;
    uint256 public activePlayerCount;

    address[3] public winners;
    mapping(address => bool) public prizeClaimed;

    mapping(uint256 => mapping(address => Action)) public roundActions;
    mapping(uint256 => bool) public roundResolved;
    mapping(uint256 => RoundResult) public roundResults;

    // ============================================================
    // STORAGE — Session keys
    // ============================================================

    mapping(address => address) public sessionKeys;
    mapping(address => address) public sessionKeyOwners;
    mapping(address => uint256) public sessionKeyExpiry;

    // ============================================================
    // STORAGE — EIP-712
    // ============================================================

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant ACTION_PERMIT_TYPEHASH = keccak256(
        "ActionPermit(address player,uint8 action,uint256 round,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant CLAIM_PERMIT_TYPEHASH = keccak256(
        "ClaimPermit(address player,uint256 nonce,uint256 deadline)"
    );
    mapping(address => uint256) public nonces;

    // ============================================================
    // STORAGE — Leaderboard
    // ============================================================

    mapping(address => PlayerStats) public playerStats;
    address[] public allTimeParticipants;
    mapping(address => bool) public isAllTimeParticipant; // O(1) membership check

    // ============================================================
    // STORAGE — Agents
    // ============================================================

    mapping(address => AgentInfo) public agentInfo;
    mapping(address => address)   public ownerAgent;
    address[] public agentList;
    mapping(address => bool) public isRegisteredAgent;

    // ============================================================
    // STORAGE — Fees / Ownership
    // ============================================================

    address public relayerAddress; // mutable — owner can rotate
    address public immutable owner;

    mapping(address => uint256) public pendingRewards;
    uint256 public treasuryBalance;
    mapping(uint256 => address) public roundResolver;

    // ============================================================
    // EVENTS
    // ============================================================

    event PlayerJoined(address indexed player, uint256 health, uint256 attack, uint256 prizePool);
    event ActionSubmitted(address indexed player, Action action, uint256 round);
    event RoundResolved(uint256 indexed round, uint256 actionsProcessed, uint256 resolvedAt);
    event PlayerAttacked(address indexed attacker, address indexed target, uint256 damage);
    event PlayerHealed(address indexed player, uint256 amount);
    event PlayerDefended(address indexed player);
    event PlayerEliminated(address indexed player, address indexed killedBy, uint256 rank);
    event GameEnded(address[3] winners, uint256 prizePool);
    event PrizeClaimed(address indexed winner, uint256 rank, uint256 amount);
    event GameReset(uint256 newRound);
    event AttackMissed(address indexed attacker, uint256 round);
    event SessionKeyAuthorized(address indexed player, address indexed sessionKey, uint256 expiresAt);
    event SessionKeyRevoked(address indexed player, address indexed sessionKey);
    event AgentRegistered(address indexed owner, address indexed agentAddress, uint8 strategy, uint256 initialBalance);
    event AgentDeposited(address indexed agentAddress, uint256 amount);
    event AgentDeactivated(address indexed agentAddress);
    event AgentActivated(address indexed agentAddress);
    event RewardClaimed(address indexed recipient, uint256 amount);
    event ParamUpdated(string param, uint256 newValue);
    event RelayerUpdated(address indexed newRelayer);

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor(address _relayerAddress) {
        owner          = msg.sender;
        relayerAddress = _relayerAddress;

        // Default params — owner can adjust between games
        ROUND_DURATION = 30 seconds;
        MAX_PLAYERS    = 20;
        MAX_ROUNDS     = 5;
        ENTRY_FEE      = 0.01 ether;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ParallelArenaV2"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier roundNotResolved() {
        require(!roundResolved[currentRound], "Round already resolved");
        _;
    }

    modifier gameActive() {
        require(phase == GamePhase.ACTIVE || phase == GamePhase.WAITING, "Game has ended");
        _;
    }

    // ============================================================
    // OWNER ADMIN — mutable params
    // ============================================================

    /// @notice Update ROUND_DURATION. Only effective for future rounds.
    function setRoundDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 10 seconds && newDuration <= 300 seconds, "Out of range");
        require(phase == GamePhase.WAITING || phase == GamePhase.ENDED, "Game in progress");
        ROUND_DURATION = newDuration;
        emit ParamUpdated("ROUND_DURATION", newDuration);
    }

    function setMaxPlayers(uint256 newMax) external onlyOwner {
        require(newMax >= 2 && newMax <= 100, "Out of range");
        require(phase == GamePhase.WAITING || phase == GamePhase.ENDED, "Game in progress");
        MAX_PLAYERS = newMax;
        emit ParamUpdated("MAX_PLAYERS", newMax);
    }

    function setMaxRounds(uint256 newMax) external onlyOwner {
        require(newMax >= 1 && newMax <= 20, "Out of range");
        require(phase == GamePhase.WAITING || phase == GamePhase.ENDED, "Game in progress");
        MAX_ROUNDS = newMax;
        emit ParamUpdated("MAX_ROUNDS", newMax);
    }

    function setEntryFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1 ether, "Fee too high");
        require(phase == GamePhase.WAITING || phase == GamePhase.ENDED, "Game in progress");
        ENTRY_FEE = newFee;
        emit ParamUpdated("ENTRY_FEE", newFee);
    }

    /// @notice Rotate the relayer wallet without redeploying.
    ///         Critical for key rotation if relayer key is compromised.
    function setRelayerAddress(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "Zero address");
        relayerAddress = newRelayer;
        emit RelayerUpdated(newRelayer);
    }

    /// @notice Emergency reset: bypass the 7-day claim window.
    ///         Use only in case of stuck game / exploit. Forfeits unclaimed prizes.
    function emergencyReset() external onlyOwner {
        _resetGame();
    }

    // ============================================================
    // JOIN
    // ============================================================

    function joinArena() external payable {
        require(phase != GamePhase.ENDED, "Game ended - wait for reset");
        require(msg.value == ENTRY_FEE, "Wrong entry fee");
        require(playerList.length < MAX_PLAYERS, "Arena full");
        require(players[msg.sender].status != PlayerStatus.ACTIVE, "Already in arena");

        prizePool += msg.value;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            msg.sender, block.timestamp, playerList.length
        )));
        uint256 atkPower = 10 + (seed % 11);
        uint256 defPower = 5  + ((seed >> 8) % 6);

        players[msg.sender] = Player({
            addr: msg.sender,
            health: STARTING_HEALTH,
            attack: atkPower,
            defense: defPower,
            status: PlayerStatus.ACTIVE,
            roundsPlayed: 0,
            kills: 0,
            rank: 0,
            consecutiveHeals: 0
        });
        playerList.push(msg.sender);
        activePlayerCount++;

        // O(1) all-time participant tracking
        if (!isAllTimeParticipant[msg.sender]) {
            isAllTimeParticipant[msg.sender] = true;
            allTimeParticipants.push(msg.sender);
        }

        if (activePlayerCount == 1) {
            phase = GamePhase.ACTIVE;
            roundDeadline = block.timestamp + ROUND_DURATION;
        }

        emit PlayerJoined(msg.sender, STARTING_HEALTH, atkPower, prizePool);
    }

    // ============================================================
    // AGENT REGISTRY
    // ============================================================

    function registerAgent(address agentAddress, uint8 strategy) external payable {
        require(msg.value >= AGENT_CREATION_FEE, "Insufficient creation fee");
        require(strategy <= uint8(AgentStrategy.ADAPTIVE), "Invalid strategy");
        require(agentAddress != address(0), "Invalid agent address");
        require(ownerAgent[msg.sender] == address(0), "Already have an agent");
        require(!isRegisteredAgent[agentAddress], "Agent address already registered");
        require(agentAddress != msg.sender, "Agent must be different from owner");

        uint256 initialBalance = msg.value - AGENT_CREATION_FEE;
        uint256 resolverShare = AGENT_CREATION_FEE * 50 / 100;
        uint256 relayerShare  = AGENT_CREATION_FEE * 40 / 100;
        uint256 treasuryShare = AGENT_CREATION_FEE - resolverShare - relayerShare;

        pendingRewards[relayerAddress] += relayerShare + resolverShare;
        treasuryBalance += treasuryShare;

        agentInfo[agentAddress] = AgentInfo({
            owner: msg.sender,
            strategy: AgentStrategy(strategy),
            balance: initialBalance,
            active: true,
            gamesPlayed: 0,
            totalKills: 0,
            topThreeFinishes: 0
        });
        ownerAgent[msg.sender]          = agentAddress;
        isRegisteredAgent[agentAddress] = true;
        agentList.push(agentAddress);

        emit AgentRegistered(msg.sender, agentAddress, strategy, initialBalance);
    }

    function depositAgent(address agentAddress) external payable {
        require(isRegisteredAgent[agentAddress], "Not a registered agent");
        require(
            agentInfo[agentAddress].owner == msg.sender || msg.sender == agentAddress,
            "Not your agent"
        );
        require(msg.value > 0, "No value sent");
        agentInfo[agentAddress].balance += msg.value;
        emit AgentDeposited(agentAddress, msg.value);
    }

    function deactivateAgent() external {
        address agentAddress = ownerAgent[msg.sender];
        require(agentAddress != address(0), "No registered agent");
        agentInfo[agentAddress].active = false;
        emit AgentDeactivated(agentAddress);
    }

    function activateAgent() external {
        address agentAddress = ownerAgent[msg.sender];
        require(agentAddress != address(0), "No registered agent");
        agentInfo[agentAddress].active = true;
        emit AgentActivated(agentAddress);
    }

    function agentJoinArena(address agentAddress) external {
        require(msg.sender == relayerAddress, "Only relayer");
        require(isRegisteredAgent[agentAddress], "Not registered");
        AgentInfo storage info = agentInfo[agentAddress];
        require(info.active, "Agent inactive");
        require(info.balance >= ENTRY_FEE, "Insufficient agent balance");
        require(phase != GamePhase.ENDED, "Game ended");
        require(playerList.length < MAX_PLAYERS, "Arena full");
        require(players[agentAddress].status != PlayerStatus.ACTIVE, "Already in arena");

        info.balance -= ENTRY_FEE;
        prizePool    += ENTRY_FEE;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            agentAddress, block.timestamp, playerList.length
        )));
        uint256 atkPower = 10 + (seed % 11);
        uint256 defPower = 5  + ((seed >> 8) % 6);

        players[agentAddress] = Player({
            addr: agentAddress,
            health: STARTING_HEALTH,
            attack: atkPower,
            defense: defPower,
            status: PlayerStatus.ACTIVE,
            roundsPlayed: 0,
            kills: 0,
            rank: 0,
            consecutiveHeals: 0
        });
        playerList.push(agentAddress);
        activePlayerCount++;

        if (!isAllTimeParticipant[agentAddress]) {
            isAllTimeParticipant[agentAddress] = true;
            allTimeParticipants.push(agentAddress);
        }

        if (activePlayerCount == 1) {
            phase = GamePhase.ACTIVE;
            roundDeadline = block.timestamp + ROUND_DURATION;
        }

        emit PlayerJoined(agentAddress, STARTING_HEALTH, atkPower, prizePool);
    }

    // ============================================================
    // SESSION KEY MANAGEMENT
    // ============================================================

    function authorizeSessionKey(address sessionKey, uint256 expiresAt) external {
        require(players[msg.sender].status == PlayerStatus.ACTIVE, "Not an active player");
        require(sessionKey != address(0), "Invalid session key");
        require(expiresAt > block.timestamp, "Expiry must be in future");
        require(expiresAt <= block.timestamp + 7 days, "Max 7-day session");

        address prevKey = sessionKeys[msg.sender];
        if (prevKey != address(0)) delete sessionKeyOwners[prevKey];

        sessionKeys[msg.sender]      = sessionKey;
        sessionKeyOwners[sessionKey] = msg.sender;
        sessionKeyExpiry[msg.sender] = expiresAt;

        emit SessionKeyAuthorized(msg.sender, sessionKey, expiresAt);
    }

    function revokeSessionKey() external {
        address key = sessionKeys[msg.sender];
        require(key != address(0), "No active session key");
        delete sessionKeyOwners[key];
        delete sessionKeys[msg.sender];
        delete sessionKeyExpiry[msg.sender];
        emit SessionKeyRevoked(msg.sender, key);
    }

    // ============================================================
    // SUBMIT ACTION — PARALLEL CORE
    // ============================================================

    function submitAction(Action action) external roundNotResolved {
        require(action != Action.NONE, "Must choose an action");

        address player = msg.sender;
        address skOwner = sessionKeyOwners[msg.sender];
        if (skOwner != address(0)) {
            require(sessionKeyExpiry[skOwner] >= block.timestamp, "Session key expired");
            player = skOwner;
        }

        require(players[player].status == PlayerStatus.ACTIVE, "Not an active player");
        require(roundActions[currentRound][player] == Action.NONE, "Already acted this round");

        roundActions[currentRound][player] = action;
        players[player].roundsPlayed++;
        emit ActionSubmitted(player, action, currentRound);
    }

    // ============================================================
    // RESOLVE ROUND
    // ============================================================

    function resolveRound() external {
        require(!roundResolved[currentRound], "Already resolved");
        require(phase == GamePhase.ACTIVE, "Game not active");
        // 2-second MEV mitigation: resolver must wait after deadline
        require(
            (block.timestamp >= roundDeadline + RESOLVE_COOLDOWN) || _allPlayersActed(),
            "Round not ready"
        );

        uint256 round = currentRound;
        roundResolver[round] = msg.sender;

        uint256 actionsProcessed;
        uint256 attacksLanded;
        uint256 healsApplied;
        uint256 defendersProtected;
        uint256 playersEliminated;

        address[] memory activePlayers = _getActivePlayers();
        uint256 n = activePlayers.length;

        // --- Use prevrandao as a salt to randomise traversal order ---
        // This prevents any single player knowing exactly who will be targeted
        // in advance by observing the mempool, since prevrandao is only known
        // once the block is proposed.
        uint256 randSalt = uint256(block.prevrandao);

        address[] memory attackers = new address[](n);
        address[] memory healers   = new address[](n);
        uint256 atkCount; uint256 healCount;

        // Single-pass O(n+defCount) defender flag array instead of nested loop
        bool[] memory isDefending = new bool[](n);

        for (uint256 i = 0; i < n; i++) {
            Action a = roundActions[round][activePlayers[i]];
            if (a == Action.ATTACK)  { attackers[atkCount++] = activePlayers[i]; actionsProcessed++; }
            else if (a == Action.DEFEND) { isDefending[i] = true; actionsProcessed++; defendersProtected++; emit PlayerDefended(activePlayers[i]); }
            else if (a == Action.HEAL)   { healers[healCount++]  = activePlayers[i]; actionsProcessed++; }
        }

        // Resolve attacks with prevrandao-salted target selection
        for (uint256 i = 0; i < atkCount; i++) {
            address atk = attackers[i];
            (address target,) = _findTarget(activePlayers, n, atk, isDefending, randSalt ^ uint256(uint160(atk)));
            if (target == address(0)) {
                emit AttackMissed(atk, round);
                continue;
            }

            uint256 finalDmg = players[atk].attack;
            if (players[target].health <= finalDmg) {
                players[target].health = 0;
                players[target].status = PlayerStatus.DEAD;
                players[target].rank   = activePlayerCount;
                activePlayerCount--;
                players[atk].kills++;
                playersEliminated++;
                emit PlayerEliminated(target, atk, players[target].rank);
            } else {
                players[target].health -= finalDmg;
            }
            attacksLanded++;
            emit PlayerAttacked(atk, target, finalDmg);
        }

        // Resolve heals with diminishing returns
        for (uint256 i = 0; i < healCount; i++) {
            address h = healers[i];
            if (players[h].status != PlayerStatus.ACTIVE) continue;

            uint256 streakIdx = players[h].consecutiveHeals >= 2 ? 2 : players[h].consecutiveHeals;
            uint256 healAmt = HEAL_AMOUNTS[streakIdx];
            uint256 newHealth = players[h].health + healAmt;
            players[h].health = newHealth > STARTING_HEALTH ? STARTING_HEALTH : newHealth;
            players[h].consecutiveHeals++;
            healsApplied++;
            emit PlayerHealed(h, healAmt);
        }

        // Reset consecutive heal counter for non-healers
        for (uint256 i = 0; i < n; i++) {
            address p = activePlayers[i];
            if (roundActions[round][p] != Action.HEAL && players[p].consecutiveHeals > 0) {
                players[p].consecutiveHeals = 0;
            }
        }

        // Resolver bounty from agent round fees
        uint256 resolverBounty = _calcResolverBounty(activePlayers, n);
        if (resolverBounty > 0) {
            pendingRewards[msg.sender] += resolverBounty;
        }

        roundResolved[round] = true;
        roundResults[round] = RoundResult({
            round: round,
            actionsProcessed: actionsProcessed,
            attacksLanded: attacksLanded,
            healsApplied: healsApplied,
            defendersProtected: defendersProtected,
            playersEliminated: playersEliminated,
            resolvedAt: block.timestamp
        });
        emit RoundResolved(round, actionsProcessed, block.timestamp);

        currentRound++;
        roundDeadline = block.timestamp + ROUND_DURATION;

        if (currentRound >= MAX_ROUNDS || activePlayerCount == 0) {
            _endGame();
        }
    }

    // ============================================================
    // PRIZE CLAIMING
    // ============================================================

    function claimPrize() external {
        require(phase == GamePhase.ENDED, "Game not ended");
        require(!prizeClaimed[msg.sender], "Already claimed");
        _payPrize(msg.sender);
    }

    function resetGame() external {
        require(phase == GamePhase.ENDED, "Game not ended");
        require(
            block.timestamp >= gameEndedAt + CLAIM_WINDOW || msg.sender == owner,
            "Claim window still open"
        );
        _resetGame();
    }

    // ============================================================
    // EIP-712 PERMIT FUNCTIONS
    // ============================================================

    function submitActionWithPermit(
        address player,
        uint8   action,
        uint256 nonce,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline,                        "Permit expired");
        require(!roundResolved[currentRound],                      "Round already resolved");
        require(nonces[player] == nonce,                           "Invalid nonce");
        require(players[player].status == PlayerStatus.ACTIVE,    "Not active");
        require(roundActions[currentRound][player] == Action.NONE, "Already acted");
        require(action != uint8(Action.NONE),                      "Must choose an action");

        bytes32 structHash = keccak256(abi.encode(
            ACTION_PERMIT_TYPEHASH, player, action, currentRound, nonce, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == player, "Invalid signature");

        nonces[player]++;

        if (isRegisteredAgent[player] && agentInfo[player].balance >= AGENT_ROUND_FEE) {
            agentInfo[player].balance -= AGENT_ROUND_FEE;
            uint256 resolverShare = AGENT_ROUND_FEE * RESOLVER_FEE_SHARE / 100;
            uint256 relayerShare  = AGENT_ROUND_FEE * RELAYER_FEE_SHARE  / 100;
            uint256 treasury      = AGENT_ROUND_FEE - resolverShare - relayerShare;
            pendingRewards[address(0)] += resolverShare;
            pendingRewards[relayerAddress] += relayerShare;
            treasuryBalance += treasury;
        }

        roundActions[currentRound][player] = Action(action);
        players[player].roundsPlayed++;
        emit ActionSubmitted(player, Action(action), currentRound);
    }

    function claimPrizeWithPermit(
        address player,
        uint256 nonce,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        require(phase == GamePhase.ENDED,        "Game not ended");
        require(block.timestamp <= deadline,      "Permit expired");
        require(nonces[player] == nonce,          "Invalid nonce");
        require(!prizeClaimed[player],            "Already claimed");

        bytes32 structHash = keccak256(abi.encode(CLAIM_PERMIT_TYPEHASH, player, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == player, "Invalid signature");

        nonces[player]++;
        _payPrize(player);
    }

    // ============================================================
    // REWARD WITHDRAWAL
    // ============================================================

    function claimReward() external {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "Nothing to claim");
        pendingRewards[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit RewardClaimed(msg.sender, amount);
    }

    function withdrawTreasury(address recipient) external onlyOwner {
        require(recipient != address(0), "Zero address");
        uint256 amount = treasuryBalance;
        treasuryBalance = 0;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    struct FullGameState {
        uint256 round;
        uint256 deadline;
        uint256 activePlayers;
        uint256 totalPlayers;
        bool    resolved;
        uint256 pool;
        uint256 maxRounds;
        GamePhase gamePhase;
        address[3] topWinners;
    }

    function getFullGameState() external view returns (
        uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers,
        bool resolved, uint256 pool, uint256 maxRounds, GamePhase gamePhase,
        address[3] memory topWinners
    ) {
        round         = currentRound;
        deadline      = roundDeadline;
        activePlayers = activePlayerCount;
        totalPlayers  = playerList.length;
        resolved      = roundResolved[currentRound];
        pool          = prizePool;
        maxRounds     = MAX_ROUNDS;
        gamePhase     = phase;
        topWinners    = winners;
    }

    function getAllPlayers() external view returns (Player[] memory) {
        Player[] memory result = new Player[](playerList.length);
        for (uint256 i = 0; i < playerList.length; i++) {
            result[i] = players[playerList[i]];
        }
        return result;
    }

    function getActionFor(uint256 round, address player) external view returns (Action) {
        return roundActions[round][player];
    }

    function getRoundResult(uint256 round) external view returns (RoundResult memory) {
        return roundResults[round];
    }

    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= roundDeadline) return 0;
        return roundDeadline - block.timestamp;
    }

    function getPrizeAmounts() external view returns (
        uint256 firstPrize, uint256 secondPrize, uint256 thirdPrize
    ) {
        firstPrize  = (prizePool * PRIZE_FIRST)  / 10000;
        secondPrize = (prizePool * PRIZE_SECOND) / 10000;
        thirdPrize  = (prizePool * PRIZE_THIRD)  / 10000;
    }

    function entryFee() external view returns (uint256) { return ENTRY_FEE; }
    function getWinners() external view returns (address[3] memory) { return winners; }

    function getAgentInfo(address agentAddress) external view returns (AgentInfo memory) {
        return agentInfo[agentAddress];
    }

    function getPlayerStats(address player) external view returns (PlayerStats memory) {
        return playerStats[player];
    }

    function getAllTimeParticipants() external view returns (address[] memory) {
        return allTimeParticipants;
    }

    /// @notice Paginated leaderboard — avoids O(all) unbounded gas.
    ///         Returns (addresses, stats, total) for a page.
    function getLeaderboardPage(uint256 offset, uint256 limit)
        external view
        returns (address[] memory addrs, PlayerStats[] memory stats, uint256 total)
    {
        total = allTimeParticipants.length;
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = offset < total ? end - offset : 0;

        addrs = new address[](count);
        stats = new PlayerStats[](count);

        for (uint256 i = 0; i < count; i++) {
            addrs[i] = allTimeParticipants[offset + i];
            stats[i] = playerStats[addrs[i]];
        }
    }

    /// @notice Convenience: return ALL participants with stats (use paginated version for large sets).
    function getLeaderboard()
        external view
        returns (address[] memory addrs, PlayerStats[] memory stats)
    {
        uint256 len = allTimeParticipants.length;
        addrs = new address[](len);
        stats = new PlayerStats[](len);
        for (uint256 i = 0; i < len; i++) {
            addrs[i] = allTimeParticipants[i];
            stats[i] = playerStats[addrs[i]];
        }
    }

    function getAllAgents() external view returns (address[] memory addrs, AgentInfo[] memory infos) {
        addrs = agentList;
        infos = new AgentInfo[](agentList.length);
        for (uint256 i = 0; i < agentList.length; i++) {
            infos[i] = agentInfo[agentList[i]];
        }
    }

    function sessionKeyExpiry_(address player) external view returns (uint256) {
        return sessionKeyExpiry[player];
    }

    // ============================================================
    // INTERNAL
    // ============================================================

    function _getActivePlayers() internal view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < playerList.length; i++) {
            if (players[playerList[i]].status == PlayerStatus.ACTIVE) count++;
        }
        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < playerList.length; i++) {
            if (players[playerList[i]].status == PlayerStatus.ACTIVE) {
                active[idx++] = playerList[i];
            }
        }
        return active;
    }

    function _allPlayersActed() internal view returns (bool) {
        for (uint256 i = 0; i < playerList.length; i++) {
            address p = playerList[i];
            if (players[p].status == PlayerStatus.ACTIVE &&
                roundActions[currentRound][p] == Action.NONE) {
                return false;
            }
        }
        return true;
    }

    /// @dev Target selection with prevrandao salt — picks lowest-HP non-defending
    ///      player among those starting from a randomised offset into the array.
    ///      Lowest-HP priority is preserved (fairness), but tie-breaking is random.
    function _findTarget(
        address[] memory activePlayers,
        uint256 n,
        address attacker,
        bool[] memory isDefending,
        uint256 salt
    ) internal view returns (address target, uint256 targetIdx) {
        target = address(0);
        targetIdx = type(uint256).max;
        uint256 lowestHp = type(uint256).max;
        // Randomise starting index to break ties non-deterministically
        uint256 startIdx = n > 0 ? salt % n : 0;

        for (uint256 k = 0; k < n; k++) {
            uint256 i = (startIdx + k) % n;
            address p = activePlayers[i];
            if (p == attacker) continue;
            if (players[p].status != PlayerStatus.ACTIVE) continue;
            if (isDefending[i]) continue;
            if (players[p].health < lowestHp) {
                lowestHp  = players[p].health;
                target    = p;
                targetIdx = i;
            }
        }
    }

    function _calcResolverBounty(address[] memory activePlayers, uint256 n)
        internal view returns (uint256 bounty)
    {
        uint256 agentCount = 0;
        for (uint256 i = 0; i < n; i++) {
            if (isRegisteredAgent[activePlayers[i]] &&
                roundActions[currentRound][activePlayers[i]] != Action.NONE) {
                agentCount++;
            }
        }
        bounty = agentCount * AGENT_ROUND_FEE * RESOLVER_FEE_SHARE / 100;
        uint256 cap = pendingRewards[address(0)];
        if (bounty > cap) bounty = cap;
    }

    function _endGame() internal {
        phase       = GamePhase.ENDED;
        gameEndedAt = block.timestamp;

        address[] memory alive = _getActivePlayers();
        uint256 aliveCount = alive.length;

        // Sort survivors by health descending (bubble sort — n ≤ MAX_PLAYERS)
        for (uint256 i = 0; i < aliveCount; i++) {
            for (uint256 j = i + 1; j < aliveCount; j++) {
                if (players[alive[j]].health > players[alive[i]].health) {
                    address tmp = alive[i]; alive[i] = alive[j]; alive[j] = tmp;
                }
            }
        }
        for (uint256 i = 0; i < aliveCount && i < 3; i++) {
            players[alive[i]].rank = i + 1;
            winners[i] = alive[i];
        }

        // Update cross-game stats
        for (uint256 i = 0; i < playerList.length; i++) {
            address p = playerList[i];
            if (isRegisteredAgent[p]) {
                agentInfo[p].gamesPlayed++;
                agentInfo[p].totalKills += players[p].kills;
                for (uint256 j = 0; j < 3; j++) {
                    if (winners[j] == p) { agentInfo[p].topThreeFinishes++; break; }
                }
            }
            playerStats[p].gamesPlayed++;
            playerStats[p].kills += uint32(players[p].kills);
            for (uint256 j = 0; j < 3; j++) {
                if (winners[j] == p) { playerStats[p].wins++; break; }
            }
        }

        // Flush resolver pool — fallback to msg.sender
        uint256 resolverPool = pendingRewards[address(0)];
        if (resolverPool > 0) {
            address lastResolver = currentRound > 0 ? roundResolver[currentRound - 1] : address(0);
            if (lastResolver == address(0)) lastResolver = msg.sender;
            pendingRewards[address(0)] = 0;
            pendingRewards[lastResolver] += resolverPool;
        }

        emit GameEnded(winners, prizePool);
    }

    function _payPrize(address player) internal {
        uint256 rank = 0;
        uint256 pct  = 0;
        for (uint256 i = 0; i < 3; i++) {
            if (winners[i] == player) {
                rank = i + 1;
                if (i == 0)      pct = PRIZE_FIRST;
                else if (i == 1) pct = PRIZE_SECOND;
                else             pct = PRIZE_THIRD;
                break;
            }
        }
        require(rank > 0, "Not a winner");
        prizeClaimed[player] = true;
        uint256 amount = (prizePool * pct) / 10000;
        (bool ok,) = player.call{value: amount}("");
        require(ok, "Transfer failed");
        emit PrizeClaimed(player, rank, amount);
    }

    function _resetGame() internal {
        for (uint256 i = 0; i < playerList.length; i++) {
            address p = playerList[i];
            address sk = sessionKeys[p];
            if (sk != address(0)) {
                delete sessionKeyOwners[sk];
                delete sessionKeys[p];
                delete sessionKeyExpiry[p];
            }
            delete players[p];
            delete prizeClaimed[p];
        }
        delete playerList;
        delete winners;

        for (uint256 i = 0; i <= currentRound; i++) {
            delete roundResolved[i];
            delete roundResults[i];
            delete roundResolver[i];
        }

        activePlayerCount = 0;
        currentRound      = 0;
        roundDeadline     = 0;
        prizePool         = 0;
        gameEndedAt       = 0;
        phase             = GamePhase.WAITING;
        emit GameReset(0);
    }

    receive() external payable {}
}

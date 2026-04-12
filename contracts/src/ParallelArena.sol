// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ParallelArena
/// @notice Real-time onchain battle game demonstrating Monad's parallel execution.
///         Players pay an entry fee, fight over 5 rounds, top 3 survivors claim the prize pool.
///         Supports human players (EIP-712 gasless permits) and registered AI agents.
///
/// Parallel execution proof:
///   submitAction() / submitActionWithPermit() write ONLY to roundActions[round][player].
///   N players submitting simultaneously = N independent writes = Monad parallelises them.
///   resolveRound() is the single sequential step — one tx processes everything.
contract ParallelArena {

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
        uint256 rank;           // final rank (1 = winner); 0 = not ranked yet
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
        address owner;           // human who registered this agent
        AgentStrategy strategy;
        uint256 balance;         // deposited MON to pay entry fees
        bool active;             // owner can pause
        uint256 gamesPlayed;
        uint256 totalKills;
        uint256 topThreeFinishes;
    }

    // ============================================================
    // CONSTANTS
    // ============================================================

    uint256 public constant ROUND_DURATION  = 30 seconds;
    uint256 public constant MAX_PLAYERS     = 20;
    uint256 public constant MAX_ROUNDS      = 5;
    uint256 public constant STARTING_HEALTH = 100;
    uint256 public constant ENTRY_FEE       = 0.01 ether;

    // Prize split basis points (out of 10000)
    uint256 public constant PRIZE_FIRST  = 5000; // 50%
    uint256 public constant PRIZE_SECOND = 3000; // 30%
    uint256 public constant PRIZE_THIRD  = 2000; // 20%

    // Agent economics
    uint256 public constant AGENT_CREATION_FEE = 0.05 ether; // one-time registration
    uint256 public constant AGENT_ROUND_FEE    = 0.001 ether; // per round played by agent

    // Fee split on agent round fee: 50% resolver, 40% relayer, 10% treasury
    uint256 public constant RESOLVER_FEE_SHARE = 50;
    uint256 public constant RELAYER_FEE_SHARE  = 40;
    // remaining 10% stays as treasury

    // ============================================================
    // STORAGE — Game
    // ============================================================

    uint256 public currentRound;
    uint256 public roundDeadline;
    GamePhase public phase;
    uint256 public prizePool;

    mapping(address => Player) public players;
    address[] public playerList;
    uint256 public activePlayerCount;

    // Top-3 finishers in order [0]=1st, [1]=2nd, [2]=3rd
    address[3] public winners;
    mapping(address => bool) public prizeClaimed;

    // round => player => action (PARALLEL-SAFE)
    mapping(uint256 => mapping(address => Action)) public roundActions;
    mapping(uint256 => bool) public roundResolved;
    mapping(uint256 => RoundResult) public roundResults;

    // ============================================================
    // STORAGE — Session keys (kept for backwards compat)
    // ============================================================

    mapping(address => address) public sessionKeys;
    mapping(address => address) public sessionKeyOwners;
    mapping(address => uint256) public sessionKeyExpiry;

    // ============================================================
    // STORAGE — EIP-712 permits
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
    // STORAGE — Agent registry
    // ============================================================

    mapping(address => AgentInfo) public agentInfo;  // agentAddress => info
    mapping(address => address)   public ownerAgent; // owner => agentAddress
    address[] public agentList;
    mapping(address => bool) public isRegisteredAgent;

    // ============================================================
    // STORAGE — Fee pools
    // ============================================================

    address public immutable relayerAddress; // relayer wallet, set in constructor
    address public immutable owner;          // deployer — receives treasury share

    // Accumulated claimable rewards (not part of prizePool)
    mapping(address => uint256) public pendingRewards;
    uint256 public treasuryBalance;

    // Per-round: track last resolver for reward
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

    event SessionKeyAuthorized(address indexed player, address indexed sessionKey, uint256 expiresAt);
    event SessionKeyRevoked(address indexed player, address indexed sessionKey);

    event AgentRegistered(address indexed owner, address indexed agentAddress, uint8 strategy, uint256 initialBalance);
    event AgentDeposited(address indexed agentAddress, uint256 amount);
    event AgentDeactivated(address indexed agentAddress);
    event AgentActivated(address indexed agentAddress);
    event RewardClaimed(address indexed recipient, uint256 amount);

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor(address _relayerAddress) {
        owner          = msg.sender;
        relayerAddress = _relayerAddress;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ParallelArena"),
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
            rank: 0
        });
        playerList.push(msg.sender);
        activePlayerCount++;

        if (activePlayerCount == 1) {
            phase = GamePhase.ACTIVE;
            roundDeadline = block.timestamp + ROUND_DURATION;
        }

        emit PlayerJoined(msg.sender, STARTING_HEALTH, atkPower, prizePool);
    }

    // ============================================================
    // AGENT REGISTRY
    // ============================================================

    /// @notice Register an AI agent. Caller is the owner, `agentAddress` is the EOA the
    ///         runner uses to sign permits. Must pay AGENT_CREATION_FEE + initial balance.
    ///         Initial balance = msg.value - AGENT_CREATION_FEE; used for entry fees.
    function registerAgent(address agentAddress, uint8 strategy) external payable {
        require(msg.value >= AGENT_CREATION_FEE, "Insufficient creation fee");
        require(strategy <= uint8(AgentStrategy.ADAPTIVE), "Invalid strategy");
        require(agentAddress != address(0), "Invalid agent address");
        require(ownerAgent[msg.sender] == address(0), "Already have an agent");
        require(!isRegisteredAgent[agentAddress], "Agent address already registered");
        require(agentAddress != msg.sender, "Agent must be different from owner");

        uint256 initialBalance = msg.value - AGENT_CREATION_FEE;

        // Split creation fee: 50% resolver pool, 40% relayer, 10% treasury
        uint256 resolverShare = AGENT_CREATION_FEE * 50 / 100;
        uint256 relayerShare  = AGENT_CREATION_FEE * 40 / 100;
        uint256 treasuryShare = AGENT_CREATION_FEE - resolverShare - relayerShare;

        // Relayer and treasury accumulate; resolver pool is distributed on resolve
        pendingRewards[relayerAddress] += relayerShare;
        treasuryBalance += treasuryShare;
        // resolverShare goes into a shared pool distributed across round resolvers
        // For simplicity: relayer gets resolverShare too (demo)
        pendingRewards[relayerAddress] += resolverShare;

        agentInfo[agentAddress] = AgentInfo({
            owner: msg.sender,
            strategy: AgentStrategy(strategy),
            balance: initialBalance,
            active: true,
            gamesPlayed: 0,
            totalKills: 0,
            topThreeFinishes: 0
        });
        ownerAgent[msg.sender]     = agentAddress;
        isRegisteredAgent[agentAddress] = true;
        agentList.push(agentAddress);

        emit AgentRegistered(msg.sender, agentAddress, strategy, initialBalance);
    }

    /// @notice Top up an agent's playing balance (for entry fees).
    function depositAgent(address agentAddress) external payable {
        require(isRegisteredAgent[agentAddress], "Not a registered agent");
        require(
            agentInfo[agentAddress].owner == msg.sender ||
            msg.sender == agentAddress,
            "Not your agent"
        );
        require(msg.value > 0, "No value sent");
        agentInfo[agentAddress].balance += msg.value;
        emit AgentDeposited(agentAddress, msg.value);
    }

    /// @notice Pause agent (owner only).
    function deactivateAgent() external {
        address agentAddress = ownerAgent[msg.sender];
        require(agentAddress != address(0), "No registered agent");
        agentInfo[agentAddress].active = false;
        emit AgentDeactivated(agentAddress);
    }

    /// @notice Resume agent (owner only).
    function activateAgent() external {
        address agentAddress = ownerAgent[msg.sender];
        require(agentAddress != address(0), "No registered agent");
        agentInfo[agentAddress].active = true;
        emit AgentActivated(agentAddress);
    }

    /// @notice Agent runner calls this to spend from agent balance for entry fee.
    ///         Only the relayer (trusted runner) may call this.
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
        prizePool += ENTRY_FEE;

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
            rank: 0
        });
        playerList.push(agentAddress);
        activePlayerCount++;

        if (activePlayerCount == 1) {
            phase = GamePhase.ACTIVE;
            roundDeadline = block.timestamp + ROUND_DURATION;
        }

        emit PlayerJoined(agentAddress, STARTING_HEALTH, atkPower, prizePool);
    }

    // ============================================================
    // SESSION KEY MANAGEMENT (kept for direct-wallet flows)
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
    // RESOLVE ROUND — pays resolver reward from pending fees
    // ============================================================

    function resolveRound() external {
        require(!roundResolved[currentRound], "Already resolved");
        require(phase == GamePhase.ACTIVE, "Game not active");
        require(
            block.timestamp >= roundDeadline || _allPlayersActed(),
            "Round not ready: wait for deadline or all players to act"
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

        address[] memory attackers = new address[](n);
        address[] memory defenders = new address[](n);
        address[] memory healers   = new address[](n);
        uint256 atkCount; uint256 defCount; uint256 healCount;

        for (uint256 i = 0; i < n; i++) {
            Action a = roundActions[round][activePlayers[i]];
            if (a == Action.ATTACK) { attackers[atkCount++] = activePlayers[i]; actionsProcessed++; }
            if (a == Action.DEFEND) { defenders[defCount++] = activePlayers[i]; actionsProcessed++; }
            if (a == Action.HEAL)   { healers[healCount++]  = activePlayers[i]; actionsProcessed++; }
        }

        // Defender flags
        bool[] memory isDefending = new bool[](n);
        for (uint256 i = 0; i < defCount; i++) {
            for (uint256 j = 0; j < n; j++) {
                if (activePlayers[j] == defenders[i]) { isDefending[j] = true; break; }
            }
            defendersProtected++;
            emit PlayerDefended(defenders[i]);
        }

        // Resolve attacks
        for (uint256 i = 0; i < atkCount; i++) {
            address atk = attackers[i];
            (address target,) = _findTarget(activePlayers, n, atk, isDefending);
            if (target == address(0)) continue;

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

        // Resolve heals
        for (uint256 i = 0; i < healCount; i++) {
            address h = healers[i];
            if (players[h].status != PlayerStatus.ACTIVE) continue;
            uint256 newHealth = players[h].health + 20;
            players[h].health = newHealth > STARTING_HEALTH ? STARTING_HEALTH : newHealth;
            healsApplied++;
            emit PlayerHealed(h, 20);
        }

        // Pay resolver a bounty from agent round fees if agents participated
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

        // End game when MAX_ROUNDS completed OR ALL players eliminated
        bool maxRoundsReached = currentRound >= MAX_ROUNDS;
        bool allEliminated    = activePlayerCount == 0;

        if (maxRoundsReached || allEliminated) {
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

    // ============================================================
    // EIP-712 PERMIT FUNCTIONS
    // ============================================================

    /// @notice Submit an action on behalf of a player who signed an ActionPermit.
    ///         Callable by anyone (the relayer). Player pays no gas.
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

        // If this is a registered agent, deduct round fee and reward relayer+resolver
        if (isRegisteredAgent[player] && agentInfo[player].balance >= AGENT_ROUND_FEE) {
            agentInfo[player].balance -= AGENT_ROUND_FEE;
            uint256 resolverShare = AGENT_ROUND_FEE * RESOLVER_FEE_SHARE / 100;
            uint256 relayerShare  = AGENT_ROUND_FEE * RELAYER_FEE_SHARE  / 100;
            uint256 treasury      = AGENT_ROUND_FEE - resolverShare - relayerShare;
            // Resolver of this round gets credited when resolveRound() is called;
            // store in a per-round accumulator keyed by ZERO until resolve time
            pendingRewards[address(0)] += resolverShare; // reserved for resolver
            pendingRewards[relayerAddress] += relayerShare;
            treasuryBalance += treasury;
        }

        roundActions[currentRound][player] = Action(action);
        players[player].roundsPlayed++;
        emit ActionSubmitted(player, Action(action), currentRound);
    }

    /// @notice Claim prize on behalf of a player who signed a ClaimPermit.
    function claimPrizeWithPermit(
        address player,
        uint256 nonce,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "Permit expired");
        require(phase == GamePhase.ENDED,    "Game not ended");
        require(!prizeClaimed[player],       "Already claimed");
        require(nonces[player] == nonce,     "Invalid nonce");

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

    /// @notice Claim accumulated rewards (resolver bounties, relayer fees, etc.)
    function withdrawRewards() external {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No rewards");
        pendingRewards[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit RewardClaimed(msg.sender, amount);
    }

    /// @notice Owner withdraws protocol treasury.
    function withdrawTreasury(address to) external onlyOwner {
        uint256 amount = treasuryBalance;
        require(amount > 0, "Empty treasury");
        treasuryBalance = 0;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ============================================================
    // GAME RESET
    // ============================================================

    function resetGame() external {
        require(phase == GamePhase.ENDED, "Game not ended");
        _resetGame();
    }

    // ============================================================
    // READ FUNCTIONS
    // ============================================================

    function getGameState() external view returns (
        uint256 round, uint256 deadline, uint256 activePlayers,
        uint256 totalPlayers, bool resolved
    ) {
        return (currentRound, roundDeadline, activePlayerCount, playerList.length, roundResolved[currentRound]);
    }

    function getFullGameState() external view returns (
        uint256 round, uint256 deadline, uint256 activePlayers, uint256 totalPlayers,
        bool resolved, uint256 pool, uint256 maxRounds, uint8 gamePhase,
        address[3] memory topWinners
    ) {
        return (
            currentRound, roundDeadline, activePlayerCount, playerList.length,
            roundResolved[currentRound], prizePool, MAX_ROUNDS, uint8(phase), winners
        );
    }

    function getPlayer(address addr) external view returns (Player memory) {
        return players[addr];
    }

    function getAllPlayers() external view returns (Player[] memory) {
        Player[] memory result = new Player[](playerList.length);
        for (uint256 i = 0; i < playerList.length; i++) {
            result[i] = players[playerList[i]];
        }
        return result;
    }

    function getMyAction(uint256 round) external view returns (Action) {
        return roundActions[round][msg.sender];
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

    function entryFee() external pure returns (uint256) { return ENTRY_FEE; }

    function getWinners() external view returns (address[3] memory) { return winners; }

    function getAgentInfo(address agentAddress) external view returns (AgentInfo memory) {
        return agentInfo[agentAddress];
    }

    function getMyAgent() external view returns (address agentAddress, AgentInfo memory info) {
        agentAddress = ownerAgent[msg.sender];
        if (agentAddress != address(0)) info = agentInfo[agentAddress];
    }

    function getAllAgents() external view returns (address[] memory addrs, AgentInfo[] memory infos) {
        addrs = agentList;
        infos = new AgentInfo[](agentList.length);
        for (uint256 i = 0; i < agentList.length; i++) {
            infos[i] = agentInfo[agentList[i]];
        }
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

    function _findTarget(
        address[] memory activePlayers,
        uint256 n,
        address attacker,
        bool[] memory isDefending
    ) internal view returns (address target, uint256 targetIdx) {
        target = address(0);
        targetIdx = type(uint256).max;
        uint256 lowestHp = type(uint256).max;
        for (uint256 i = 0; i < n; i++) {
            address p = activePlayers[i];
            if (p == attacker) continue;
            if (players[p].status != PlayerStatus.ACTIVE) continue;
            if (isDefending[i]) continue;
            if (players[p].health < lowestHp) {
                lowestHp = players[p].health;
                target = p;
                targetIdx = i;
            }
        }
    }

    /// @dev Count how many agent players are in the active set and return resolver bounty.
    function _calcResolverBounty(address[] memory activePlayers, uint256 n)
        internal
        view
        returns (uint256 bounty)
    {
        // Take the resolver's share from the per-address(0) accumulator
        // We do this by counting agents who acted this round
        uint256 agentCount = 0;
        for (uint256 i = 0; i < n; i++) {
            if (isRegisteredAgent[activePlayers[i]] &&
                roundActions[currentRound][activePlayers[i]] != Action.NONE) {
                agentCount++;
            }
        }
        // bounty = agentCount * AGENT_ROUND_FEE * RESOLVER_FEE_SHARE / 100
        bounty = agentCount * AGENT_ROUND_FEE * RESOLVER_FEE_SHARE / 100;
        // But cap at what's actually pending in address(0) bucket (to avoid overcount)
        uint256 cap = pendingRewards[address(0)];
        if (bounty > cap) bounty = cap;
    }

    function _endGame() internal {
        phase = GamePhase.ENDED;

        // Rank survivors by health descending
        address[] memory alive = _getActivePlayers();
        uint256 aliveCount = alive.length;

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

        // Update agent stats
        for (uint256 i = 0; i < playerList.length; i++) {
            address p = playerList[i];
            if (isRegisteredAgent[p]) {
                agentInfo[p].gamesPlayed++;
                agentInfo[p].totalKills += players[p].kills;
                // check if in top 3
                for (uint256 j = 0; j < 3; j++) {
                    if (winners[j] == p) { agentInfo[p].topThreeFinishes++; break; }
                }
            }
        }

        // Flush pending resolver pool to last resolver
        uint256 resolverPool = pendingRewards[address(0)];
        if (resolverPool > 0 && roundResolver[currentRound - 1] != address(0)) {
            pendingRewards[address(0)] = 0;
            pendingRewards[roundResolver[currentRound - 1]] += resolverPool;
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
        }
        delete playerList;
        delete winners;

        for (uint256 i = 0; i < MAX_ROUNDS; i++) {
            delete roundResolved[i];
            delete roundResults[i];
        }

        activePlayerCount = 0;
        currentRound      = 0;
        roundDeadline     = 0;
        prizePool         = 0;
        phase             = GamePhase.WAITING;
        emit GameReset(0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ParallelArena
/// @notice Real-time onchain battle game demonstrating Monad's parallel execution.
///         Players pay an entry fee, fight over 5 rounds, top 3 survivors claim the prize pool.
///
/// Parallel execution proof:
///   submitAction() writes ONLY to roundActions[currentRound][player] — one storage slot per player.
///   10 players submitting simultaneously = 10 independent writes = Monad parallelises them.
///   resolveRound() is the single sequential step — one tx processes everything.
contract ParallelArena {

    // ============================================================
    // TYPES
    // ============================================================

    enum Action { NONE, ATTACK, DEFEND, HEAL }
    enum PlayerStatus { INACTIVE, ACTIVE, DEAD }
    enum GamePhase { WAITING, ACTIVE, ENDED }

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

    // ============================================================
    // CONSTANTS
    // ============================================================

    uint256 public constant ROUND_DURATION    = 30 seconds;
    uint256 public constant MAX_PLAYERS       = 20;
    uint256 public constant MAX_ROUNDS        = 5;
    uint256 public constant STARTING_HEALTH   = 100;
    uint256 public constant ENTRY_FEE         = 0.01 ether; // 0.01 MON

    // Prize split basis points (out of 10000)
    uint256 public constant PRIZE_FIRST  = 5000; // 50%
    uint256 public constant PRIZE_SECOND = 3000; // 30%
    uint256 public constant PRIZE_THIRD  = 2000; // 20%

    // ============================================================
    // STORAGE
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

    // Session key system
    mapping(address => address) public sessionKeys;
    mapping(address => address) public sessionKeyOwners;
    mapping(address => uint256) public sessionKeyExpiry;

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

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyActive() {
        require(players[msg.sender].status == PlayerStatus.ACTIVE, "Not an active player");
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
    // JOIN (payable — entry fee goes to prize pool)
    // ============================================================

    function joinArena() external payable {
        require(phase != GamePhase.ENDED, "Game ended - wait for reset");
        require(msg.value == ENTRY_FEE, "Entry fee required: 0.01 MON");
        require(playerList.length < MAX_PLAYERS, "Arena full");
        require(players[msg.sender].status != PlayerStatus.ACTIVE, "Already in arena");

        prizePool += msg.value;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            playerList.length
        )));

        uint256 atkPower = 10 + (seed % 11);
        uint256 defPower = 5 + ((seed >> 8) % 6);

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

        // Start the clock on first player
        if (activePlayerCount == 1) {
            phase = GamePhase.ACTIVE;
            roundDeadline = block.timestamp + ROUND_DURATION;
        }

        emit PlayerJoined(msg.sender, STARTING_HEALTH, atkPower, prizePool);
    }

    // ============================================================
    // SESSION KEY MANAGEMENT
    // ============================================================

    function authorizeSessionKey(address sessionKey, uint256 expiresAt) external onlyActive {
        require(sessionKey != address(0), "Invalid session key");
        require(expiresAt > block.timestamp, "Expiry must be in future");
        require(expiresAt <= block.timestamp + 7 days, "Max 7-day session");

        address prevKey = sessionKeys[msg.sender];
        if (prevKey != address(0)) {
            delete sessionKeyOwners[prevKey];
        }

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
    //
    // PARALLEL-SAFE: each write goes to roundActions[round][player]
    // where `player` is the canonical player address.
    // Session key callers are resolved to their player before any write.
    // Multiple players → independent slots → Monad parallelises them.
    // ============================================================

    function submitAction(Action action) external roundNotResolved {
        require(action != Action.NONE, "Must choose an action");

        // Resolve session key → player if applicable
        address player = msg.sender;
        address skOwner = sessionKeyOwners[msg.sender];
        if (skOwner != address(0)) {
            require(sessionKeyExpiry[skOwner] >= block.timestamp, "Session key expired");
            player = skOwner;
        }

        require(players[player].status == PlayerStatus.ACTIVE, "Not an active player");
        require(roundActions[currentRound][player] == Action.NONE, "Already acted this round");

        // PARALLEL-SAFE: keyed by player address, not session key
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
        require(
            block.timestamp >= roundDeadline || _allPlayersActed(),
            "Round not ready: wait for deadline or all players to act"
        );

        uint256 round = currentRound;
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
                players[target].rank = activePlayerCount; // rank by elimination order
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

        // End game when MAX_ROUNDS completed OR ≤3 players remain
        bool maxRoundsReached = currentRound >= MAX_ROUNDS;
        bool fewPlayersLeft   = activePlayerCount <= 3;

        if (maxRoundsReached || fewPlayersLeft || activePlayerCount == 0) {
            _endGame();
        }
    }

    // ============================================================
    // PRIZE CLAIMING
    // ============================================================

    function claimPrize() external {
        require(phase == GamePhase.ENDED, "Game not ended");
        require(!prizeClaimed[msg.sender], "Already claimed");

        uint256 rank = 0;
        uint256 pct = 0;
        for (uint256 i = 0; i < 3; i++) {
            if (winners[i] == msg.sender) {
                rank = i + 1;
                if (i == 0) pct = PRIZE_FIRST;
                else if (i == 1) pct = PRIZE_SECOND;
                else pct = PRIZE_THIRD;
                break;
            }
        }
        require(rank > 0, "Not a winner");

        prizeClaimed[msg.sender] = true;
        uint256 amount = (prizePool * pct) / 10000;

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");

        emit PrizeClaimed(msg.sender, rank, amount);
    }

    // ============================================================
    // READ FUNCTIONS
    // ============================================================

    function getGameState() external view returns (
        uint256 round,
        uint256 deadline,
        uint256 activePlayers,
        uint256 totalPlayers,
        bool resolved
    ) {
        return (currentRound, roundDeadline, activePlayerCount, playerList.length, roundResolved[currentRound]);
    }

    function getFullGameState() external view returns (
        uint256 round,
        uint256 deadline,
        uint256 activePlayers,
        uint256 totalPlayers,
        bool resolved,
        uint256 pool,
        uint256 maxRounds,
        uint8   gamePhase,
        address[3] memory topWinners
    ) {
        return (
            currentRound,
            roundDeadline,
            activePlayerCount,
            playerList.length,
            roundResolved[currentRound],
            prizePool,
            MAX_ROUNDS,
            uint8(phase),
            winners
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
        uint256 firstPrize,
        uint256 secondPrize,
        uint256 thirdPrize
    ) {
        firstPrize  = (prizePool * PRIZE_FIRST)  / 10000;
        secondPrize = (prizePool * PRIZE_SECOND) / 10000;
        thirdPrize  = (prizePool * PRIZE_THIRD)  / 10000;
    }

    function entryFee() external pure returns (uint256) {
        return ENTRY_FEE;
    }

    function getWinners() external view returns (address[3] memory) {
        return winners;
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

    function _endGame() internal {
        phase = GamePhase.ENDED;

        // Rank surviving players by health (descending)
        address[] memory alive = _getActivePlayers();
        uint256 aliveCount = alive.length;

        // Sort survivors by health descending (bubble sort — max 20 players, fine)
        for (uint256 i = 0; i < aliveCount; i++) {
            for (uint256 j = i + 1; j < aliveCount; j++) {
                if (players[alive[j]].health > players[alive[i]].health) {
                    address tmp = alive[i];
                    alive[i] = alive[j];
                    alive[j] = tmp;
                }
            }
        }

        // Assign final ranks and winners
        for (uint256 i = 0; i < aliveCount && i < 3; i++) {
            players[alive[i]].rank = i + 1;
            winners[i] = alive[i];
        }

        // Adjust prize split if fewer than 3 winners
        // If only 1 winner: they take 100% (prizePool fully distributed)
        // If only 2 winners: 50/50? Or give 2nd the PRIZE_SECOND share and remainder
        // For simplicity: unclaimed prize stays in contract (can add sweep later)

        emit GameEnded(winners, prizePool);
    }

    function _resetGame() internal {
        for (uint256 i = 0; i < playerList.length; i++) {
            address p = playerList[i];
            // Clear session keys for reset players
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
        activePlayerCount = 0;
        currentRound = 0;
        prizePool = 0;
        phase = GamePhase.WAITING;
        emit GameReset(0);
    }

    /// @notice Anyone can reset the game after it ends to start a new session.
    function resetGame() external {
        require(phase == GamePhase.ENDED, "Game not ended");
        _resetGame();
    }
}

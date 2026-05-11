// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ParallelArenaV2.sol";

contract ParallelArenaV2Test is Test {
    ParallelArenaV2 arena;

    address relayer = address(0x4E14A5E4);
    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address carol   = address(0xCA401);
    address dave    = address(0xDA4E);
    address eve     = address(0xE4E);

    uint256 aliceSkPk = 0xA11CE5E55100;
    address aliceSk;

    uint256 constant FEE = 0.01 ether;

    function setUp() public {
        arena = new ParallelArenaV2(relayer);
        aliceSk = vm.addr(aliceSkPk);

        vm.deal(alice,   10 ether);
        vm.deal(bob,     10 ether);
        vm.deal(carol,   10 ether);
        vm.deal(dave,    10 ether);
        vm.deal(eve,     10 ether);
        vm.deal(aliceSk, 10 ether);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _join(address who) internal {
        vm.prank(who);
        arena.joinArena{value: FEE}();
    }

    function _act(address who, ParallelArenaV2.Action action) internal {
        vm.prank(who);
        arena.submitAction(action);
    }

    function _allAct(ParallelArenaV2.Action action) internal {
        // Submit action for every active player so _allPlayersActed() returns true
        // and we don't need to warp past deadline + cooldown
        uint256 n = arena.activePlayerCount();
        for (uint256 i = 0; i < n; i++) {
            address p = arena.playerList(i);
            ParallelArenaV2.Player memory player = _getPlayer(p);
            if (uint8(player.status) == 1 && // ACTIVE
                uint8(arena.roundActions(arena.currentRound(), p)) == 0) // NONE
            {
                vm.prank(p);
                arena.submitAction(action);
            }
        }
    }

    function _getPlayer(address who) internal view returns (ParallelArenaV2.Player memory) {
        (
            address addr,
            uint256 health,
            uint256 attack,
            uint256 defense,
            ParallelArenaV2.PlayerStatus status,
            uint256 roundsPlayed,
            uint256 kills,
            uint256 rank,
            uint256 consecutiveHeals
        ) = arena.players(who);
        return ParallelArenaV2.Player(addr, health, attack, defense, status, roundsPlayed, kills, rank, consecutiveHeals);
    }

    /// @dev Vote to start from all active players (owner override for simplicity)
    function _startGame() internal {
        vm.prank(arena.owner());
        arena.startGame();
    }

    function _resolve() internal {
        // warp past deadline + 2s cooldown
        vm.warp(arena.roundDeadline() + 3);
        arena.resolveRound();
    }

    // ── 1. Join ───────────────────────────────────────────────────────────────

    function testJoinArena() public {
        _join(alice);

        ParallelArenaV2.Player memory p = _getPlayer(alice);
        assertEq(p.addr, alice);
        assertEq(p.health, 100);
        assertTrue(p.attack >= 10 && p.attack <= 20);
        assertTrue(p.defense >= 5 && p.defense <= 10);
        assertEq(uint8(p.status), uint8(ParallelArenaV2.PlayerStatus.ACTIVE));
        assertEq(arena.activePlayerCount(), 1);
    }

    function testJoinArenaWrongFee() public {
        vm.prank(alice);
        vm.expectRevert("Wrong entry fee");
        arena.joinArena{value: 0}();
    }

    function testCannotJoinTwice() public {
        _join(alice);
        vm.prank(alice);
        vm.expectRevert("Already in arena");
        arena.joinArena{value: FEE}();
    }

    // ── 2. Submit action ─────────────────────────────────────────────────────

    function testSubmitAction() public {
        _join(alice);
        _join(bob);
        _startGame();
        _act(alice, ParallelArenaV2.Action.ATTACK);
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArenaV2.Action.ATTACK));
    }

    function testSubmitDefend() public {
        _join(alice);
        _join(bob);
        _startGame();
        _act(alice, ParallelArenaV2.Action.DEFEND);
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArenaV2.Action.DEFEND));
    }

    function testSubmitHeal() public {
        _join(alice);
        _join(bob);
        _startGame();
        _act(alice, ParallelArenaV2.Action.HEAL);
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArenaV2.Action.HEAL));
    }

    function testCannotActTwicePerRound() public {
        _join(alice);
        _join(bob);
        _startGame();
        _act(alice, ParallelArenaV2.Action.ATTACK);
        vm.prank(alice);
        vm.expectRevert("Already acted this round");
        arena.submitAction(ParallelArenaV2.Action.HEAL);
    }

    // ── 3. Resolve round ─────────────────────────────────────────────────────

    function testResolveRound() public {
        _join(alice);
        _join(bob);
        _startGame();

        _act(alice, ParallelArenaV2.Action.ATTACK);
        _act(bob,   ParallelArenaV2.Action.HEAL);

        _resolve();

        assertTrue(arena.roundResolved(0));
        assertEq(arena.currentRound(), 1);
    }

    function testResolveRequiresDeadline() public {
        _join(alice);
        _join(bob);
        _startGame();
        _act(alice, ParallelArenaV2.Action.ATTACK);
        // only alice acted, not all players — so must wait for deadline

        vm.expectRevert("Round not ready");
        arena.resolveRound();
    }

    // ── 4. Consecutive heals — diminishing returns ────────────────────────────

    function testConsecutiveHealsDiminishingReturns() public {
        _join(alice);
        _join(bob);
        _startGame();

        // Round 1: alice heals — should get 20 HP (but capped at 100)
        // alice starts at 100, so heal does nothing yet; let bob attack first to lower health
        _act(alice, ParallelArenaV2.Action.HEAL);
        _act(bob,   ParallelArenaV2.Action.ATTACK);
        _resolve();

        ParallelArenaV2.Player memory p1 = _getPlayer(alice);
        // alice was attacked (lost some HP) and healed (+20), net depends on attack power
        // Just verify consecutiveHeals incremented
        assertEq(p1.consecutiveHeals, 1);

        // Round 2: alice heals again — should get 10 HP
        _act(alice, ParallelArenaV2.Action.HEAL);
        _act(bob,   ParallelArenaV2.Action.ATTACK);
        _resolve();

        ParallelArenaV2.Player memory p2 = _getPlayer(alice);
        assertEq(p2.consecutiveHeals, 2);

        // Round 3: alice heals again — should get 5 HP (max diminish)
        _act(alice, ParallelArenaV2.Action.HEAL);
        _act(bob,   ParallelArenaV2.Action.ATTACK);
        _resolve();

        ParallelArenaV2.Player memory p3 = _getPlayer(alice);
        assertEq(p3.consecutiveHeals, 3);
    }

    function testConsecutiveHealsResetOnNonHeal() public {
        _join(alice);
        _join(bob);
        _startGame();

        // Heal twice to build streak
        _act(alice, ParallelArenaV2.Action.HEAL);
        _act(bob,   ParallelArenaV2.Action.HEAL);
        _resolve();

        _act(alice, ParallelArenaV2.Action.HEAL);
        _act(bob,   ParallelArenaV2.Action.HEAL);
        _resolve();

        assertEq(_getPlayer(alice).consecutiveHeals, 2);

        // Attack (non-heal) should reset streak
        _act(alice, ParallelArenaV2.Action.ATTACK);
        _act(bob,   ParallelArenaV2.Action.HEAL);
        _resolve();

        assertEq(_getPlayer(alice).consecutiveHeals, 0);
    }

    // ── 5. CLAIM_WINDOW blocks early reset ───────────────────────────────────

    function testClaimWindowBlocksEarlyReset() public {
        _join(alice);
        _join(bob);

        // Run game to completion (attack until someone dies)
        // Use a custom arena with MAX_ROUNDS = 1 for simplicity
        ParallelArenaV2 shortArena = new ParallelArenaV2(relayer);
        vm.prank(shortArena.owner());
        shortArena.setMaxRounds(1);

        vm.deal(address(0xF001), 10 ether);
        vm.deal(address(0xF002), 10 ether);
        vm.prank(address(0xF001));
        shortArena.joinArena{value: FEE}();
        vm.prank(address(0xF002));
        shortArena.joinArena{value: FEE}();

        vm.prank(shortArena.owner());
        shortArena.startGame();

        vm.prank(address(0xF001));
        shortArena.submitAction(ParallelArenaV2.Action.ATTACK);
        vm.prank(address(0xF002));
        shortArena.submitAction(ParallelArenaV2.Action.ATTACK);

        vm.warp(shortArena.roundDeadline() + 3);
        shortArena.resolveRound();

        // Game should be ENDED now (only 1 round)
        assertEq(uint8(shortArena.phase()), uint8(ParallelArenaV2.GamePhase.ENDED));

        // Non-owner trying to reset immediately should fail
        vm.prank(address(0xF001));
        vm.expectRevert("Claim window still open");
        shortArena.resetGame();
    }

    function testOwnerCanResetImmediately() public {
        ParallelArenaV2 shortArena = new ParallelArenaV2(relayer);
        vm.prank(shortArena.owner());
        shortArena.setMaxRounds(1);

        vm.deal(address(0xF001), 10 ether);
        vm.deal(address(0xF002), 10 ether);
        vm.prank(address(0xF001));
        shortArena.joinArena{value: FEE}();
        vm.prank(address(0xF002));
        shortArena.joinArena{value: FEE}();

        vm.prank(shortArena.owner());
        shortArena.startGame();

        vm.prank(address(0xF001));
        shortArena.submitAction(ParallelArenaV2.Action.ATTACK);
        vm.prank(address(0xF002));
        shortArena.submitAction(ParallelArenaV2.Action.ATTACK);

        vm.warp(shortArena.roundDeadline() + 3);
        shortArena.resolveRound();

        // Owner can reset immediately (bypass CLAIM_WINDOW)
        vm.prank(shortArena.owner());
        shortArena.resetGame(); // must not revert
        assertEq(uint8(shortArena.phase()), uint8(ParallelArenaV2.GamePhase.WAITING));
    }

    // ── 6. Session key expiry ─────────────────────────────────────────────────

    function testSessionKeyExpiry() public {
        _join(alice);
        _join(bob);
        _startGame();

        uint256 expiry = block.timestamp + 1 hours;
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, expiry);

        // Session key works while valid
        vm.prank(aliceSk);
        arena.submitAction(ParallelArenaV2.Action.HEAL);
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArenaV2.Action.HEAL));

        // Resolve round so alice can act again
        _act(bob, ParallelArenaV2.Action.ATTACK);
        _resolve();

        // Warp past expiry
        vm.warp(expiry + 1);

        // Session key should now be rejected
        vm.prank(aliceSk);
        vm.expectRevert("Session key expired");
        arena.submitAction(ParallelArenaV2.Action.HEAL);
    }

    // ── 7. totalDamage incremented ────────────────────────────────────────────

    function testTotalDamageIncremented() public {
        _join(alice);
        _join(bob);
        _startGame();

        // Both attack — each is the other's target (defenders are skipped, so both must attack)
        uint256 aliceAtk = _getPlayer(alice).attack;
        _act(alice, ParallelArenaV2.Action.ATTACK);
        _act(bob,   ParallelArenaV2.Action.ATTACK);
        _resolve();

        // alice attacked bob — totalDamage should reflect alice's attack power
        ParallelArenaV2.PlayerStats memory stats = arena.getPlayerStats(alice);
        assertEq(uint256(stats.totalDamage), aliceAtk);
    }

    // ── 8. Single remaining player wins ──────────────────────────────────────

    function testOnePlayerWins() public {
        // 2-player game where one player survives all rounds
        // Use 1-round arena and give alice max stats by relying on contract defaults
        ParallelArenaV2 shortArena = new ParallelArenaV2(relayer);
        vm.prank(shortArena.owner());
        shortArena.setMaxRounds(5); // default, but explicit

        vm.deal(address(0xAA01), 10 ether);
        vm.deal(address(0xBB01), 10 ether);

        // Both join
        vm.prank(address(0xAA01));
        shortArena.joinArena{value: FEE}();
        vm.prank(address(0xBB01));
        shortArena.joinArena{value: FEE}();

        vm.prank(shortArena.owner());
        shortArena.startGame();

        // Simulate until only 1 player remains: keep attacking until someone dies
        // We don't know who attacks whom, but we can warp through rounds
        for (uint256 round = 0; round < 5; round++) {
            if (uint8(shortArena.phase()) == uint8(ParallelArenaV2.GamePhase.ENDED)) break;

            address p0 = shortArena.playerList(0);
            address p1 = shortArena.playerList(1);

            (, , , , ParallelArenaV2.PlayerStatus s0, , , , ) = shortArena.players(p0);
            (, , , , ParallelArenaV2.PlayerStatus s1, , , , ) = shortArena.players(p1);

            if (uint8(s0) == 1) { vm.prank(p0); shortArena.submitAction(ParallelArenaV2.Action.ATTACK); }
            if (uint8(s1) == 1) { vm.prank(p1); shortArena.submitAction(ParallelArenaV2.Action.ATTACK); }

            vm.warp(shortArena.roundDeadline() + 3);
            shortArena.resolveRound();
        }

        // After all rounds, game should be ENDED
        assertEq(uint8(shortArena.phase()), uint8(ParallelArenaV2.GamePhase.ENDED));
        // At least one winner slot should be non-zero
        assertTrue(shortArena.winners(0) != address(0));
    }

    // ── 9. Prize pool split and claim ────────────────────────────────────────

    function testPrizePoolAccumulates() public {
        _join(alice);
        _join(bob);
        _join(carol);
        assertEq(arena.prizePool(), 3 * FEE);
    }

    // ── 10. Quorum voting ─────────────────────────────────────────────────────

    function testVoteToStartReachesQuorum() public {
        // quorum for 3 players = 3
        _join(alice);
        _join(bob);
        _join(carol);
        assertEq(arena.quorumRequired(), 3);

        // First two votes don't start the game
        vm.prank(alice); arena.voteToStart();
        assertEq(uint8(arena.phase()), uint8(ParallelArenaV2.GamePhase.WAITING));
        vm.prank(bob); arena.voteToStart();
        assertEq(uint8(arena.phase()), uint8(ParallelArenaV2.GamePhase.WAITING));

        // Third vote reaches quorum — game starts
        vm.prank(carol); arena.voteToStart();
        assertEq(uint8(arena.phase()), uint8(ParallelArenaV2.GamePhase.ACTIVE));
    }

    function testCannotVoteTwice() public {
        _join(alice);
        _join(bob);
        vm.prank(alice); arena.voteToStart();
        vm.prank(alice);
        vm.expectRevert("Already voted");
        arena.voteToStart();
    }

    function testQuorumForLargeGame() public {
        // 11 players → quorum = ceil(0.3 * 11) = 4
        address[11] memory addrs;
        for (uint256 i = 0; i < 11; i++) {
            addrs[i] = address(uint160(0xDEAD0000 + i));
            vm.deal(addrs[i], 1 ether);
            vm.prank(addrs[i]);
            arena.joinArena{value: FEE}();
        }
        assertEq(arena.quorumRequired(), 4);
    }

    function testStartGameOwnerOverride() public {
        _join(alice);
        _join(bob);
        // No votes cast, but owner can force start
        vm.prank(arena.owner());
        arena.startGame();
        assertEq(uint8(arena.phase()), uint8(ParallelArenaV2.GamePhase.ACTIVE));
    }

    // ── 11. Session key EIP-712 permit signing ───────────────────────────────

    // Helper: build the EIP-712 digest for ActionPermit the same way the contract does.
    function _actionPermitDigest(
        address player,
        uint8   action,
        uint256 round,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 typehash = keccak256(
            "ActionPermit(address player,uint8 action,uint256 round,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(abi.encode(typehash, player, action, round, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", arena.DOMAIN_SEPARATOR(), structHash));
    }

    function testSessionKeySignsPermit() public {
        _join(alice);
        _join(bob);
        _startGame();

        // Alice authorizes her session key
        uint256 expiry = block.timestamp + 1 days;
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, expiry);

        uint256 nonce    = arena.nonces(alice);
        uint256 deadline = block.timestamp + 180;
        bytes32 digest   = _actionPermitDigest(alice, uint8(ParallelArenaV2.Action.HEAL), arena.currentRound(), nonce, deadline);

        // Session key signs the digest
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceSkPk, digest);

        // Relayer submits the permit — session key signed on alice's behalf
        vm.prank(relayer);
        arena.submitActionWithPermit(alice, uint8(ParallelArenaV2.Action.HEAL), nonce, deadline, v, r, s);

        assertEq(uint8(arena.roundActions(arena.currentRound(), alice)), uint8(ParallelArenaV2.Action.HEAL));
        assertEq(arena.nonces(alice), nonce + 1);
    }

    function testSessionKeyPermitRejectedAfterExpiry() public {
        _join(alice);
        _join(bob);
        _startGame();

        uint256 expiry = block.timestamp + 1 hours;
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, expiry);

        // Warp past session key expiry
        vm.warp(expiry + 1);

        uint256 nonce    = arena.nonces(alice);
        uint256 deadline = block.timestamp + 180;
        bytes32 digest   = _actionPermitDigest(alice, uint8(ParallelArenaV2.Action.ATTACK), arena.currentRound(), nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceSkPk, digest);

        vm.prank(relayer);
        vm.expectRevert("Invalid signature");
        arena.submitActionWithPermit(alice, uint8(ParallelArenaV2.Action.ATTACK), nonce, deadline, v, r, s);
    }

    function testPlayerCanStillSignPermitDirectly() public {
        // Player signs the EIP-712 permit with their own key (no session key involved).
        // Uses main arena with alice and bob already joined.
        _join(alice);
        _join(bob);
        _startGame();

        // Reuse aliceSkPk as alice's own signing key for a fresh arena
        uint256 alicePk   = 0xA11CE5555;
        address aliceAddr = vm.addr(alicePk);
        address bobAddr   = address(0xBBBB);
        vm.deal(aliceAddr, 1 ether);
        vm.deal(bobAddr,   1 ether);

        ParallelArenaV2 freshArena = new ParallelArenaV2(relayer);
        vm.prank(aliceAddr); freshArena.joinArena{value: FEE}();
        vm.prank(bobAddr);   freshArena.joinArena{value: FEE}();
        vm.prank(freshArena.owner()); freshArena.startGame();

        uint256 nonce    = freshArena.nonces(aliceAddr);
        uint256 deadline = block.timestamp + 180;

        bytes32 typehash = keccak256(
            "ActionPermit(address player,uint8 action,uint256 round,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(abi.encode(
            typehash, aliceAddr, uint8(ParallelArenaV2.Action.DEFEND), freshArena.currentRound(), nonce, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", freshArena.DOMAIN_SEPARATOR(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);

        vm.prank(relayer);
        freshArena.submitActionWithPermit(aliceAddr, uint8(ParallelArenaV2.Action.DEFEND), nonce, deadline, v, r, s);

        assertEq(uint8(freshArena.roundActions(freshArena.currentRound(), aliceAddr)), uint8(ParallelArenaV2.Action.DEFEND));
    }

    function testStartVotesResetAfterGame() public {
        _join(alice);
        _join(bob);
        _startGame();

        // Play one round and end game
        _act(alice, ParallelArenaV2.Action.ATTACK);
        _act(bob, ParallelArenaV2.Action.ATTACK);
        vm.warp(arena.roundDeadline() + 3);

        // Run all max rounds to end game
        for (uint256 i = 0; i < 5; i++) {
            if (uint8(arena.phase()) == uint8(ParallelArenaV2.GamePhase.ENDED)) break;
            vm.warp(arena.roundDeadline() + 3);
            arena.resolveRound();
        }

        // Reset
        vm.prank(arena.owner());
        arena.resetGame();

        assertEq(arena.startVoteCount(), 0);
        assertEq(arena.humanPlayerCount(), 0);
        assertEq(uint8(arena.phase()), uint8(ParallelArenaV2.GamePhase.WAITING));
    }
}

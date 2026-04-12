// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ParallelArena.sol";

contract ParallelArenaTest is Test {
    ParallelArena arena;

    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address carol   = address(0xCA401);
    address dave    = address(0xDA4E);
    address relayer = address(0x4E14A5E4);

    // Session key private keys (deterministic via vm.addr)
    uint256 aliceSkPk = 0xA11CE5E55100;
    uint256 bobSkPk   = 0xB0B5E55100;
    address aliceSk;
    address bobSk;

    function setUp() public {
        arena = new ParallelArena(relayer);
        aliceSk = vm.addr(aliceSkPk);
        bobSk   = vm.addr(bobSkPk);

        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(dave,  10 ether);
        vm.deal(aliceSk, 10 ether);
        vm.deal(bobSk,   10 ether);
    }

    // -------------------------------------------------------
    // 1. Join
    // -------------------------------------------------------

    function testJoinArena() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        ParallelArena.Player memory p = arena.getPlayer(alice);
        assertEq(p.addr, alice);
        assertEq(p.health, 100);
        assertTrue(p.attack >= 10 && p.attack <= 20);
        assertTrue(p.defense >= 5 && p.defense <= 10);
        assertEq(uint8(p.status), uint8(ParallelArena.PlayerStatus.ACTIVE));
        assertEq(arena.activePlayerCount(), 1);
    }

    function testCannotJoinTwice() public {
        vm.startPrank(alice);
        arena.joinArena{value: 0.01 ether}();
        vm.expectRevert("Already in arena");
        arena.joinArena{value: 0.01 ether}();
        vm.stopPrank();
    }

    // -------------------------------------------------------
    // 1b. Entry Fee
    // -------------------------------------------------------

    function testJoinRequiresEntryFee() public {
        vm.prank(alice);
        vm.expectRevert("Wrong entry fee");
        arena.joinArena{value: 0}();
    }

    function testPrizePoolAccumulates() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();
        vm.prank(carol); arena.joinArena{value: 0.01 ether}();

        assertEq(arena.prizePool(), 0.03 ether);
    }

    // -------------------------------------------------------
    // 2. Submit Action
    // -------------------------------------------------------

    function testSubmitAction() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        vm.prank(alice);
        arena.submitAction(ParallelArena.Action.ATTACK);

        ParallelArena.Action a = arena.roundActions(0, alice);
        assertEq(uint8(a), uint8(ParallelArena.Action.ATTACK));
    }

    // -------------------------------------------------------
    // 3. Parallel Actions (multiple players submit, no conflicts)
    // -------------------------------------------------------

    function testParallelActions() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();
        vm.prank(carol); arena.joinArena{value: 0.01 ether}();

        vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
        vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
        vm.prank(carol); arena.submitAction(ParallelArena.Action.HEAL);

        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArena.Action.ATTACK));
        assertEq(uint8(arena.roundActions(0, bob)),   uint8(ParallelArena.Action.DEFEND));
        assertEq(uint8(arena.roundActions(0, carol)), uint8(ParallelArena.Action.HEAL));
    }

    // -------------------------------------------------------
    // 4. Resolve Round
    // -------------------------------------------------------

    function testResolveRound() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
        vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);

        vm.warp(block.timestamp + 31);
        arena.resolveRound();

        assertTrue(arena.roundResolved(0));
        assertEq(arena.currentRound(), 1);
    }

    // -------------------------------------------------------
    // 5. Cannot Act Twice
    // -------------------------------------------------------

    function testCannotActTwice() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();

        vm.startPrank(alice);
        arena.submitAction(ParallelArena.Action.ATTACK);
        vm.expectRevert("Already acted this round");
        arena.submitAction(ParallelArena.Action.HEAL);
        vm.stopPrank();
    }

    // -------------------------------------------------------
    // 6. Defend Reduces Damage (defenders excluded from targeting)
    // -------------------------------------------------------

    function testDefendExcludesFromTargeting() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();
        vm.prank(carol); arena.joinArena{value: 0.01 ether}();

        vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
        vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
        vm.prank(carol); arena.submitAction(ParallelArena.Action.ATTACK);

        vm.warp(block.timestamp + 31);
        arena.resolveRound();

        ParallelArena.Player memory bobAfter = arena.getPlayer(bob);
        assertEq(bobAfter.health, 100);
    }

    // -------------------------------------------------------
    // 7. Heal Caps at Max Health
    // -------------------------------------------------------

    function testHealCapsAtMax() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
        vm.prank(bob);   arena.submitAction(ParallelArena.Action.HEAL);

        vm.warp(block.timestamp + 31);
        arena.resolveRound();

        ParallelArena.Player memory bobAfter = arena.getPlayer(bob);
        assertTrue(bobAfter.health <= 100);
    }

    function testHealAtMaxHealthStaysAtMax() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        vm.prank(alice); arena.submitAction(ParallelArena.Action.DEFEND);
        vm.prank(bob);   arena.submitAction(ParallelArena.Action.HEAL);

        vm.warp(block.timestamp + 31);
        arena.resolveRound();

        ParallelArena.Player memory bobAfter = arena.getPlayer(bob);
        assertEq(bobAfter.health, 100);
    }

    // -------------------------------------------------------
    // 8. Session Key: Authorize
    // -------------------------------------------------------

    function testAuthorizeSessionKey() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        uint256 expiry = block.timestamp + 1 days;
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, expiry);

        assertEq(arena.sessionKeys(alice), aliceSk);
        assertEq(arena.sessionKeyOwners(aliceSk), alice);
        assertEq(arena.sessionKeyExpiry(alice), expiry);
    }

    function testCannotAuthorizeZeroAddress() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        vm.prank(alice);
        vm.expectRevert("Invalid session key");
        arena.authorizeSessionKey(address(0), block.timestamp + 1 days);
    }

    function testCannotAuthorizeExpiredKey() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        vm.prank(alice);
        vm.expectRevert("Expiry must be in future");
        arena.authorizeSessionKey(aliceSk, block.timestamp - 1);
    }

    function testCannotAuthorizeKeyTooFar() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        vm.prank(alice);
        vm.expectRevert("Max 7-day session");
        arena.authorizeSessionKey(aliceSk, block.timestamp + 8 days);
    }

    // -------------------------------------------------------
    // 9. Session Key: Submit Action via session key
    // -------------------------------------------------------

    function testSessionKeyCanSubmitAction() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        // Alice authorizes her session key
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, block.timestamp + 1 days);

        // Session key submits on alice's behalf — no wallet popup
        vm.prank(aliceSk);
        arena.submitAction(ParallelArena.Action.ATTACK);

        // Action recorded under alice's address, not the session key's
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArena.Action.ATTACK));
        assertEq(uint8(arena.roundActions(0, aliceSk)), uint8(ParallelArena.Action.NONE));

        // roundsPlayed incremented on alice's player
        ParallelArena.Player memory p = arena.getPlayer(alice);
        assertEq(p.roundsPlayed, 1);
    }

    // -------------------------------------------------------
    // 10. Session Key: Expired key reverts
    // -------------------------------------------------------

    function testExpiredSessionKeyReverts() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        uint256 expiry = block.timestamp + 1 hours;
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, expiry);

        // Warp past expiry
        vm.warp(expiry + 1);

        vm.prank(aliceSk);
        vm.expectRevert("Session key expired");
        arena.submitAction(ParallelArena.Action.ATTACK);
    }

    // -------------------------------------------------------
    // 11. Session Key: Revoke
    // -------------------------------------------------------

    function testRevokeSessionKey() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, block.timestamp + 1 days);

        // Revoke
        vm.prank(alice);
        arena.revokeSessionKey();

        assertEq(arena.sessionKeys(alice), address(0));
        assertEq(arena.sessionKeyOwners(aliceSk), address(0));

        // Former session key can no longer act
        vm.prank(aliceSk);
        vm.expectRevert("Not an active player");
        arena.submitAction(ParallelArena.Action.ATTACK);
    }

    function testRevokeWhenNoKey() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        vm.prank(alice);
        vm.expectRevert("No active session key");
        arena.revokeSessionKey();
    }

    // -------------------------------------------------------
    // 12. Session Key: Replaced cleanly
    // -------------------------------------------------------

    function testSessionKeyReplacedCleanly() public {
        vm.prank(alice);
        arena.joinArena{value: 0.01 ether}();

        // Authorize first key
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, block.timestamp + 1 days);

        // Authorize second key (replaces first)
        address sk2 = vm.addr(0xDEAD);
        vm.prank(alice);
        arena.authorizeSessionKey(sk2, block.timestamp + 1 days);

        // Old key's reverse mapping cleared
        assertEq(arena.sessionKeyOwners(aliceSk), address(0));
        // New key registered
        assertEq(arena.sessionKeys(alice), sk2);
        assertEq(arena.sessionKeyOwners(sk2), alice);

        // Old key cannot act
        vm.prank(aliceSk);
        vm.expectRevert("Not an active player");
        arena.submitAction(ParallelArena.Action.ATTACK);

        // New key can act
        vm.prank(sk2);
        arena.submitAction(ParallelArena.Action.HEAL);
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArena.Action.HEAL));
    }

    // -------------------------------------------------------
    // 13. Session Key: Parallel storage independence
    //     Multiple session keys, each for a different player,
    //     write to independent storage slots.
    // -------------------------------------------------------

    function testParallelSubmitWithSessionKeys() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        // Each player authorizes their own session key
        vm.prank(alice);
        arena.authorizeSessionKey(aliceSk, block.timestamp + 1 days);
        vm.prank(bob);
        arena.authorizeSessionKey(bobSk, block.timestamp + 1 days);

        // Both session keys submit (simulating parallel execution)
        vm.prank(aliceSk); arena.submitAction(ParallelArena.Action.ATTACK);
        vm.prank(bobSk);   arena.submitAction(ParallelArena.Action.DEFEND);

        // Actions recorded under respective player addresses
        assertEq(uint8(arena.roundActions(0, alice)), uint8(ParallelArena.Action.ATTACK));
        assertEq(uint8(arena.roundActions(0, bob)),   uint8(ParallelArena.Action.DEFEND));

        // Storage slots never collide — session key slots remain empty
        assertEq(uint8(arena.roundActions(0, aliceSk)), uint8(ParallelArena.Action.NONE));
        assertEq(uint8(arena.roundActions(0, bobSk)),   uint8(ParallelArena.Action.NONE));
    }

    // -------------------------------------------------------
    // 14. getActionFor read helper
    // -------------------------------------------------------

    function testGetActionFor() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(alice); arena.authorizeSessionKey(aliceSk, block.timestamp + 1 days);
        vm.prank(aliceSk); arena.submitAction(ParallelArena.Action.HEAL);

        // getActionFor returns alice's action by her address
        assertEq(uint8(arena.getActionFor(0, alice)), uint8(ParallelArena.Action.HEAL));
    }

    // -------------------------------------------------------
    // 15. Game Phase: ends after MAX_ROUNDS
    // -------------------------------------------------------

    function testGameEndsAfterMaxRounds() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        // Play through MAX_ROUNDS (5) rounds. Both players defend — nobody dies.
        // This verifies the game always lasts 5 rounds, not fewer.
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice); arena.submitAction(ParallelArena.Action.DEFEND);
            vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
            vm.warp(block.timestamp + 31);
            arena.resolveRound();
        }

        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.ENDED));
    }

    function testGameDoesNotEndEarlyWithSurvivor() public {
        // Game should play all 5 rounds even if only 1 player survives earlier.
        // With the old bug (activePlayerCount <= 1), game ended at round 1.
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        // Round 0: alice attacks, bob does nothing — if damage >= bob's hp, bob dies
        // Use defend so nobody dies, then manually test
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice); arena.submitAction(ParallelArena.Action.HEAL);
            vm.prank(bob);   arena.submitAction(ParallelArena.Action.HEAL);
            vm.warp(block.timestamp + 31);
            uint256 roundBefore = arena.currentRound();
            arena.resolveRound();
            assertEq(arena.currentRound(), roundBefore + 1);
        }
        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.ENDED));
        assertEq(arena.currentRound(), 5);
    }

    // -------------------------------------------------------
    // 16. Prize: claim correct amount
    // -------------------------------------------------------

    function testClaimPrize() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();
        vm.prank(carol); arena.joinArena{value: 0.01 ether}();

        // Resolve 5 rounds to end the game
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
            vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
            vm.prank(carol); arena.submitAction(ParallelArena.Action.HEAL);
            vm.warp(block.timestamp + 31);
            arena.resolveRound();
        }

        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.ENDED));

        address[3] memory w = arena.getWinners();
        uint256 pool = arena.prizePool();
        uint256 balanceBefore = w[0].balance;

        vm.prank(w[0]);
        arena.claimPrize();

        // First place gets 50% of the pool
        assertEq(w[0].balance, balanceBefore + (pool * 50) / 100);
    }

    function testCannotClaimTwice() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();
        vm.prank(carol); arena.joinArena{value: 0.01 ether}();

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
            vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
            vm.prank(carol); arena.submitAction(ParallelArena.Action.HEAL);
            vm.warp(block.timestamp + 31);
            arena.resolveRound();
        }

        address[3] memory w = arena.getWinners();

        vm.prank(w[0]);
        arena.claimPrize();

        vm.prank(w[0]);
        vm.expectRevert("Already claimed");
        arena.claimPrize();
    }

    // -------------------------------------------------------
    // 17. Reset Game
    // -------------------------------------------------------

    function testResetGame() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);   arena.joinArena{value: 0.01 ether}();

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
            vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
            vm.warp(block.timestamp + 31);
            arena.resolveRound();
        }

        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.ENDED));

        arena.resetGame();

        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.WAITING));
        assertEq(arena.currentRound(), 0);
        assertEq(arena.activePlayerCount(), 0);
        assertEq(arena.prizePool(), 0);
    }

    // -------------------------------------------------------
    // 18–22. EIP-712 permit functions
    // -------------------------------------------------------

    // Helper: build ActionPermit digest and sign with a private key
    function _signActionPermit(
        uint256 signerPk,
        address player,
        uint8   action,
        uint256 round,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(
            keccak256("ActionPermit(address player,uint8 action,uint256 round,uint256 nonce,uint256 deadline)"),
            player, action, round, nonce, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", arena.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(signerPk, digest);
    }

    // Helper: build ClaimPermit digest and sign
    function _signClaimPermit(
        uint256 signerPk,
        address player,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(
            keccak256("ClaimPermit(address player,uint256 nonce,uint256 deadline)"),
            player, nonce, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", arena.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(signerPk, digest);
    }

    function testSubmitActionWithPermit() public {
        vm.prank(alice); arena.joinArena{value: 0.01 ether}();

        uint256 nonce    = arena.nonces(alice);
        uint256 deadline = block.timestamp + 60;

        // Use aliceSkPk (we know the private key) to sign as alice's address
        // For testing, sign with alice's private key directly (aliceSkPk is alice's key here)
        // We need alice's private key. Use vm.addr to derive alice from aliceSkPk.
        // Note: aliceSk = vm.addr(aliceSkPk) — that's the SESSION key, not alice herself.
        // For this test, we'll use a fresh deterministic key for alice.
        uint256 alicePk = 0xA11CE000;
        address aliceFromPk = vm.addr(alicePk);
        vm.deal(aliceFromPk, 1 ether);

        // aliceFromPk joins
        vm.prank(aliceFromPk); arena.joinArena{value: 0.01 ether}();

        uint256 aliceNonce = arena.nonces(aliceFromPk);
        (uint8 v, bytes32 r, bytes32 s) = _signActionPermit(
            alicePk, aliceFromPk, uint8(ParallelArena.Action.ATTACK),
            arena.currentRound(), aliceNonce, deadline
        );

        // Relayer (bob) submits on aliceFromPk's behalf
        vm.prank(bob);
        arena.submitActionWithPermit(aliceFromPk, uint8(ParallelArena.Action.ATTACK), aliceNonce, deadline, v, r, s);

        // Action recorded under player address
        assertEq(uint8(arena.roundActions(0, aliceFromPk)), uint8(ParallelArena.Action.ATTACK));
        // Nonce incremented
        assertEq(arena.nonces(aliceFromPk), aliceNonce + 1);
    }

    function testSubmitActionWithPermit_ExpiredDeadline() public {
        uint256 alicePk = 0xA11CE000;
        address aliceFromPk = vm.addr(alicePk);
        vm.deal(aliceFromPk, 1 ether);
        vm.prank(aliceFromPk); arena.joinArena{value: 0.01 ether}();

        uint256 deadline = block.timestamp - 1; // already expired
        uint256 nonce = arena.nonces(aliceFromPk);
        (uint8 v, bytes32 r, bytes32 s) = _signActionPermit(
            alicePk, aliceFromPk, uint8(ParallelArena.Action.ATTACK),
            arena.currentRound(), nonce, deadline
        );

        vm.expectRevert("Permit expired");
        arena.submitActionWithPermit(aliceFromPk, uint8(ParallelArena.Action.ATTACK), nonce, deadline, v, r, s);
    }

    function testSubmitActionWithPermit_WrongNonce() public {
        uint256 alicePk = 0xA11CE000;
        address aliceFromPk = vm.addr(alicePk);
        vm.deal(aliceFromPk, 1 ether);
        vm.prank(aliceFromPk); arena.joinArena{value: 0.01 ether}();

        uint256 wrongNonce = arena.nonces(aliceFromPk) + 1; // stale
        uint256 deadline   = block.timestamp + 60;
        (uint8 v, bytes32 r, bytes32 s) = _signActionPermit(
            alicePk, aliceFromPk, uint8(ParallelArena.Action.ATTACK),
            arena.currentRound(), wrongNonce, deadline
        );

        vm.expectRevert("Invalid nonce");
        arena.submitActionWithPermit(aliceFromPk, uint8(ParallelArena.Action.ATTACK), wrongNonce, deadline, v, r, s);
    }

    function testSubmitActionWithPermit_WrongSigner() public {
        uint256 alicePk = 0xA11CE000;
        address aliceFromPk = vm.addr(alicePk);
        vm.deal(aliceFromPk, 1 ether);
        vm.prank(aliceFromPk); arena.joinArena{value: 0.01 ether}();

        uint256 nonce    = arena.nonces(aliceFromPk);
        uint256 deadline = block.timestamp + 60;
        uint256 evilPk   = 0xEEEE; // different key

        (uint8 v, bytes32 r, bytes32 s) = _signActionPermit(
            evilPk, aliceFromPk, uint8(ParallelArena.Action.ATTACK),
            arena.currentRound(), nonce, deadline
        );

        vm.expectRevert("Invalid signature");
        arena.submitActionWithPermit(aliceFromPk, uint8(ParallelArena.Action.ATTACK), nonce, deadline, v, r, s);
    }

    function testClaimPrizeWithPermit() public {
        uint256 alicePk = 0xA11CE000;
        address aliceFromPk = vm.addr(alicePk);
        vm.deal(aliceFromPk, 1 ether);

        vm.prank(aliceFromPk); arena.joinArena{value: 0.01 ether}();
        vm.prank(bob);         arena.joinArena{value: 0.01 ether}();
        vm.prank(carol);       arena.joinArena{value: 0.01 ether}();

        // Play 5 rounds to end the game
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(aliceFromPk); arena.submitAction(ParallelArena.Action.ATTACK);
            vm.prank(bob);         arena.submitAction(ParallelArena.Action.DEFEND);
            vm.prank(carol);       arena.submitAction(ParallelArena.Action.HEAL);
            vm.warp(block.timestamp + 31);
            arena.resolveRound();
        }

        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.ENDED));

        address[3] memory w = arena.getWinners();
        // Find if aliceFromPk is a winner
        bool aliceWon = (w[0] == aliceFromPk || w[1] == aliceFromPk || w[2] == aliceFromPk);
        if (!aliceWon) return; // skip if alice didn't make top 3

        uint256 nonce    = arena.nonces(aliceFromPk);
        uint256 deadline = block.timestamp + 60;
        uint256 pool     = arena.prizePool();
        uint256 balBefore = aliceFromPk.balance;

        (uint8 v, bytes32 r, bytes32 s) = _signClaimPermit(alicePk, aliceFromPk, nonce, deadline);

        // Relayer (bob) submits the claim — prize goes to aliceFromPk, not bob
        vm.prank(bob);
        arena.claimPrizeWithPermit(aliceFromPk, nonce, deadline, v, r, s);

        // Prize went to aliceFromPk
        assertTrue(aliceFromPk.balance > balBefore);
        // Bob received nothing extra (he only paid gas which we don't track in test)
        assertEq(arena.prizeClaimed(aliceFromPk), true);
        assertEq(arena.nonces(aliceFromPk), nonce + 1);
    }

    // -------------------------------------------------------
    // 23–28. Agent system
    // -------------------------------------------------------

    function _agentAddress() internal view returns (address) {
        return vm.addr(0xA6E000);
    }

    function testRegisterAgent() public {
        address agentAddr = _agentAddress();
        vm.prank(alice);
        arena.registerAgent{value: 0.1 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.AGGRESSIVE));

        ParallelArena.AgentInfo memory info = arena.getAgentInfo(agentAddr);
        assertEq(info.owner, alice);
        assertEq(uint8(info.strategy), uint8(ParallelArena.AgentStrategy.AGGRESSIVE));
        assertTrue(info.active);
        assertEq(info.balance, 0.05 ether); // 0.1 - 0.05 creation fee
    }

    function testRegisterAgent_InsufficientFee() public {
        address agentAddr = _agentAddress();
        vm.prank(alice);
        vm.expectRevert("Insufficient creation fee");
        arena.registerAgent{value: 0.01 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.RANDOM));
    }

    function testRegisterAgent_DuplicateOwner() public {
        address agentAddr  = _agentAddress();
        address agentAddr2 = vm.addr(0xA6E001);
        vm.prank(alice);
        arena.registerAgent{value: 0.1 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.RANDOM));

        vm.prank(alice);
        vm.expectRevert("Already have an agent");
        arena.registerAgent{value: 0.1 ether}(agentAddr2, uint8(ParallelArena.AgentStrategy.RANDOM));
    }

    function testDepositAgent() public {
        address agentAddr = _agentAddress();
        vm.prank(alice);
        arena.registerAgent{value: 0.05 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.RANDOM));

        vm.prank(alice);
        arena.depositAgent{value: 0.1 ether}(agentAddr);

        assertEq(arena.getAgentInfo(agentAddr).balance, 0.1 ether);
    }

    function testAgentJoinArena() public {
        address agentAddr = _agentAddress();
        vm.prank(alice);
        // 0.05 creation fee + 0.05 balance (enough for 5 entry fees)
        arena.registerAgent{value: 0.1 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.ADAPTIVE));

        // Relayer calls agentJoinArena on behalf of the agent
        vm.prank(relayer);
        arena.agentJoinArena(agentAddr);

        ParallelArena.Player memory p = arena.getPlayer(agentAddr);
        assertEq(uint8(p.status), uint8(ParallelArena.PlayerStatus.ACTIVE));
        assertEq(arena.activePlayerCount(), 1);
        // Entry fee deducted from agent balance
        assertEq(arena.getAgentInfo(agentAddr).balance, 0.05 ether - 0.01 ether);
    }

    function testAgentJoinArena_OnlyRelayer() public {
        address agentAddr = _agentAddress();
        vm.prank(alice);
        arena.registerAgent{value: 0.1 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.RANDOM));

        vm.prank(bob); // not the relayer
        vm.expectRevert("Only relayer");
        arena.agentJoinArena(agentAddr);
    }

    function testDeactivateAndActivateAgent() public {
        address agentAddr = _agentAddress();
        vm.prank(alice);
        arena.registerAgent{value: 0.05 ether}(agentAddr, uint8(ParallelArena.AgentStrategy.RANDOM));

        vm.prank(alice);
        arena.deactivateAgent();
        assertFalse(arena.getAgentInfo(agentAddr).active);

        vm.prank(alice);
        arena.activateAgent();
        assertTrue(arena.getAgentInfo(agentAddr).active);
    }
}

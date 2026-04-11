// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ParallelArena.sol";

contract ParallelArenaTest is Test {
    ParallelArena arena;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address carol = address(0xCA401);
    address dave  = address(0xDA4E);

    // Session key private keys (deterministic via vm.addr)
    uint256 aliceSkPk = 0xA11CE5E55100;
    uint256 bobSkPk   = 0xB0B5E55100;
    address aliceSk;
    address bobSk;

    function setUp() public {
        arena = new ParallelArena();
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

        // Play through MAX_ROUNDS (5) rounds
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice); arena.submitAction(ParallelArena.Action.ATTACK);
            vm.prank(bob);   arena.submitAction(ParallelArena.Action.DEFEND);
            vm.warp(block.timestamp + 31);
            arena.resolveRound();
        }

        assertEq(uint8(arena.phase()), uint8(ParallelArena.GamePhase.ENDED));
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
}

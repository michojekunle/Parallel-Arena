// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ParallelArenaV2} from "../src/ParallelArenaV2.sol";

/// @notice Deploy ParallelArenaV2 to Monad Testnet.
///
/// Usage:
///   forge script script/DeployV2.s.sol \
///     --rpc-url $MONAD_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast -vvvv
///
/// Env vars required:
///   RELAYER_ADDRESS — the relayer EOA that submits permit txs
///   PRIVATE_KEY     — deployer private key
contract DeployV2 is Script {
    function run() external {
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        require(relayer != address(0), "RELAYER_ADDRESS not set");

        vm.startBroadcast();
        ParallelArenaV2 arena = new ParallelArenaV2(relayer);
        vm.stopBroadcast();

        console2.log("ParallelArenaV2 deployed at:", address(arena));
        console2.log("Owner:", arena.owner());
        console2.log("Relayer:", arena.relayerAddress());
        console2.log("ROUND_DURATION:", arena.ROUND_DURATION());
        console2.log("MAX_PLAYERS:", arena.MAX_PLAYERS());
        console2.log("ENTRY_FEE:", arena.ENTRY_FEE());
    }
}

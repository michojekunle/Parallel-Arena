// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ParallelArena.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        ParallelArena arena = new ParallelArena();
        console.log("ParallelArena deployed at:", address(arena));

        vm.stopBroadcast();
    }
}

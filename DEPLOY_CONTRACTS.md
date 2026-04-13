# Parallel Arena — Smart Contract Deployment Guide

Deploy `ParallelArena.sol` (V1) or `ParallelArenaV2.sol` (V2) to Monad Testnet.

---

## Quick Reference

| Version | Features | Upgrade Path | Mutable Params |
|---------|----------|--------------|----------------|
| **V1** | Base game loop, session keys, gasless relay | → V2 | No (hardcoded) |
| **V2** | Everything + mutable params + claim window + paginated leaderboard | Proxy required | ✅ Yes |

**For MVP**: Deploy **V1** (already working)  
**For production**: Deploy **V2** with proxy (Phase 2 of mitigation plan)

---

## Prerequisites

1. **Foundry installed** (forge, cast)
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Environment variables set** (in `.env`)
   ```bash
   PRIVATE_KEY=0x...          # Your deployer wallet (must have gas)
   RELAYER_ADDRESS=0x...      # Relayer wallet (can be different account)
   MONAD_RPC_URL=https://testnet-rpc.monad.xyz
   ```

3. **Deployer wallet funded** with MON testnet tokens
   - Need ~0.1 MON for gas
   - Get from [Monad faucet](https://faucet.monad.xyz/)

---

## Option 1: Deploy V1 (ParallelArena.sol) — 2 minutes

**Current deployed contract:** `0xb3Ce39EB88984A00E2de340450e872fDE6fb1c6f`

If you want to deploy a fresh V1:

```bash
cd contracts

# Compile
forge build

# Deploy to Monad testnet
forge script script/Deploy.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv

# Output will show:
# ParallelArena deployed at: 0x...
# Relayer address: 0x...
```

**Copy the contract address** → Update `.env`:
```bash
CONTRACT_ADDRESS=0x...
```

---

## Option 2: Deploy V2 (ParallelArenaV2.sol) — 2 minutes

**New features:**
- Mutable game parameters (duration, max players, entry fee)
- 7-day claim window enforcement
- Paginated leaderboard (`getLeaderboardPage(offset, limit)`)
- O(1) membership checks
- Consecutive heal penalty
- 2-second resolve delay (MEV mitigation)
- Randomized target selection via `block.prevrandao`

### 2.1 Compile V2

```bash
cd contracts
forge build
```

If compilation fails, check:
- Solidity version in `ParallelArenaV2.sol` matches `foundry.toml`
- All imports resolve (check `node_modules/@openzeppelin/...`)

### 2.2 Deploy V2

```bash
forge script script/DeployV2.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv
```

**Output:**
```
ParallelArenaV2 deployed at: 0x...
Owner: 0x... (your wallet)
Relayer: 0x... (from RELAYER_ADDRESS)
ROUND_DURATION: 30
MAX_PLAYERS: 20
ENTRY_FEE: 10000000000000000 (0.01 MON)
```

**Update `.env`:**
```bash
CONTRACT_ADDRESS=0x...
```

---

## Option 3: Deploy V2 with Upgradeable Proxy (Phase 2 Production)

For production with zero-downtime upgrades.

### 3.1 Create Proxy Deployment Script

Create `contracts/script/DeployProxy.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {ParallelArenaV2Upgradeable} from "../src/ParallelArenaV2Upgradeable.sol";

contract DeployProxy is Script {
    function run() external {
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        require(relayer != address(0), "RELAYER_ADDRESS not set");

        vm.startBroadcast();

        // 1. Deploy implementation
        ParallelArenaV2Upgradeable impl = new ParallelArenaV2Upgradeable();
        console2.log("Implementation deployed at:", address(impl));

        // 2. Deploy ProxyAdmin
        ProxyAdmin admin = new ProxyAdmin(msg.sender);
        console2.log("ProxyAdmin deployed at:", address(admin));

        // 3. Deploy proxy pointing to implementation
        bytes memory initData = abi.encodeCall(impl.initialize, (relayer));
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            address(impl),
            address(admin),
            initData
        );
        console2.log("Proxy deployed at:", address(proxy));
        console2.log("ProxyAdmin owner:", admin.owner());

        vm.stopBroadcast();

        // Print for reference
        console2.log("\n=== SAVE THESE ADDRESSES ===");
        console2.log("IMPLEMENTATION:", address(impl));
        console2.log("PROXY (use as CONTRACT_ADDRESS):", address(proxy));
        console2.log("ADMIN (for upgrades):", address(admin));
    }
}
```

### 3.2 Deploy Proxy

```bash
forge script script/DeployProxy.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv
```

**Update `.env`:**
```bash
CONTRACT_ADDRESS=0x...          # Proxy address
IMPLEMENTATION_ADDRESS=0x...    # For future reference
PROXY_ADMIN_ADDRESS=0x...       # For upgrades
```

### 3.3 Upgrade Later (Zero Downtime)

To upgrade to a new version:

```bash
# 1. Deploy new implementation
forge script script/DeployV3Implementation.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv

# 2. Call upgrade (via ProxyAdmin)
cast send $PROXY_ADMIN_ADDRESS \
  "upgrade(address,address)" \
  $PROXY \
  $NEW_IMPLEMENTATION_ADDRESS \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --gas-price 250gwei
```

---

## Verify Deployment

### Check contract on MonadScan

```bash
# View contract
https://testnet.monadexplorer.com/address/0x...

# View code + call functions
```

### Call contract functions via cast

```bash
# Get game state
cast call $CONTRACT_ADDRESS \
  "getFullGameState()" \
  --rpc-url $MONAD_RPC_URL

# Get player stats
cast call $CONTRACT_ADDRESS \
  "getPlayerStats(address)" \
  0x... \
  --rpc-url $MONAD_RPC_URL

# Get leaderboard (V2 only)
cast call $CONTRACT_ADDRESS \
  "getLeaderboardPage(uint256,uint256)" \
  0 10 \
  --rpc-url $MONAD_RPC_URL
```

### Test with write functions

```bash
# Join arena
cast send $CONTRACT_ADDRESS \
  "joinArena()" \
  --value 0.01ether \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --gas-price 250gwei

# Submit action
cast send $CONTRACT_ADDRESS \
  "submitAction(uint8)" \
  1 \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --gas-price 250gwei
```

---

## Troubleshooting

### "PRIVATE_KEY not set"
```bash
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol ... # try again
```

### "RPC connection failed"
```bash
# Test RPC
curl -X POST https://testnet-rpc.monad.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# If down, use fallback
MONAD_RPC_URL=https://testnet-rpc2.monad.xyz
```

### "Insufficient gas"
```bash
# Check balance
cast balance $DEPLOYER_ADDRESS --rpc-url $MONAD_RPC_URL

# Top up from faucet
# https://faucet.monad.xyz/
```

### "Contract size too large"
V1 might hit Monad's size limit if heavily modified. Solutions:
- Use proxy pattern (Option 3)
- Split into multiple contracts
- Use libraries for shared logic

### "Constructor parameter wrong"
Check `.env` that `RELAYER_ADDRESS` is set correctly:
```bash
cast call $CONTRACT_ADDRESS "relayerAddress()" --rpc-url $MONAD_RPC_URL
# Should match your relayer
```

---

## Gas Estimates

| Operation | Gas (Testnet) | Cost (@ 250 gwei) |
|-----------|---------------|------------------|
| Deploy V1 | ~1.2M | ~0.3 MON |
| Deploy V2 | ~1.5M | ~0.38 MON |
| Deploy Proxy | ~2.0M | ~0.5 MON |
| Join game | ~80k | ~0.02 MON |
| Submit action | ~60k | ~0.015 MON |
| Resolve round | ~250k | ~0.063 MON |

**Total for MVP setup**: ~0.5 MON

---

## Next Steps

### After Deployment

1. **Update frontend `.env`**
   ```bash
   NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
   CONTRACT_ADDRESS=0x...
   ```

2. **Verify contract is live**
   ```bash
   npm run dev
   # Connect wallet → should join game
   ```

3. **Start orchestrator**
   ```bash
   npm run arena
   ```

4. **Fund agents**
   ```bash
   npm run fund
   ```

### Optional: Audit & Verification

For production (mainnet), before deploying:
1. **Run tests**: `forge test`
2. **Code review**: Security audit (OpenZeppelin, Spearbit, etc.)
3. **Verify on explorer**: `forge verify-contract`
4. **Bug bounty**: HackerOne, Immunefi

---

## Contract Architecture (V2)

```solidity
ParallelArenaV2.sol (2000 LOC)
├── Constructor(relayerAddress)
├── joinArena() → transfers 0.01 MON, adds player
├── submitAction(action) → silent (session key) or gasless (permit relay)
├── resolveRound() → all players' actions → update healths
├── resetGame() → clear state, next round begins
├── claimPrize(nonce, v, r, s) → EIP-712 permit, transfer rewards
│
├── Params (mutable by owner)
│   ├── ROUND_DURATION (30s)
│   ├── MAX_PLAYERS (20)
│   ├── MAX_ROUNDS (5)
│   └── ENTRY_FEE (0.01 MON)
│
├── Getters (view functions)
│   ├── getFullGameState() → round, deadline, phase, winners
│   ├── getPlayerStats(address) → games, wins, kills, damage
│   ├── getAllPlayers() → active + dead players
│   ├── getLeaderboardPage(offset, limit) → paginated stats
│   └── getRoundResult(round) → attacks, heals, deaths
│
└── Events
    ├── PlayerJoined(player, round)
    ├── ActionSubmitted(player, action, round, txHash)
    ├── PlayerAttacked(attacker, target, damage, round)
    ├── PlayerHealed(healer, amount, round)
    ├── RoundResolved(round, actions, rewards)
    └── GameEnded(winners, pool)
```

---

## Mainnet Deployment (Future)

When ready to go live on Monad mainnet:

```bash
MONAD_RPC_URL=https://mainnet-rpc.monad.xyz \
forge script script/DeployProxy.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv \
  --verify  # Auto-verify on explorer
```

Update frontend:
```bash
NEXT_PUBLIC_RPC_URL=https://mainnet-rpc.monad.xyz
CONTRACT_ADDRESS=0x... (mainnet address)
```

---

**Deploy and you're live!** 🚀

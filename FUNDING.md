# Master Account Funding Guide

## Problem

The master account (deployer wallet) is the **gas pool** for the entire system:
- Funds agents at startup if they fall below minimum
- Pays for resolver transactions (resolveRound)
- Handles balance manager operations

**Current state**: Master balance ~0.51 MON
**Typical cost per game**: 
- Topping up agents: ~0.1-0.2 MON
- Resolving each round: ~0.01-0.05 MON per resolve
- Running 10 rounds = ~0.5-1.0 MON total

**Result**: After 1-2 games, master runs dry → resolver fails → game halts

---

## Solution: Top Up Master Account

### Option 1: Monad Testnet Faucet (Recommended)

The Monad testnet has a public faucet:

```bash
# Master account address
MASTER_ADDR=0xA711CEA2F1c571BbEEaB06Efd7dA8c660E7D6eA3

# Visit faucet web UI:
# https://faucet.monad.xyz/
# Or use the faucet API (if available)

# Request 5-10 MON (or max allowed per faucet)
```

Then verify:
```bash
cast balance $MASTER_ADDR --rpc-url https://testnet-rpc.monad.xyz
```

### Option 2: Direct Fund via cast (if you have a funded wallet)

```bash
MASTER_ADDR=0xA711CEA2F1c571BbEEaB06Efd7dA8c660E7D6eA3
AMOUNT=5 # MON

cast send $MASTER_ADDR "" \
  --value ${AMOUNT}ether \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key <your_funded_private_key>
```

### Option 3: Bridge from Layer 1 (if L1 bridge available)

If Monad has an L1 bridge (Ethereum, Polygon, etc.), you can bridge funds:
1. Bridge from L1 → Monad testnet
2. Receive MON in your wallet
3. Fund the master account

---

## Estimated Gas Costs

| Operation | Cost (MON) | Frequency |
|-----------|-----------|-----------|
| Agent top-up (1 tx) | ~0.001 | Per agent per startup |
| resolveRound (1 tx) | ~0.005-0.02 | Per round per game |
| resetGame (1 tx) | ~0.001 | Per game reset |
| Balance rebalance (N+1 txs) | ~0.01-0.05 | Every 5 min if needed |

**Example game (10 agents, 5 rounds)**:
- Startup: Fund 2 agents = 0.002 MON
- 5 resolve txs = 0.05-0.1 MON
- 1 reset = 0.001 MON
- **Total: ~0.053-0.103 MON per game**

---

## Monitoring Master Balance

### Check current balance:
```bash
cast balance 0xA711CEA2F1c571BbEEaB06Efd7dA8c660E7D6eA3 --rpc-url https://testnet-rpc.monad.xyz
```

### Watch orchestrator logs:
```bash
npm run arena 2>&1 | grep "relayer balance"
```

Output examples:
```json
{"level":"info","msg":"relayer balance ok","address":"0xA711...","balance":"5.5"}  // healthy
{"level":"warn","msg":"relayer balance low","address":"0xA711...","balance":"0.2"}  // warning
{"level":"error","msg":"relayer balance critically low","address":"0xA711...","balance":"0.05"}  // critical
```

---

## Long-Term Solution: Automated Top-Up

For production, implement an automated master account top-up:

```bash
# Add to orchestrator loop (every 5 min)
if (masterBalance < 1.0) {
  // Alert ops team or auto-trigger faucet endpoint
  // (if faucet supports it)
}
```

Or use a relayer service (e.g., Gelato, Pimlico) that manages gas balance automatically.

---

## Troubleshooting

### "Signer had insufficient bal"

**Cause**: Master account balance too low
```bash
# Check balance
cast balance 0xA711CEA2F1c571BbEEaB06Efd7dA8c660E7D6eA3 --rpc-url https://testnet-rpc.monad.xyz

# If < 0.1 MON: top up immediately via faucet or manual transfer
```

### Resolver keeps failing

1. Check master balance (see above)
2. If low, top up via faucet
3. Restart orchestrator: `npm run arena`

### Game halts after 1-2 rounds

Likely master balance depleted. Check logs:
```bash
npm run arena 2>&1 | grep -i "insufficient\|balance\|critical"
```

---

## Current Status

**Master Account**: 0xA711CEA2F1c571BbEEaB06Efd7dA8c660E7D6eA3  
**Current Balance**: Check with `cast balance` (see above)  
**Recommended Min**: 1.0 MON (for ~10 games)  
**Recommended Buffer**: 5-10 MON (for long sessions)

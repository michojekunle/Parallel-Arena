# Parallel Arena — Testing & Deployment Guide

## Architecture Overview

```
contracts/     Solidity (Foundry) — ParallelArenaV2
scripts/       Node.js orchestrator + AI agent swarm
frontend/      Next.js 14 app (wagmi + viem)
```

**Live contract**: `0x14b4ee569a9be97e0e0feE136eaffebd36228601` on Monad Testnet (chainId 10143)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | `nvm install 18` |
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Git | any | — |

---

## 2. Environment Setup

```bash
# Clone and install
git clone <repo>
cd parallel-arena
npm install                         # orchestrator deps
cd frontend && npm install          # frontend deps
cd ../contracts && forge install    # solidity deps

# Copy and fill env
cp .env.example .env
```

### Required `.env` keys

```bash
# ── Chain ──────────────────────────────────────────────────────────────────
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
CONTRACT_ADDRESS=0x14b4ee569a9be97e0e0feE136eaffebd36228601

# ── Master account (deployer + resolver + resetter) ───────────────────────
# Must hold ≥ 5 MON before starting.
# Testnet MON faucet: https://faucet.monad.xyz
PRIVATE_KEY=0x<your-64-char-hex-key>

# ── Relayer (used by the frontend /api/relay endpoint) ────────────────────
# Can be the same as PRIVATE_KEY for single-machine setups.
RELAYER_ADDRESS=0x<relayer-public-address>

# ── Agent wallets (10 required for a full 10-agent swarm) ────────────────
# Each needs ≥ 1 MON. balanceManager.js tops them up automatically.
NUM_AGENTS=10
AGENT_KEY_0=0x...
AGENT_KEY_1=0x...
# ... through AGENT_KEY_9

# ── Frontend Next.js env (separate file: frontend/.env.local) ─────────────
NEXT_PUBLIC_CONTRACT_ADDRESS=0x14b4ee569a9be97e0e0feE136eaffebd36228601
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
RELAYER_PRIVATE_KEY=0x<relayer-private-key>   # server-only, never exposed
```

> **Security**: Never commit `.env` or `.env.local`. Both are in `.gitignore`.

---

## 3. Running Tests

### Frontend unit tests — 64 tests, all passing

```bash
cd frontend
npm test                    # run all tests once
npm run test:watch          # watch mode during development
npm run test:coverage       # with per-file coverage report
```

**Test files and what they cover**:

| File | What it verifies |
|------|-----------------|
| `lib/__tests__/types.test.ts` | Enum values match Solidity (ATTACK=1, DEAD=2, etc.) |
| `lib/__tests__/constants.test.ts` | ≥2 RPC URLs, correct chain ID 10143, SHORT_ADDR format |
| `lib/__tests__/eip712.test.ts` | Domain name = `ParallelArenaV2`, field order, `action` is `uint8` |
| `lib/__tests__/contract.test.ts` | ABI has all functions, no deprecated V1 `getGameState`, Player struct has `consecutiveHeals` |
| `lib/__tests__/gameLogic.test.ts` | Attack target selection, `canAct` guard, HP math (damage/heal/clamp) |
| `lib/__tests__/sessionKeyCrypto.test.ts` | AES-GCM roundtrip, IV randomness, tamper detection, wrong-address rejection |
| `api/relay/__tests__/rateLimit.test.ts` | 10/60s window, per-IP isolation, sliding window, eviction |

### Contract tests (Foundry)

```bash
cd contracts
forge test -vv                                    # all tests
forge test -vv --match-test testJoinArena        # single test
forge test -vv --match-contract ParallelArena    # single contract
forge coverage                                    # coverage report
```

### Manual end-to-end smoke test

```bash
# Terminal 1: frontend
cd frontend && npm run dev

# Terminal 2: agent swarm (optional — creates game traffic)
npm run arena
```

Then in browser at `http://localhost:3000`:
1. Connect a wallet (MetaMask with Monad testnet, chainId 10143)
2. Click **JOIN GAME (0.01 MON)** → confirms 1 on-chain tx, then auto-authorizes session key
3. Click **ATTACK / DEFEND / HEAL** → no wallet pop-up (gasless EIP-712 signature)
4. Watch the parallel visualization panel — actions appear as lanes firing simultaneously
5. After deadline, round resolves → HP changes appear in player grid + battle log
6. After 5 rounds, end-game modal shows winners + replay viewer
7. Winners click **CLAIM PRIZE** → gasless signature, relay submits on-chain

---

## 4. Running the Agent Swarm (Local Dev)

```bash
# One-time: fund agents (needs PRIVATE_KEY with ≥ 12 MON)
node scripts/distributeMon.js

# Verify balances
node scripts/checkBalances.js

# Start full orchestrator (manages all 4 daemons with auto-restart)
npm run arena

# Structured NDJSON logs — pipe to file in production:
npm run arena >> logs/arena.ndjson 2>&1
```

**What each daemon does**:

| Daemon | Script | Responsibility |
|--------|--------|---------------|
| agents | `agents.js` | 10 AI agents join arena, submit parallel actions each round |
| autoResolve | `autoResolve.js` | Calls `resolveRound()` when deadline passes (master key) |
| autoReset | `autoReset.js` | Calls `resetGame()` after ENDED phase (owner bypass = instant) |
| balanceMgr | `balanceManager.js` | Rebalances agent wallets every 90s when any < 0.3 MON |

All daemons auto-restart after crashes with a 5s backoff. The orchestrator itself handles SIGINT/SIGTERM gracefully.

---

## 5. Deploying a New Contract

Only do this if `ParallelArenaV2.sol` is modified.

```bash
cd contracts

# Run tests first
forge test -vv

# Dry run (simulate, no broadcast)
forge script script/DeployV2.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  -vvvv

# Deploy (broadcast submits the tx)
forge script script/DeployV2.s.sol \
  --rpc-url $MONAD_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvvv
```

After deployment:
1. Copy the deployed address from console output
2. Update `CONTRACT_ADDRESS` in root `.env`
3. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `frontend/.env.local`
4. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel environment variables (if deployed)
5. Restart orchestrator: `pm2 restart arena-orchestrator`
6. Redeploy frontend (Vercel auto-deploys on push)

---

## 6. Deploying the Frontend (Vercel)

```bash
cd frontend
npm run build    # verify build is clean before pushing
```

In Vercel dashboard:
1. Import the `frontend/` subdirectory (set root to `frontend/`)
2. Add environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = `0x14b4ee569a9be97e0e0feE136eaffebd36228601`
   - `NEXT_PUBLIC_RPC_URL` = `https://testnet-rpc.monad.xyz`
   - `RELAYER_PRIVATE_KEY` = `0x...` ← **server-only**, Vercel keeps this secret
3. Deploy → Vercel auto-redeploys on every push to main

The relay endpoint (`/api/relay`) is a serverless function with 10 req/min/IP rate limiting. The relayer private key never reaches the browser.

---

## 7. Running the Orchestrator in Production

Use `pm2` for process management:

```bash
npm install -g pm2

# Start
pm2 start "node scripts/orchestrate.js" \
  --name arena-orchestrator \
  --log logs/arena.log

# Persist across reboots
pm2 save && pm2 startup

# Monitor
pm2 logs arena-orchestrator --lines 50
pm2 monit
```

The orchestrator already handles daemon crashes (auto-restart with 5s backoff). `pm2` handles the outer process crash.

---

## 8. Health Checks & Monitoring

**Frontend health endpoint** (used by load balancers):
```bash
curl https://your-domain.com/api/health
# → {"status":"ok","contract":"0x14b4...","rpcs":[{"url":"...","ok":true,"blockNumber":"..."},...]}
```

**Agent balance check**:
```bash
node scripts/checkBalances.js
```

**Orchestrator balance alerts**:
- `level:"warn"` — master balance < 2 MON
- `level:"error"` — master balance < 0.5 MON (resolver will fail soon)

When the error fires: top up `PRIVATE_KEY` address with testnet MON from the faucet.

---

## 9. Troubleshooting

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| `"Signer had insufficient balance"` | Agent wallet < gas for tx | Run `node scripts/distributeMon.js` |
| `"Wrong entry fee"` | Hardcoded fee drifted from contract | Fixed: agents.js reads `entryFee()` on startup |
| Gasless submit always reverts | EIP-712 domain name mismatch | Fixed: domain is `ParallelArenaV2` |
| Player HP/stats wrong after fetch | Missing ABI struct field | Fixed: `consecutiveHeals` in ABI + TS interface |
| autoResolve `execution reverted` | Calling deprecated V1 function | Fixed: uses `getFullGameState()` |
| Frontend gets 429 | Relay rate limit (10/60s/IP) | Wait 60s; or raise `RATE_MAX` in `route.ts` |
| Frontend blank on RPC outage | Single-RPC transport | Fixed: all clients use `fallback()` |
| autoReset crashes immediately | TypeScript syntax in Node.js | Fixed: removed `as unknown[]` cast |
| Race condition: double-resolve | Both agents.js + autoResolve calling resolveRound | Fixed: resolve only in autoResolve.js |

---

## 10. Reference

| Resource | URL |
|----------|-----|
| Monad Testnet Explorer | https://testnet.monadexplorer.com |
| Monad Faucet | https://faucet.monad.xyz |
| Primary RPC | `https://testnet-rpc.monad.xyz` |
| Fallback RPC | `https://monad-testnet.drpc.org` |
| Contract (deployed) | `0x14b4ee569a9be97e0e0feE136eaffebd36228601` |
| Chain ID | `10143` |
| EIP-712 domain name | `ParallelArenaV2` |
| Entry fee | `0.01 MON` (readable from `entryFee()` on-chain) |
| Round duration | `30 seconds` |
| Max rounds | `5` |
| Max players per game | `32` |

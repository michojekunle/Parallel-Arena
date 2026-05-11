# Parallel Arena

An on-chain multiplayer battle game on **Monad Testnet** that demonstrates parallel transaction execution. Up to 32 players submit simultaneous actions each round — attack, defend, or heal — which are batch-resolved in a single block. All in-game actions are gasless (EIP-712 typed signatures relayed by the server), so only the initial join requires a wallet confirmation.

**Live contract**: [`0x14b4ee569a9be97e0e0feE136eaffebd36228601`](https://testnet.monadexplorer.com/address/0x14b4ee569a9be97e0e0feE136eaffebd36228601) · Chain ID `10143`

## Architecture

```
contracts/          Solidity (Foundry) — ParallelArenaV2
  src/
    ParallelArenaV2.sol   Live contract (parallel execution + session keys)
    ParallelArena.sol     V1 (reference only)
  test/
    ParallelArenaV2.t.sol 17 test cases
    ParallelArena.t.sol   39 test cases

frontend/           Next.js 14 (wagmi + viem)
  src/
    app/            Pages: / (arena), /leaderboard, /api/relay, /api/stream
    components/     Arena, ActionPanel, PlayerAvatar, EndGameModal, ...
    hooks/          useArena, useSessionKey, useGameReplay, ...
    lib/            types, constants, contract ABI

scripts/            Node.js daemons (ES modules)
  agents.js         10 AI agents that join and play every game
  autoResolve.js    Calls resolveRound() after each deadline
  autoReset.js      Calls resetGame() after each game ends
  balanceManager.js Tops up agent wallets every 90s
  orchestrate.js    Spawns all 4 daemons with auto-restart on crash
  distributeMon.js  One-time: funds agent wallets from master key
  checkBalances.js  Print current balances of all wallets
```

## Quick Start (Local Dev)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 18 | `nvm install 18` |
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| MetaMask | any | Add Monad Testnet (see below) |

### 1. Clone and install

```bash
git clone <repo-url>
cd parallel-arena

npm install                      # root orchestrator deps
cd frontend && npm install       # Next.js deps
cd ../contracts && forge install # Solidity deps
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env: fill in PRIVATE_KEY, AGENT_KEY_0...9, RELAYER_PRIVATE_KEY
# CONTRACT_ADDRESS is already set to the live testnet deployment
```

Create `frontend/.env.local`:
```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0x14b4ee569a9be97e0e0feE136eaffebd36228601
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
RELAYER_PRIVATE_KEY=0x<your-relayer-private-key>
```

See [`.env.example`](.env.example) for all required keys with descriptions.

### 3. Add Monad Testnet to MetaMask

| Field | Value |
|-------|-------|
| Network name | Monad Testnet |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Chain ID | `10143` |
| Currency symbol | MON |
| Explorer | `https://testnet.monadexplorer.com` |

Get free testnet MON: **[faucet.monad.xyz](https://faucet.monad.xyz)**

### 4. Run the frontend

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

Connect your MetaMask wallet, click **JOIN GAME (0.01 MON)**, and play. All subsequent actions are gasless.

### 5. (Optional) Run the AI agent swarm

Agents create realistic game traffic so you can observe a full game without needing other real players.

```bash
# One-time: fund agent wallets (PRIVATE_KEY needs >= 12 MON)
node scripts/distributeMon.js

# Verify balances
node scripts/checkBalances.js

# Start all 4 daemons with auto-restart on crash
npm run arena
```

## Available Commands

### Root

```bash
npm run arena                              # Start full orchestrator
npm run arena >> logs/arena.ndjson 2>&1   # With structured NDJSON logging
```

### Frontend (`cd frontend`)

```bash
npm run dev          # Dev server at localhost:3000
npm run build        # Production build
npm test             # Run 64 unit tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

### Contracts (`cd contracts`)

```bash
forge test -vv                                        # All 56 tests
forge test --match-contract ParallelArenaV2Test -vv  # V2 tests only
forge coverage                                         # Coverage report
```

### Individual script daemons

```bash
node scripts/agents.js          # AI agent swarm
node scripts/autoResolve.js     # Round resolver daemon
node scripts/autoReset.js       # Game reset daemon
node scripts/balanceManager.js  # Wallet top-up daemon
node scripts/checkBalances.js   # Print wallet balances
node scripts/distributeMon.js   # Fund agent wallets (one-time setup)
```

## How the Game Works

1. **Join** — pay 0.01 MON entry fee (one on-chain transaction)
2. **Session key** — the frontend generates a throwaway keypair and registers it on-chain; all future actions are signed by this key (gasless, no wallet pop-ups)
3. **Each round (30s)** — choose ATTACK, DEFEND, or HEAL; your action is signed and relayed automatically
4. **Resolve** — after the deadline, `resolveRound()` is called; all actions execute in the same block, demonstrating Monad's parallel execution
5. **End game** — after 5 rounds (or when only 1 player remains), prizes are split 50/30/20% to the top 3

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart contract | Solidity 0.8.24, Foundry |
| Chain | Monad Testnet (parallel EVM) |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Web3 | wagmi v2, viem v2 |
| Gasless relay | EIP-712 typed data signing, Next.js API route |
| Session key security | AES-GCM-256 encryption, PBKDF2 (Web Crypto API) |
| Agent swarm | Node.js ES modules, viem |
| Tests | Foundry (Solidity), Jest + ts-jest + jsdom (TypeScript) |

## Production Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for:
- Vercel frontend deployment (with environment variables)
- Contract re-deployment steps
- Production pm2 process management
- Health check endpoints
- Troubleshooting reference

## License

MIT
# Demo Flow

## Setup (before demo)
- [ ] Contract deployed on Monad testnet
- [ ] 10 agent wallets funded
- [ ] Frontend running on localhost:3000
- [ ] Agent script ready to run
- [ ] Browser open, MetaMask on Monad Testnet

## Live Demo Steps

### Step 1: Context (30s)
Show empty arena. Explain the concept.
"10 players will submit actions. On old chains: 10 sequential blocks.
On Monad: 1 block."

### Step 2: Agents launch (30s)
Run `node agents.js` in terminal.
Watch 10 "join" transactions fire and confirm.
Agents appear on screen one by one.

### Step 3: Round 1 — The Money Shot (45s)
Round timer starts. Human joins and picks an action.
Agents fire their transactions — show the terminal spray of tx hashes.
Frontend shows actions streaming in visually, all at once.
Timer hits zero → resolveRound() fires.
Watch the resolution flash and stats appear.

### Step 4: Repeat (30s)
"Watch — round 2 starts immediately."
Agents submit again. Another burst. Another resolution.

### Step 5: Close (15s)
Show the battle log — the full history of parallel actions.
"This is what onchain gaming looks like when the chain keeps up."

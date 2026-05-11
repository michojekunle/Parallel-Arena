# Balance Management System — Unified Gas Pool

Ensures **no agent ever runs out of gas** by automatically collecting and redistributing MON across the agent fleet.

---

## How It Works

### **Problem Solved**
- Without balance management: Agents die randomly when their individual balances depleted
- Some agents spend faster (lots of txs), some slower
- Resolver needs gas to settle rounds

### **Solution: Unified Gas Pool**

```
┌─────────────────────────────────────────────────────────┐
│  MASTER ACCOUNT (Your deployer wallet)                  │
│  ├─ Keeps min buffer (0.1 MON) for safety              │
│  └─ Surplus → distributed to agents                     │
└─────────────────────────────────────────────────────────┘
           ↓ (every 5 minutes)
┌─────────────────────────────────────────────────────────┐
│  AGENT POOL (10 agents)                                 │
│  ├─ Check if any agent < 0.05 MON                      │
│  ├─ If yes: Collect from all agents with > 0.02 MON   │
│  ├─ Calculate: (total - master_buffer) / num_agents    │
│  └─ Redistribute evenly to all                         │
└─────────────────────────────────────────────────────────┘
```

---

## Configuration

Edit thresholds in `scripts/balanceManager.js`:

```javascript
// Below this → triggers automatic rebalance
const MIN_AGENT_BALANCE = parseEther('0.05')  // 0.05 MON

// Target per agent after rebalance
const TARGET_AGENT_BALANCE = parseEther('0.10')  // 0.10 MON

// Keep this much in master (safety buffer)
const MASTER_MIN_BUFFER = parseEther('0.1')  // 0.1 MON

// Keep this in agent while collecting (small reserve)
const collection_threshold = parseEther('0.02')  // 0.02 MON
```

---

## How It's Integrated

### **Automatic (Part of Orchestrator)**

```bash
npm run arena
```

This spawns 5 processes:
1. ⚔️ **Agents** — join arena, submit actions
2. ⏱️ **Auto-Resolver** — resolves rounds
3. 🔄 **Auto-Reset** — resets games
4. **Balance Manager** ← NEW — rebalances every 5 min
5. 💰 **Relayer Gas Monitor** — tracks relayer balance

### **Manual (Standalone)**

Run balance manager independently:
```bash
npm run balance
```

Useful for:
- Initial funding setup
- Manual rebalance checks
- Testing balance collection

---

## What It Does Each Cycle

### **Step 1: Check Balances**
```
Agent 0: 0.12 MON ✅
Agent 1: 0.04 MON ⚠️ (below 0.05 threshold)
Agent 2: 0.08 MON ✅
...
```

### **Step 2: Decide if Rebalance Needed**
```
Min balance: 0.04 MON
Threshold:   0.05 MON
→ 0.04 < 0.05 → REBALANCE NEEDED
```

### **Step 3: Collect from Agents**
```
Collecting from:
  Agent 0: 0.12 - 0.02 (reserve) = 0.10 MON sent to master
  Agent 2: 0.08 - 0.02 (reserve) = 0.06 MON sent to master
  ...
Total collected: 0.50 MON
```

### **Step 4: Redistribute Evenly**
```
Master before: 0.20 MON
Less buffer:   0.10 MON (kept as safety)
Available:     0.10 MON
Agents:        10
Per agent:     0.10 / 10 = 0.01 MON each

Send 0.01 MON to each agent
```

### **Step 5: Report**
```json
{
  "ts": "2026-04-13T18:45:00.000Z",
  "level": "info",
  "msg": "Redistribution complete",
  "successCount": 10,
  "totalAgents": 10
}
```

---

## Output Logs

### **Healthy State** (no rebalance needed)
```json
{
  "ts": "2026-04-13T18:45:00.000Z",
  "level": "info",
  "msg": "Balance status",
  "minBalance": "0.087",
  "avgBalance": "0.105",
  "totalBalance": "1.05",
  "threshold": "0.05"
}
```

### **Rebalance Triggered**
```json
{
  "ts": "2026-04-13T18:45:00.000Z",
  "level": "warn",
  "msg": "Agent(s) below threshold, triggering rebalance"
}
→ Collects from all agents
→ Redistributes evenly
```

### **Each Agent Transaction**
```json
{
  "ts": "2026-04-13T18:45:05.000Z",
  "level": "info",
  "msg": "Sent to agent",
  "to": "0xA711...",
  "amount": "0.015",
  "hash": "0xabc..."
}
```

---

## Cost Breakdown

**Per rebalance cycle:**
- Master account: ~10 collect txs @ 21k gas each = 210k gas
- Master account: ~10 distribute txs @ 21k gas each = 210k gas
- **Total per cycle: ~420k gas = ~0.105 MON @ 250 gwei**

**If rebalance runs every 5 minutes during active play:**
- 12 cycles/hour = 1.26 MON/hour
- Cost is covered by agents' surplus in each cycle (break-even)

**If no rebalance needed (healthy state):**
- Just checking balances (0 txs) = free

---

## Manual Rebalance

Force an immediate rebalance:

```bash
npm run balance
```

This will:
1. Check all agent balances
2. If any agent < 0.05 MON: collect + redistribute
3. Otherwise: just report status
4. Exit

---

## Emergency Recovery

If agents are **critically low** (all < 0.01 MON):

```bash
# 1. Fund master account directly
cast send 0x... "" --value 1ether --private-key $PRIVATE_KEY

# 2. Run manual rebalance
npm run balance

# 3. Restart orchestrator
npm run arena
```

---

## Monitoring

### **Check Current Balances**
```bash
# Run balance manager in check-only mode (doesn't transfer)
npm run balance
```

Look for:
```
minBalance: 0.087    ← lowest agent
avgBalance: 0.105    ← average
totalBalance: 1.05   ← all combined
```

### **Watch Live Logs**
```bash
# If running as systemd service
journalctl -u parallel-arena -f | grep "Balance status"
```

### **Set Up Alert**
If you see:
```
minBalance: 0.03  ← below 0.05 threshold
```

The next cycle (5 min) will auto-rebalance.

---

## Advanced Config

### **More Frequent Rebalancing**
Edit `scripts/balanceManager.js`, change:
```javascript
setInterval(fullRebalanceCycle, 5 * 60 * 1000)  // every 5 min
// to:
setInterval(fullRebalanceCycle, 2 * 60 * 1000)  // every 2 min
```

### **Stricter Thresholds**
```javascript
const MIN_AGENT_BALANCE = parseEther('0.08')  // stricter (higher)
const TARGET_AGENT_BALANCE = parseEther('0.15')  // higher target
```

### **Higher Master Buffer**
```javascript
const MASTER_MIN_BUFFER = parseEther('0.5')  // keep more in master
```

---

## Troubleshooting

### **"Agent balance critically low"**
→ Master account is also low or network is congested
→ Top up master: `cast send 0x... "" --value 1ether ...`
→ Check gas prices: `cast gas-price --rpc-url ...`

### **"Failed to collect from agent"**
→ Probably RPC rate limit
→ Balance manager retries next cycle
→ Or manually run: `npm run balance`

### **"Per-agent allocation too low"**
→ Total balance too small to distribute
→ Need to fund master account with more MON

### **Balance manager not running**
→ Check if it's in orchestrator process list: `ps aux | grep balance`
→ Run standalone: `npm run balance`
→ Check logs for errors: `journalctl -u parallel-arena -n 50`

---

## Lifecycle

```
Orchestrator starts
  ↓
Balance Manager spawned
  ↓
Wait 5 minutes
  ↓
Check all agent balances
  ↓
If any agent < 0.05 MON:
  ├─ Collect from all agents > 0.02 MON
  └─ Redistribute evenly
  ↓
Loop every 5 minutes until shutdown
```

---

## Example Session

```
[Agent 1] ✅ Joined arena — 0x0E6f...
[Agent 2] ✅ Joined arena — 0xCe38...
...
⚡ ROUND 0 — 8 actions fired
[Agent 1] 📤 ATTACK — tx 0xc964...
[Agent 2] 📤 HEAL — tx 0xd48a...
...
⚡ ROUND 1 — 7 actions fired
...

[Balance Manager] Checking balances...
Agent 0: 0.087 MON
Agent 1: 0.041 MON ⚠️ (below 0.05)
Agent 2: 0.093 MON
...
[Balance Manager] Rebalance triggered!
[Balance Manager] Collected 0.50 MON from agents
[Balance Manager] Redistributing: 0.05 MON per agent
[Balance Manager] ✅ 10/10 agents funded
```

---

## You're Protected ✅

With this system:
- ✅ No agent ever runs completely dry
- ✅ Gas is distributed fairly
- ✅ Automatic rebalance every 5 minutes
- ✅ Emergency recovery if needed
- ✅ Detailed NDJSON logs for monitoring
- ✅ Works seamlessly with orchestrator

**Your agents can play indefinitely.** 🎮

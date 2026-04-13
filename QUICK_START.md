# Parallel Arena — Quick Start (Local Testing)

**Get the MVP running locally in 5 minutes to test before deployment.**

---

## Step 1: Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

Opens at `http://localhost:3000`

---

## Step 2: In Another Terminal — Start Orchestrator

```bash
# Make sure .env is set with:
# - PRIVATE_KEY (master account)
# - AGENT_KEY_0, AGENT_KEY_1, etc. (bot accounts)
# - RELAYER_PRIVATE_KEY (relay signer)
# - CONTRACT_ADDRESS (your deployed game)

npm run arena
```

This spawns:
- ⚔️ Agents (auto-join + submit actions)
- ⏱️ Auto-Resolver (resolves rounds every 30s)
- 🔄 Auto-Reset (resets game when ended)

---

## Step 3: Test in Browser

### Connect Wallet
1. Visit `http://localhost:3000`
2. Click "CONNECT WALLET"
3. Select your wallet (MetaMask/Ledger/etc)
4. Approve connection

### Join Game
1. Click "JOIN & AUTHORIZE"
2. **No popup** = session key auto-authorized ✅
3. You join, balance shown

### Submit Action
1. Click **ATTACK** / **HEAL** / **DEFEND**
2. **No wallet popup** = silent execution ✅
3. See status bar: "⟳ Submitting..." → "⏳ Pending..." → "✓ Confirmed"
4. Watch **visual effects**:
   - ATTACK → 🔥 fire + 💥 impact
   - HEAL → ✨ sparkle + 💚 hearts
   - DEFEND → 🛡️ shield + cyan glow

### Verify Effects
- Ambient particles scroll in background (cyberpunk grid)
- Fire effect plays at epic duration (1.2-1.6s, no jank)
- Damage numbers float upward

### Check Leaderboard
- Click "LEADERBOARD" → see all-time stats
- Wins, kills, games played by address
- Top 3 have medals 🥇🥈🥉

### Game Auto-Reset
- Wait 30s for round to deadline
- Auto-resolver triggers round resolution (logs in orchestrator)
- Game ends (modal shows)
- Game auto-resets (new round starts)
- No admin action needed ✅

---

## Verify Session Keys Working

**Open browser devtools (F12):**

1. **Application → Local Storage**
   - Should see: `session_key_enc_0x...` (encrypted)
   - Should NOT see: `session_key_0x...` (plaintext)

2. **Console → Type:**
   ```javascript
   fetch('/api/time').then(r => r.json()).then(d => console.log(d))
   // Should print: { unix: 1712973600 }
   ```

3. **Console → Type:**
   ```javascript
   fetch('/api/health').then(r => r.json()).then(d => console.log(d))
   // Should print: { status: 'ok', rpcs: [...], ts: ... }
   ```

---

## Verify No Wallet Popups

**Session keys working if:**
- ✅ Click ATTACK → **no wallet popup**
- ✅ Click HEAL → **no wallet popup**
- ✅ Click DEFEND → **no wallet popup**
- ✅ Status bar shows tx progress (no popup)

**If wallet still pops up:**
- Check console for errors
- Check localStorage: is key encrypted?
- Try clearing localStorage + reload

---

## Verify Visual Effects

**Fire effect (ATTACK):**
- 🔥 projectile flies across screen
- 💥 explosion at impact
- -20 damage number floats up
- Screen flashes red
- Duration: ~1.2s

**Heal effect:**
- ✨ sparkle burst
- 💚💚💚 hearts float upward
- +15 healing number
- Green glow aura
- Duration: ~1.4s

**Defend effect:**
- 🛡️ shield icon
- Neon cyan shield glow (concentric rings)
- Particles radiate outward
- Duration: ~1.5s

**Ambient:**
- Scrolling cyan grid in background
- Floating particles drift upward continuously
- No lag, smooth 60fps

---

## Verify Auto-Reset

**In orchestrator terminal logs:**

```
[AutoReset] Game ended (phase=2) — calling resetGame()
[AutoReset] ✅ Game reset in block 1234567
```

Game automatically restarts without admin action.

---

## Troubleshooting

### "Wallet popup still shows on action"
```
1. Clear localStorage: DevTools → Application → Local Storage → Delete all
2. Reload page
3. Reconnect wallet
4. Try action again
```

If still pops up:
- Check browser console for errors
- Verify `useSessionKey.ts` has `setIsAuthorized(true)` in the load effect
- Check that sessionKey is created (should have `walletClient`)

### "Auto-reset not triggering"
```
1. Check orchestrator logs for autoReset daemon
2. Verify RESET_KEY has gas (> 0.01 MON)
3. Check CONTRACT_ADDRESS is correct
4. Manually call: cast send $CONTRACT_ADDRESS "resetGame()" --private-key $RESET_KEY
```

### "Visual effects not showing"
```
1. Check browser console for JS errors
2. Verify Framer Motion is imported
3. Check that Arena.tsx has ParticleSystem component
4. Try different action (might be timing issue)
```

### "Agents not joining"
```
1. Check orchestrator logs: `[Agents] Started combatants`
2. Verify AGENT_KEY_0, AGENT_KEY_1 are set in .env
3. Check agent balances: `npm run fund`
4. Restart orchestrator: `npm run arena`
```

---

## Performance Checklist

- [ ] No wallet popups ✅
- [ ] Effects play at 60fps (no stutter)
- [ ] RPC fallback works (try killing primary RPC)
- [ ] Auto-reset triggers on schedule
- [ ] No TypeScript errors: `npm run build` passes
- [ ] Session keys encrypted in localStorage
- [ ] Tx status shows progression (Submitting → Pending → Confirmed)

---

## Next: Deployment

Once local testing passes, follow `DEPLOYMENT.md` to go live:
1. Push to GitHub
2. Deploy frontend to Vercel (5 min)
3. Deploy orchestrator to VPS (15 min)
4. Visit `yourgame.vercel.app` 🚀

---

## Useful Commands

```bash
# View orchestrator logs
journalctl -u parallel-arena -f              # (after systemd setup)
# or during npm run arena: tail the output

# Check relayer balance
cast balance $RELAYER_ADDRESS --rpc-url $MONAD_RPC

# Fund agents manually
npm run fund

# Check contract game state
cast call $CONTRACT_ADDRESS "getFullGameState()" --rpc-url $MONAD_RPC

# Look at your session key (encrypted)
node -e "console.log(localStorage.getItem('session_key_enc_0x...'))"
```

---

**Ready? Start with `npm run dev` then `npm run arena` in another terminal!** 🎮

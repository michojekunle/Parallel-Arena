# Parallel Arena — MVP Deployment Guide

Deploy your game in under 30 minutes for **free frontend + $5/mo orchestrator**.

---

## Part 1: Frontend (Vercel) — 5 minutes

### 1.1 Push to GitHub

```bash
cd /Users/mac/prog/hacks/2026/Parallel\ Arena
git add .
git commit -m "feat: session keys auto-enable, visual effects, auto-reset daemon"
git push origin main
```

### 1.2 Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or go to **[vercel.com](https://vercel.com)**, connect GitHub, import repo, deploy.

**Environment variables in Vercel dashboard:**
```
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
RELAYER_PRIVATE_KEY=(your relayer key)
CONTRACT_ADDRESS=(your contract address)
```

Result: **Your game is live at `yourgame.vercel.app`** ✅

---

## Part 2: Orchestrator VPS (DigitalOcean/Hetzner) — 15 minutes

### 2.1 Create VPS

**DigitalOcean:**
1. Sign up → Create droplet ($5/mo)
2. Choose: Ubuntu 22.04 LTS, smallest size, region closest to you
3. SSH key auth recommended

**Hetzner:**
- €2.49/mo, same steps

### 2.2 SSH into your VPS

```bash
ssh root@<your-vps-ip>
```

### 2.3 Install Node.js + Git

```bash
apt update && apt install -y nodejs npm git
node --version  # verify
```

### 2.4 Clone repo on VPS

```bash
cd /root
git clone https://github.com/yourusername/parallel-arena.git
cd parallel-arena
npm install
```

### 2.5 Setup `.env` on VPS

```bash
cat > .env << 'EOF'
PRIVATE_KEY=your_master_key_here
RELAYER_PRIVATE_KEY=your_relayer_key_here
RESET_KEY=your_master_key_here
RESOLVER_KEY=your_agent_key_0_or_separate_key
AGENT_KEY_0=agent_0_key
AGENT_KEY_1=agent_1_key
AGENT_KEY_2=agent_2_key
CONTRACT_ADDRESS=your_contract_address
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
EOF
```

### 2.6 Test scripts locally

```bash
node scripts/orchestrate.js  # should start agents + resolver
# Wait 10s, then Ctrl+C to stop
```

### 2.7 Setup systemd auto-start

```bash
cat > /etc/systemd/system/parallel-arena.service << 'EOF'
[Unit]
Description=Parallel Arena Orchestrator
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/parallel-arena
ExecStart=/usr/bin/node scripts/orchestrate.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### 2.8 Enable + start

```bash
systemctl daemon-reload
systemctl enable parallel-arena
systemctl start parallel-arena
systemctl status parallel-arena  # should be "active (running)"
```

### 2.9 View logs

```bash
journalctl -u parallel-arena -f  # tail logs in real-time
```

---

## Part 3: Domain + HTTPS (optional, 5 minutes)

### 3.1 Point domain to Vercel

In your domain registrar (GoDaddy, Namecheap, etc):
- Add CNAME: `yourdomain.com` → `cname.vercel.sh`

Vercel auto-provisions HTTPS.

### 3.2 Custom domain on Vercel dashboard

Settings → Domains → Add `yourdomain.com`

---

## Part 4: Verification Checklist

- [ ] Frontend loads at `yourgame.vercel.app`
- [ ] Connect wallet → session key auto-authorizes (no popup)
- [ ] Play a game → visual effects work (fire 🔥, heal 💚, shield 🛡️)
- [ ] Game auto-resets after completion
- [ ] Leaderboard updates with new games
- [ ] VPS logs show agents joining and resolving

Check VPS logs:
```bash
journalctl -u parallel-arena -n 50  # last 50 lines
```

---

## Part 5: Monitoring (Optional)

### Keep VPS alive in SSH session (tmux)

```bash
# On VPS
apt install -y tmux
tmux new-session -d -s arena "cd /root/parallel-arena && node scripts/orchestrate.js"
tmux ls  # see sessions
tmux attach -t arena  # view logs
```

### Get alerts when relayer runs low on gas

Update VPS `.env`:
```bash
RELAYER_ADDRESS=your_relayer_address
```

Orchestrator now logs gas warnings to stdout.

---

## Part 6: Troubleshooting

### "Wallet popups on every action"

→ Session keys not auto-authorizing. Verify:
```bash
localStorage  # in browser devtools
# Should see "session_key_enc_0x..." (encrypted), NOT "session_key_0x..." (plaintext)
```

If plaintext, clear localStorage and reload.

### "No agents joining"

Check VPS logs:
```bash
journalctl -u parallel-arena -n 20
```

Likely: missing `AGENT_KEY_n` variables. Add them to `.env` and restart:
```bash
systemctl restart parallel-arena
```

### "Games not resetting"

Auto-reset script needs `resetGame()` permission. Ensure `RESET_KEY` is funded with gas:
```bash
# On VPS, check balance of RESET_KEY:
node -e "console.log(require('ethers').utils.getAddress('0x...'))"
```

Refund it if dry.

### "Relayer gas too low"

Manually top up from master account:
```bash
node scripts/fundAgents.js  # also funds relayer
```

---

## Cost Breakdown (Monthly)

| Component | Cost | Provider |
|-----------|------|----------|
| Frontend | **Free** | Vercel (free tier) |
| Orchestrator VPS | **$5** | DigitalOcean or €2.49 (Hetzner) |
| Gas (txs) | **Variable** | Monad testnet (free) |
| Domain | **~$10** | GoDaddy, etc. |
| **TOTAL** | **~$15/mo** | |

---

## Next Steps

1. **Visual polish**: Add more effects in `frontend/src/components/AttackEffect.tsx`, `HealEffect.tsx`, `DefendEffect.tsx`
2. **Player tracking**: Deploy The Graph indexer for better leaderboard queries
3. **Mobile**: Test on phones; consider adding "Add to Home Screen" PWA manifest
4. **Mainnet**: Redeploy contract on Monad mainnet, swap testnet RPC URLs

---

## Monitoring Dashboard (DIY)

Create a simple health check endpoint on your VPS:

```bash
# Add to cron
*/5 * * * * curl http://yourgame.vercel.app/api/health >> /var/log/health.log
```

Or use free services like **UptimeRobot** to ping your frontend every 5 minutes.

---

**You're live! 🚀 Share your `yourgame.vercel.app` link.**

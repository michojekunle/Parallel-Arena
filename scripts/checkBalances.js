import { createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
};

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(rpcUrl)
});

async function main() {
  const numAgents = parseInt(process.env.NUM_AGENTS || '10');
  const deployerKey = process.env.PRIVATE_KEY;
  
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      PARALLEL ARENA — AGENT BALANCES                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  if (deployerKey) {
    const deployerAccount = privateKeyToAccount(deployerKey.split('#')[0].trim());
    const balance = await publicClient.getBalance({ address: deployerAccount.address });
    console.log(`[DEPLOYER] ${deployerAccount.address} | ${formatEther(balance)} MON`);
    console.log('────────────────────────────────────────────────────────────────────────────────');
  }

  const balancePromises = [];
  for (let i = 0; i < numAgents; i++) {
    const rawEnv = process.env[`AGENT_KEY_${i}`];
    if (!rawEnv) continue;

    const agentKey = rawEnv.split('#')[0].trim();
    if (!agentKey) continue;

    const agentAccount = privateKeyToAccount(agentKey);
    balancePromises.push(
      publicClient.getBalance({ address: agentAccount.address })
        .then(balance => ({
          id: i,
          address: agentAccount.address,
          balance: formatEther(balance)
        }))
        .catch(err => ({
          id: i,
          address: agentAccount.address,
          balance: 'Error: ' + err.message.slice(0, 20)
        }))
    );
  }

  const results = await Promise.all(balancePromises);
  
  results.forEach(res => {
    const status = parseFloat(res.balance) < 0.1 ? '⚠️ LOW' : '✅ OK';
    console.log(`[AGENT ${res.id.toString().padEnd(2)}] ${res.address} | ${res.balance.padStart(10)} MON | ${status}`);
  });

  console.log('\n────────────────────────────────────────────────────────────────────────────────');
  console.log(`Total Agents Checked: ${results.length}`);
}

main().catch(console.error);

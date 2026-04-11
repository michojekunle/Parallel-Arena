import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const privateKeyRaw = process.env.PRIVATE_KEY;
if (!privateKeyRaw) {
  console.error("Missing PRIVATE_KEY in .env");
  process.exit(1);
}
// Strip potential comments
const privateKey = privateKeyRaw.split('#')[0].trim();

const account = privateKeyToAccount(privateKey);
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

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(rpcUrl)
});

async function main() {
  const balance = await publicClient.getBalance({ address: account.address });
  const humanBalance = Number(balance) / 1e18;
  console.log(`Deployer address: ${account.address}`);
  console.log(`Deployer balance: ${humanBalance} MON`);

  if (humanBalance === 0) {
    console.error("Deployer has no MON. Please fund the deployer address first.");
    process.exit(1);
  }

  const numAgents = parseInt(process.env.NUM_AGENTS || '10');
  
  let amountStr = '0.5';
  if (humanBalance < 20.0) {
    amountStr = '0.5'; // Give them the bare minimum to afford high gas fees
  }
  const amountToFund = parseEther(amountStr);

  const resolverAmountStr = '10.0';
  const resolverAmountToFund = parseEther(resolverAmountStr);

  console.log(`Funding ${numAgents} agents with ${amountStr} MON each...`);

  let successCount = 0;
  for (let i = 0; i < numAgents; i++) {
    const rawEnv = process.env[`AGENT_KEY_${i}`];
    if (!rawEnv) {
      console.warn(`Missing AGENT_KEY_${i} in .env`);
      continue;
    }

    const agentKey = rawEnv.split('#')[0].trim();
    if (!agentKey) continue;

    const agentAccount = privateKeyToAccount(agentKey);
    console.log(`\nFunding Agent ${i} (${agentAccount.address})...`);

    try {
      const exactAmount = i === 0 ? resolverAmountToFund : amountToFund;
      const exactAmountStr = i === 0 ? resolverAmountStr : amountStr;
      console.log(`  Sending ${exactAmountStr} MON...`);
      const hash = await walletClient.sendTransaction({
        to: agentAccount.address,
        value: exactAmount
      });
      console.log(`  Tx hash: ${hash}`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Confirmed in block ${receipt.blockNumber}`);
      successCount++;
    } catch (e) {
      console.error(`  Error funding agent ${i}:`, e.message);
    }
  }

  console.log(`\nFinished funding ${successCount}/${numAgents} agents.`);
}

main().catch(console.error);

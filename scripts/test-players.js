import { createPublicClient, http, parseAbi } from 'viem';
import { monadTestnet } from './lib/chain.js';
const ABI = parseAbi([
  'struct Player { address addr; uint256 health; uint256 attack; uint256 defense; uint8 status; uint256 roundsPlayed; uint256 kills; }',
  'function getAllPlayers() external view returns (Player[])'
]);
const client = createPublicClient({ chain: monadTestnet, transport: http('https://testnet-rpc.monad.xyz') });
client.readContract({
  address: process.env.CONTRACT_ADDRESS || '0x4b6332b8dbf66b68aedb3b129610abb183d113cd',
  abi: ABI,
  functionName: 'getAllPlayers'
}).then(console.log).catch(console.error);

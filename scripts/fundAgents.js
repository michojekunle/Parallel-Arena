#!/usr/bin/env node
// Generates N agent wallets and prints addresses + keys for .env
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const NUM = parseInt(process.argv[2] || '10')
console.log('# Copy these into your .env file:\n')
for (let i = 0; i < NUM; i++) {
  const key = generatePrivateKey()
  const account = privateKeyToAccount(key)
  console.log(`AGENT_KEY_${i}=${key}   # ${account.address}`)
}
console.log(`\n# Then fund each address with testnet MON`)
console.log(`# Faucet: https://faucet.monad.xyz`)

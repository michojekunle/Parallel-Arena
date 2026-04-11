# Parallel Arena

Parallel Arena is a real-time, on-chain multiplayer battle game built on the **Monad Testnet**. It demonstrates the power of parallel execution by allowing multiple players to submit actions simultaneously, which are then converged and resolved in a single block.

## 🚀 Key Features

- **Parallel Execution**: Actions from all players arrive simultaneously and are processed efficiently.
- **Deterministic Resolution**: 10+ actions become 1 ground truth per round.
- **Vercel-inspired UI**: A clean, high-contrast, minimalist design for maximum clarity.
- **AI Agent Integration**: Autonomous nodes that participate in the arena to stress-test parallel capacity.

## 🏗 Project Structure

- `contracts/`: Solidity smart contracts (Foundry based).
- `frontend/`: Next.js web application with Wagmi and RainbowKit.
- `scripts/`: Operational scripts for AI agents and automated round resolution.

## 🚦 Getting Started

### Prerequisites

- Node.js (v18+)
- Foundry (for contract development)
- A MetaMask or similar wallet connected to Monad Testnet.

### Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   # In root
   npm install
   # In frontend
   cd frontend && npm install
   ```

3. Setup environment variables:
   - Copy `frontend/.env.local.example` to `frontend/.env.local` and add your contract address.
   - Copy `scripts/.env.example` to `scripts/.env` and add your private keys.

### Development

Run the frontend locally:
```bash
cd frontend
npm run dev
```

Run the AI agents:
```bash
cd scripts
node agents.js
```

## 📜 License

MIT

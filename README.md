# AMM V2 Protocol

A complete Automated Market Maker (AMM) protocol implementation similar to Uniswap V2, built with Solidity and Hardhat.

## 📋 Overview

This AMM V2 protocol consists of three main contracts:

- **Factory**: Creates and manages liquidity pools (Pair contracts)
- **Pair**: Individual liquidity pools that handle swaps and liquidity provision
- **Router**: User-facing interface for swaps and liquidity operations

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your:
   - Private key
   - RPC URLs (Infura/Alchemy)
   - Etherscan API key (for verification)

3. **Compile contracts**
   ```bash
   npm run compile
   ```

4. **Run tests**
   ```bash
   npm run test
   ```

5. **Run tests with gas reporting**
   ```bash
   npm run test:gas
   ```

6. **Run test coverage**
   ```bash
   npm run test:coverage
   ```

## 📁 Project Structure

```
AMM_v2/
├── contracts/
│   ├── Factory.sol      # Factory contract for creating pairs
│   ├── Pair.sol         # Liquidity pool contract
│   ├── Router.sol       # Router for swaps and liquidity
│   └── tokens/
│       ├── TokenA.sol   # Mock token A
│       └── TokenB.sol   # Mock token B
├── scripts/
│   ├── deploy.js        # Main deployment script
│   └── interact.js      # Interaction test script
├── test/
│   ├── Factory.test.js  # Factory tests
│   ├── Pair.test.js     # Pair tests
│   └── Router.test.js   # Router tests
├── hardhat.config.js    # Hardhat configuration
├── .env.example         # Environment variables template
└── package.json
```

## 🔧 Available Commands

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Run tests with gas reporter
npm run test:gas

# Run test coverage
npm run test:coverage

# Deploy to local Hardhat network
npm run deploy:local

# Deploy to Sepolia testnet
npm run deploy:sepolia

# Start local Hardhat node
npm run node

# Clean build artifacts
npm run clean
```

## 📖 Contract Details

### Factory Contract

The Factory contract is responsible for:
- Creating new Pair contracts
- Tracking all created pairs
- Managing the router address
- Ownership management

**Key Functions:**
- `createPair(tokenA, tokenB)`: Creates a new liquidity pool
- `getPair(tokenA, tokenB)`: Returns the pair address for two tokens
- `allPairsLength()`: Returns total number of pairs
- `setRouter(router)`: Sets the router address (owner only)

### Pair Contract

The Pair contract represents a single liquidity pool:
- Manages liquidity provision (mint/burn LP tokens)
- Handles token swaps
- Maintains constant product formula (x * y = k)
- Charges 3% swap fee

**Key Functions:**
- `mint(to)`: Adds liquidity and mints LP tokens
- `burn(to)`: Removes liquidity and burns LP tokens
- `swap(amount0Out, amount1Out, to)`: Executes a token swap
- `getAmountOut(amountIn, reserveIn, reserveOut)`: Calculates output amount

### Router Contract

The Router provides a user-friendly interface:
- Swap tokens (exact input/output)
- Add/remove liquidity
- One-token liquidity removal

**Key Functions:**
- `swapExactTokensForTokens()`: Swap exact input for minimum output
- `swapTokensForExactTokens()`: Swap maximum input for exact output
- `addLiquidity()`: Add liquidity to a pair
- `removeLiquidity()`: Remove liquidity from a pair
- `removeLiquidityOneToken()`: Remove liquidity for single token

## 🧪 Testing

The test suite covers:

### Factory Tests
- Pair creation
- Event emissions
- Access control
- Pair tracking

### Pair Tests
- Liquidity provision (mint/burn)
- Token swaps
- LP token transfers
- Fee calculations
- K constant maintenance

### Router Tests
- Swap operations
- Liquidity management
- Slippage protection
- Access control

## 🌐 Network Deployment

### Local Deployment

```bash
# Start local node
npm run node

# In another terminal, deploy
npm run deploy:local
```

### Sepolia Testnet

```bash
npm run deploy:sepolia
```

### Mainnet

```bash
npx hardhat run scripts/deploy.js --network mainnet
```

## 📊 Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Router    │ ─────► User Interface
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Factory   │ ─────► Creates Pairs
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Pair     │ ─────► Liquidity Pool
│  (TokenA/   │
│   TokenB)   │
└─────────────┘
```

## 🔐 Security Considerations

1. **Reentrancy Protection**: All state-changing functions use OpenZeppelin's ReentrancyGuard
2. **Slippage Protection**: Router functions include minimum amount parameters
3. **Access Control**: Owner-only functions for critical operations
4. **Minimum Liquidity**: First liquidity provider's minimum LP tokens are locked

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please ensure all tests pass before submitting changes.

## 📞 Support

For issues or questions, please open an issue on GitHub.

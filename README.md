# Brass Hands

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-white?logo=vercel)](https://brass-hands.vercel.app)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Powered by Relay](https://img.shields.io/badge/Powered%20by-Relay-8b5cf6)](https://relay.link)

A suite of DeFi wallet security tools:
1. **Dust Sweeper** - Batch swap multiple dust tokens into ETH/USDC/DAI
2. **Revoke Approvals** - View and revoke token approvals to protect your wallet

## Features

### Dust Sweeper (`/`)
- **Multi-token batch swaps** in a single wallet call (EIP-5792)
- **Same-chain swap routes** with Relay Protocol solver
- **Token holdings discovery** via Alchemy deep indexing
- **Route availability checks** before quoting
- **Automatic approval skipping** when allowance is already sufficient
- **Price impact filtering** for low-liquidity tokens
- **Transfer fee token detection** - Blocks fee-on-transfer tokens that may fail
- **The 98% Rule** - Uses 2% buffer for swap amounts to handle price fluctuations

### Revoke Approvals (`/revoke`)
- **Scan all approvals** across 6 supported chains via Covalent GoldRush API
- **Value-at-risk analysis** - See how much you could lose if a spender is compromised
- **Risk level indicators** - LOW RISK, CONSIDER REVOKING, HIGH RISK labels
- **Batch revoke** - Revoke multiple approvals in one transaction (EIP-5792)
- **Filter by risk** - Quickly find unlimited or high-risk approvals
- **NFT approvals** - View and revoke NFT collection approvals (setApprovalForAll)
- **Partial revoke** - Reduce allowance instead of fully revoking

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER WALLET                                 │
│                (Ambire / OKX / Coinbase / MetaMask)                     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  │ Connect (Reown AppKit)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BRASS HANDS APP                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐   │
│  │  Token Scanner   │  │  Strategy Engine │  │   Execution Core    │   │
│  │  (Alchemy API)   │  │  (Batch/Legacy)  │  │   (Wagmi/Viem)      │   │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬──────────┘   │
│           │                     │                       │               │
│           │ Holdings            │ Decision              │ Sign Tx       │
│           ▼                     ▼                       ▼               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                RELAY PROTOCOL SOLVER                              │  │
│  │         /quote → /execute/swap → /intents/status                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                      │
│                                  ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              User Interface (Svelte 5 + Tailwind)                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  │ Submit Transaction
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             BLOCKCHAIN                                   │
│        (Ethereum / Base / Arbitrum / Optimism / Polygon / BNB)          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Supported Chains

| Chain | Chain ID | Native Token | Status |
|-------|----------|--------------|--------|
| Ethereum | 1 | ETH | ✅ Active |
| Base | 8453 | ETH | ✅ Active |
| Arbitrum | 42161 | ETH | ✅ Active |
| Optimism | 10 | ETH | ✅ Active |
| Polygon | 137 | MATIC | ✅ Active |
| BNB Chain | 56 | BNB | ✅ Active |

**Output Tokens Supported:**
- ETH (Native token)
- USDC
- DAI

## Wallet Requirements

This app uses **EIP-5792 (Wallet Call API)** for batching when supported. Wallets that do not support `wallet_sendCalls` fall back to sequential transactions.

| Wallet | Batch Support | Experience |
|--------|---------------|------------|
| **Ambire Wallet** | ✅ Full | Native batching, best for gas savings |
| **OKX Wallet** | ✅ Full | Excellent EIP-5792 integration |
| **Coinbase Wallet** | ✅ Full | Smart Wallet support |
| **MetaMask** | ❌ Legacy | Sequential transactions (approve + swap per token) |
| **Rainbow** | ❌ Legacy | Sequential transactions |

> 💡 **Recommended:** For the true batch transaction experience, use **OKX Wallet** or **Ambire Wallet** - they fully support EIP-5792 batch calls, allowing all swaps and approvals to execute in a single transaction.

## Tech Stack

| Component | Technology | Description |
|-----------|------------|-------------|
| **Framework** | SvelteKit + Svelte 5 | Blazing fast reactive UI with Runes |
| **Web3 Core** | Wagmi 2.x + Viem 2.x | Type-safe blockchain interactions |
| **Wallet Connect** | Reown AppKit 1.8 | Seamless multichain wallet connection |
| **Swap Solver** | Relay Protocol | Intent-based swap aggregation |
| **Token Discovery** | Alchemy SDK | Deep token indexing and balance verification |
| **Styling** | Tailwind CSS 3.x | Neo-Brutalist industrial design |
| **Build Tool** | Vite 6 | Lightning fast HMR and builds |
| **Language** | TypeScript 5 | Full type safety |

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_PROJECT_ID=your_reown_project_id
VITE_ALCHEMY_KEY=your_alchemy_api_key
VITE_RELAY_API_KEY=your_relay_api_key        # Optional, increases rate limits
VITE_COVALENT_API_KEY=your_covalent_api_key  # Required for Revoke feature
```

| Variable | Scope | Description | Required |
|----------|-------|-------------|----------|
| `VITE_PROJECT_ID` | Client | Reown Project ID from [cloud.reown.com](https://cloud.reown.com) | **Yes** |
| `VITE_ALCHEMY_KEY` | Client | Alchemy API key for token discovery | **Yes** |
| `VITE_RELAY_API_KEY` | Client | Relay API key for higher rate limits | No |
| `VITE_COVALENT_API_KEY` | Client | Covalent GoldRush API key from [goldrush.dev](https://goldrush.dev) | **Yes** (for Revoke) |

## How It Works

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Connect │────▶│  Scan   │────▶│ Select  │────▶│  Quote  │────▶│ Execute │
│ Wallet  │     │ Tokens  │     │  Dust   │     │ Routes  │     │  Batch  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
```

### Step-by-Step Flow

1. **Wallet Connection**
   - Reown AppKit connects the wallet via WalletConnect
   - Strategy detection: checks for EIP-5792 batch support

2. **Token Discovery**
   - Alchemy API fetches all token holdings
   - Filters for dust tokens ($0.01 - $100 USD value)
   - Excludes zero balances and known scam tokens

3. **Route Availability**
   - Relay Protocol `/quote` API checks if swap route exists
   - Tokens without routes marked as "No Liquidity"

4. **Quote Creation**
   - For each selected token: `POST /quote` to Relay
   - Extracts transaction data from `steps[].items[].data`
   - Calculates price impact and gas estimates

5. **Approval Filtering**
   - Checks current allowances via `allowance()` calls
   - Skips approval if allowance already sufficient

6. **Execution**
   - **Batch Mode (EIP-5792):** All approvals + swaps sent via `wallet_sendCalls`
   - **Legacy Mode:** Sequential `approve()` → `swap()` for each token
   - Rate limiting protection with delays between operations

7. **Status Tracking**
   - Polls Relay `/intents/status` endpoint
   - UI shows real-time progress

## API Integrations

| Service | Endpoints | Purpose |
|---------|-----------|---------|
| **Relay Protocol** | `/quote`, `/intents/status/v3` | Quotes, execution data, status |
| **Alchemy** | Token API, JSON-RPC | Token discovery, balance verification |
| **Covalent GoldRush** | `/approvals`, `/nft/approvals` | Token & NFT approval scanning |
| **Reown** | WalletConnect | Wallet connection and signing |

## Project Structure

```
brass-hands/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Header.svelte          # Navigation header with tool tabs
│   │   │   ├── WalletProvider.svelte  # Wallet context
│   │   │   └── ui/
│   │   │       ├── TokenRow.svelte    # Token list item
│   │   │       ├── SwapPreview.svelte # Quote summary
│   │   │       ├── StatusModal.svelte # Execution progress
│   │   │       └── NoLiquidityModal.svelte
│   │   ├── config/
│   │   │   ├── chains.ts              # Supported networks
│   │   │   ├── constants.ts           # Token addresses, API keys
│   │   │   └── wagmi.ts               # Wagmi + Reown config
│   │   ├── services/
│   │   │   ├── tokenService.ts        # Token discovery (Alchemy)
│   │   │   ├── solverService.ts       # Relay API integration
│   │   │   ├── executionService.ts    # Batch/Legacy execution
│   │   │   ├── approvalService.ts     # Allowance checks
│   │   │   ├── approvalScanService.ts # Covalent API for approvals
│   │   │   ├── revokeService.ts       # Revoke transaction execution
│   │   │   └── gasService.ts          # Gas estimation
│   │   ├── stores/
│   │   │   ├── dust.svelte.ts         # Dust sweeper state
│   │   │   ├── wallet.svelte.ts       # Wallet state
│   │   │   └── revoke.svelte.ts       # Revoke tool state
│   │   ├── types/
│   │   │   ├── index.ts               # Core TypeScript interfaces
│   │   │   └── revoke.ts              # Revoke-specific types
│   │   └── utils/
│   │       └── format.ts              # Formatting helpers
│   ├── routes/
│   │   ├── +layout.svelte             # App layout
│   │   ├── +page.svelte               # Dust Sweeper page
│   │   └── revoke/
│   │       └── +page.svelte           # Revoke Approvals page
│   ├── app.css                        # Global styles
│   └── app.html                       # HTML template
├── static/
│   └── favicon.svg
├── .env                               # Environment variables
├── package.json
├── svelte.config.js
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Local Development

```bash
# Clone the repository
git clone https://github.com/xabzxbt/brass-hands.git
cd brass-hands

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

## Vercel Deployment

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com)
3. Set environment variables:
   - `VITE_PROJECT_ID`
   - `VITE_ALCHEMY_KEY`
   - `VITE_RELAY_API_KEY` (optional)
4. Deploy

Build settings are auto-detected from `svelte.config.js`.

## FAQ

### Is this app secure?

**Yes.** Brass Hands is a frontend-only interface. All core swap functionality is handled by [Relay Protocol](https://relay.link):

| Component | Handled By | Notes |
|-----------|------------|-------|
| Token custody | **Relay Protocol** | We never hold user funds |
| Swap execution | **Relay Protocol** | Audited smart contracts |
| Price discovery | **Relay Protocol** | Real-time quotes from DEX aggregators |
| Transaction signing | **User's Wallet** | We never access private keys |

### What does Brass Hands actually do?

Brass Hands is a **UI layer** that:
- Fetches your token holdings (read-only)
- Helps you select dust tokens and amounts
- Requests quotes from Relay Protocol
- Batches multiple swap calls into one wallet transaction (EIP-5792)
- Displays transaction status

### Can you steal my funds?

**No.** This frontend:
- Never requests your private keys
- Never has custody of your tokens
- Only submits transactions YOU approve in your wallet
- Is fully open source for verification

### What is the 98% Rule?

We swap 98% of your token balance, leaving a 2% buffer. This prevents transaction failures caused by:
- Fee-on-transfer (tax) tokens
- Price slippage during execution
- Rounding errors

### Why do some tokens say "No Liquidity"?

Some tokens cannot be traded because:
- No liquidity pool exists on DEXes
- The token contract is broken or malicious
- Relay Protocol doesn't support that token

Brass Hands identifies these early so you don't waste gas.

### Which wallets work best?

For the full batch experience (one signature for all swaps), use:
- **Ambire Wallet** - Best overall experience
- **OKX Wallet** - Excellent EIP-5792 support
- **Coinbase Wallet** - Smart wallet batching

MetaMask and other standard wallets work in "Legacy Mode" with sequential transactions.

## License

MIT License - Open source and free to use.

---

**Built with 🧡 by [xabzxbt](https://github.com/xabzxbt)**

# CCA Minimal - Uniswap Continuous Clearing Auctions

A minimal frontend interface for creating and participating in Uniswap v4 Continuous Clearing Auctions (CCA).

**Now updated to work with Uniswap's official CCA Factory contract!**

## Features

✨ **Core Functionality**
- Create auctions for token launches using Uniswap's factory contract
- Deploy new auction contracts permissionlessly
- Participate in active auctions by placing bids
- View auction details and current clearing prices
- Claim tokens after auction ends

🔧 **Tech Stack**
- Next.js 15 (React 19)
- TypeScript
- Tailwind CSS
- wagmi + viem (Web3)
- RainbowKit (Wallet connection)

🌐 **Supported Networks**
- Ethereum Mainnet
- Sepolia Testnet (recommended for testing)
- Base
- Base Sepolia

## Getting Started

### Prerequisites

- Node.js 18+ installed
- pnpm (recommended) or npm
- A Web3 wallet (MetaMask, etc.)
- WalletConnect Project ID from [https://cloud.walletconnect.com](https://cloud.walletconnect.com)
- Sepolia ETH for testing (get from [Sepolia faucet](https://sepoliafaucet.com/))

### Installation

1. **Clone and install dependencies:**

```bash
cd cca-minimal
pnpm install
```

2. **Configure environment:**

```bash
cp .env.example .env
```

Edit `.env` and add your WalletConnect Project ID:
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

3. **Update WalletConnect Project ID:**

Edit `lib/wagmi.ts` and replace `YOUR_PROJECT_ID` with your actual Project ID:

```typescript
export const config = getDefaultConfig({
  appName: 'CCA Minimal',
  projectId: 'your_actual_project_id_here', // ← Update this
  chains: [mainnet, sepolia, base, baseSepolia],
  ssr: true,
});
```

4. **Run the development server:**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How It Works

### Understanding the Architecture

This application uses Uniswap's **factory pattern** for CCA auctions:

1. **One Factory Contract** - `0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D` (same address on all networks)
2. **Many Auction Contracts** - Each auction gets its own dedicated contract deployed via CREATE2
3. **Permissionless Creation** - Anyone can create an auction through the factory

### Creating an Auction

1. Navigate to "Create Auction" page
2. Connect your wallet (switch to Sepolia network for testing)
3. Fill in auction parameters:
   - **Token Contract Address**: The ERC-20 token you want to sell
   - **Total Supply to Auction**: How many tokens to sell (in whole units)
   - **Floor Price**: Minimum price per token in ETH
   - **Auction Duration**: How long the auction runs (1-30 days)
   - **Required Currency Raised**: Minimum ETH to raise (optional, use 0 for no minimum)
4. Submit transaction to the factory contract
5. **Important**: You'll receive the deployed auction contract address - save this!
6. After deployment, approve the auction contract to transfer your tokens
7. The auction starts in ~2 minutes (after ~10 blocks)

### Participating in an Auction

1. Navigate to "Participate" page
2. Connect your wallet
3. Enter the **auction contract address** (not the factory address!)
4. View auction details:
   - Token being sold
   - Total supply available
   - Floor price
   - Current clearing price
   - Auction timeline
5. Place a bid:
   - Specify token amount you want to buy
   - Set your maximum price per token
   - Send ETH with your transaction
6. Track your bids
7. Claim tokens after the auction ends and claim block is reached

## Important Notes

### Factory vs Auction Contracts

- **Factory Contract**: `0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D`
  - Used ONLY to create new auctions
  - Same address on all networks

- **Auction Contracts**: `0x...` (unique per auction)
  - Each auction has its own contract
  - Used for bidding, claiming, and viewing auction data
  - Address provided when you create an auction

### Before Creating an Auction

- You need Sepolia ETH for gas fees
- Deploy your ERC-20 token contract first
- After creating the auction, approve the deployed auction contract to transfer your tokens
- The auction contract address will be shown in the success message
- Save the auction contract address - you'll need it to share with bidders

### When Bidding

- You need the specific auction contract address (get from auction creator)
- Your bid will only be filled if the clearing price is at or below your max price
- You can place multiple bids at different price levels
- Bids are non-withdrawable while in the clearing range
- All winning participants pay the same final clearing price
- Send enough ETH to cover: `tokenAmount * maxPricePerToken`

### Block Times and Timing

- **Sepolia**: ~12 second block time
- Auction start: Current block + 10 blocks (~2 minutes)
- Auction duration: Configurable in days (converted to blocks)
- Claim period: Starts 100 blocks after auction ends (~20 minutes)

## Project Structure

```
cca-minimal/
├── app/
│   ├── create/
│   │   └── page.tsx          # Create auction page (uses factory)
│   ├── auctions/
│   │   └── page.tsx          # Participate in auctions page
│   ├── layout.tsx            # Root layout with providers
│   ├── page.tsx              # Homepage
│   ├── providers.tsx         # Web3 providers setup
│   └── globals.css           # Global styles
├── lib/
│   ├── wagmi.ts              # Wagmi configuration
│   └── cca-abi.ts            # CCA Factory + Auction ABIs
├── package.json
└── README.md
```

## Contract Integration

This app integrates with two Uniswap CCA contracts:

### ContinuousClearingAuctionFactory
**Address**: `0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D` (all networks)

**Functions**:
- `initializeDistribution(token, amount, configData, salt)` - Deploy new auction
- `getAuctionAddress(...)` - Predict auction address before deployment

**Events**:
- `AuctionCreated(auction, token, amount, configData)` - Emitted when auction deployed

### ContinuousClearingAuction (Individual Auctions)

**Functions**:
- `submitBid(maxPrice, amount, owner, hookData)` - Place a bid
- `claimTokens(bidId)` - Claim tokens after auction
- `claimTokensBatch(owner, bidIds[])` - Claim multiple bids at once
- `exitBid(bidId)` - Exit a bid (if allowed)
- `checkpoint()` - Update clearing price
- `isGraduated()` - Check if minimum currency raised
- `currencyRaised()` - Total ETH raised
- `claimBlock()` - When claims become available

**Events**:
- `BidSubmitted(id, owner, price, amount)`
- `TokensClaimed(bidId, owner, tokensFilled)`
- `BidExited(bidId, owner, tokensFilled, currencyRefunded)`

## Testing on Sepolia

### Step-by-Step Testing Guide

1. **Get Sepolia ETH**
   - Visit [Sepolia Faucet](https://sepoliafaucet.com/)
   - Get test ETH sent to your wallet

2. **Deploy Your ERC20 Token**

   **Option A: Deploy via Remix IDE (Recommended)**

   1. Open [Remix Ethereum IDE](https://remix.ethereum.org)
   2. Create a new file called `SimpleERC20.sol`
   3. Copy the contract code from `contracts/SimpleERC20.sol` in this project
   4. Go to the "Solidity Compiler" tab (left sidebar)
   5. Select compiler version `0.8.20` or higher
   6. Click "Compile SimpleERC20.sol"
   7. Go to the "Deploy & Run Transactions" tab
   8. Set Environment to "Injected Provider - MetaMask"
   9. Make sure you're connected to Sepolia network in MetaMask
   10. Enter constructor parameters:
       - **name**: Your token name (e.g., "My Test Token")
       - **symbol**: Token symbol (e.g., "MTT")
       - **initialSupply**: Total supply (e.g., `1000000` for 1 million tokens)
   11. Click "Deploy" and confirm the transaction in MetaMask
   12. **Copy the deployed contract address** - you'll need this!

   **Option B: Use an existing Sepolia test token**
   - If you already have a token deployed, just use its address

3. **Create an Auction**
   - Go to Create Auction page
   - Switch to Sepolia network in your wallet
   - Enter your token address and parameters
   - Submit transaction
   - **Copy the auction contract address from the success message**

4. **Approve Token Transfer**
   - Call `approve(auctionAddress, amount)` on your token contract
   - Use Etherscan or Remix to interact with your token

5. **Place Test Bids**
   - Go to Participate page
   - Enter the auction contract address
   - Place bids at different price points
   - Watch the clearing price update

6. **Wait for Auction to End**
   - Monitor the auction end block
   - After auction ends, wait for claim block

7. **Claim Tokens**
   - Use the `claimTokens()` function
   - Receive your tokens based on final clearing price

## Customization

### Adding More Chains

Edit `lib/wagmi.ts` to add more chains:

```typescript
import { arbitrum, optimism, polygon } from 'wagmi/chains';

export const config = getDefaultConfig({
  // ...
  chains: [mainnet, sepolia, base, baseSepolia, arbitrum, optimism, polygon],
});
```

**Note**: The CCA Factory is deployed at the same address on all supported networks.

### Styling

This project uses Tailwind CSS. Modify `tailwind.config.ts` to customize the theme, or edit component styles directly in the page files.

### Adding Features

The minimal setup can be extended with:
- Auction discovery/listing page
- Real-time price charts using auction events
- Historical auction data
- Email/webhook notifications for auction events
- Analytics dashboard
- Auction search and filtering
- Multi-language support
- Mobile app integration

## Development

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

## Troubleshooting

### "Cannot read properties of undefined" error
- Make sure you've updated the WalletConnect Project ID in `lib/wagmi.ts`

### "Transaction reverted" when creating auction
- Ensure you're on a supported network (Sepolia, Mainnet, Base)
- Check that you have enough ETH for gas
- Verify your token address is valid

### "Insufficient allowance" when bidding
- You need to approve the auction contract first
- Check that the auction contract address is correct

### Can't find my auction
- Make sure you're using the auction contract address, not the factory address
- Verify you're on the correct network
- Check the transaction receipt for the AuctionCreated event

## Resources

- [Uniswap CCA Documentation](https://docs.uniswap.org/contracts/liquidity-launchpad/CCA)
- [Uniswap CCA Blog Post](https://blog.uniswap.org/continuous-clearing-auctions)
- [CCA GitHub Repository](https://github.com/Uniswap/continuous-clearing-auction)
- [wagmi Documentation](https://wagmi.sh)
- [RainbowKit Documentation](https://www.rainbowkit.com)
- [Viem Documentation](https://viem.sh)

## Key Differences from Original

This updated version:
- ✅ Uses Uniswap's official factory contract
- ✅ Deploys individual auction contracts (not a singleton)
- ✅ Is completely permissionless (no admin controls)
- ✅ Works on Sepolia testnet for easy testing
- ✅ Properly encodes AuctionParameters struct
- ✅ Calculates block-based timing
- ✅ Extracts deployed auction address from events

## License

MIT

## Contributing

This is a minimal starter template. Feel free to fork and extend with additional features!

---

Built with ❤️ for the Uniswap community

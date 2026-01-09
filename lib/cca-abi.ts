// Uniswap ContinuousClearingAuctionFactory ABI
export const CCA_FACTORY_ABI = [
  // initializeDistribution - Creates a new auction
  {
    name: 'initializeDistribution',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'distributionContract', type: 'address' }],
  },
  // getAuctionAddress - Predicts auction address
  {
    name: 'getAuctionAddress',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
      { name: 'sender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  // Events
  {
    name: 'AuctionCreated',
    type: 'event',
    inputs: [
      { name: 'auction', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'configData', type: 'bytes', indexed: false },
    ],
  },
] as const;

// Individual Auction Contract ABI (for interacting with deployed auctions)
export const CCA_AUCTION_ABI = [
  // ============ IMMUTABLE STORAGE VARIABLES ============
  // These are set during deployment and readable as public variables
  {
    name: 'TOKEN',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'CURRENCY',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'TOTAL_SUPPLY',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'FLOOR_PRICE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'TICK_SPACING',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'START_BLOCK',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'END_BLOCK',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'CLAIM_BLOCK',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'REQUIRED_CURRENCY_RAISED',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    name: 'TOKENS_RECIPIENT',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'FUNDS_RECIPIENT',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'MAX_BID_PRICE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // ============ STATE VIEW FUNCTIONS ============
  {
    name: 'totalCleared',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'activated',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  // ============ BIDDING FUNCTIONS ============
  // Submit Bid
  {
    name: 'submitBid',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'maxPrice', type: 'uint256' },
      { name: 'amount', type: 'uint128' },
      { name: 'owner', type: 'address' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'bidId', type: 'uint256' }],
  },
  // Claim Tokens
  {
    name: 'claimTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [],
  },
  // Claim Tokens Batch
  {
    name: 'claimTokensBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'bidIds', type: 'uint256[]' },
    ],
    outputs: [],
  },
  // Exit Bid
  {
    name: 'exitBid',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [],
  },
  // Checkpoint
  {
    name: 'checkpoint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'blockNumber', type: 'uint256' },
          { name: 'clearingPrice', type: 'uint256' },
          { name: 'cumulativeMps', type: 'uint24' },
        ],
      },
    ],
  },
  // View Functions
  {
    name: 'isGraduated',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'currencyRaised',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'claimBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  // Activation
  {
    name: 'onTokensReceived',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Events
  {
    name: 'BidSubmitted',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint128', indexed: false },
    ],
  },
  {
    name: 'TokensClaimed',
    type: 'event',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BidExited',
    type: 'event',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
      { name: 'currencyRefunded', type: 'uint256', indexed: false },
    ],
  },
] as const;

// AuctionParameters struct for encoding configData
export interface AuctionParameters {
  currency: `0x${string}`;                    // token to raise funds in. Use address(0) for ETH
  tokensRecipient: `0x${string}`;             // address to receive leftover tokens
  fundsRecipient: `0x${string}`;              // address to receive all raised funds
  startBlock: bigint;                         // Block which the first step starts
  endBlock: bigint;                           // When the auction finishes
  claimBlock: bigint;                         // Block when the auction can claimed
  tickSpacing: bigint;                        // Fixed granularity for prices
  validationHook: `0x${string}`;              // Optional hook called before a bid (use address(0) for none)
  floorPrice: bigint;                         // Starting floor price for the auction
  requiredCurrencyRaised: bigint;             // Amount of currency required to be raised for graduation
  auctionStepsData: `0x${string}`;            // Packed bytes describing token issuance schedule
}

// Simple ERC20 Token Factory ABI
// This is a basic ERC20 token that can be deployed on-demand
export const ERC20_FACTORY_ABI = [
  // Deploy a new ERC20 token
  {
    name: 'deployToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'initialSupply', type: 'uint256' },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
  // Events
  {
    name: 'TokenDeployed',
    type: 'event',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'initialSupply', type: 'uint256', indexed: false },
    ],
  },
] as const;

// Standard ERC20 ABI for approvals and transfers
export const ERC20_ABI = [
  // Read functions
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Write functions
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Events
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Approval',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ERC20 Factory Address on Sepolia (you'll need to deploy this contract)
// This is a placeholder - you need to deploy the factory contract
export const ERC20_FACTORY_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

// Uniswap CCA Factory Address (same on all networks)
export const CCA_FACTORY_ADDRESS = '0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D' as `0x${string}`;

// Legacy exports - keeping for backwards compatibility but deprecated
export const CCA_ABI = CCA_AUCTION_ABI;
export const CCA_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

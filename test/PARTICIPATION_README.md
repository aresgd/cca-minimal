# CCA Auction Participation Tests

This document provides comprehensive documentation for the CCA (Continuous Clearing Auction) participation test suite.

## Overview

The participation test suite validates all aspects of bidding, claiming, and interacting with deployed CCA auctions, including:
- Bid parameter validation and encoding
- Token claim operations
- Bid exit functionality
- Clearing price calculations
- Event parsing
- Multi-bidder scenarios

## Test Structure

### CCAParticipation.test.ts

The main test file covers **43 test cases** across 12 categories:

## Test Categories

### 1. Bid Parameter Validation (5 tests)

Tests that validate bid parameters before submission:

```typescript
✔ Bid amount must be positive (> 0 ETH)
✔ Max price must be positive (> 0 ETH per token)
✔ Max price must be >= floor price
✔ Calculate expected tokens: bidAmount / maxPrice
✔ Handle different bid/price combinations
```

**Key Validations**:
- Bid amounts: 0.01 - 10 ETH
- Max prices: 0.001 - 1.0 ETH per token
- Expected token calculations are accurate

### 2. Bid Submission Data Encoding (6 tests)

Tests for encoding `submitBid` function calls:

```typescript
✔ Encode submitBid(maxPrice, amount, owner, hookData)
✔ Encode different bid amounts correctly
✔ Encode different max prices correctly
✔ ETH value equals bid amount
✔ Owner address format validation (0x + 40 hex chars)
✔ Handle empty hook data (0x)
```

**Parameters**:
- `maxPrice`: Maximum price willing to pay per token
- `amount`: Amount of currency to bid (ETH)
- `owner`: Address to receive tokens
- `hookData`: Optional validation hook data

### 3. Bid ID Management (2 tests)

Tests for managing bid identifiers:

```typescript
✔ Bid IDs are bigint >= 0
✔ Handle multiple bid IDs for batch operations
```

**Usage**: Bid IDs are returned from `submitBid` and used for claiming/exiting

### 4. Token Claim Operations (3 tests)

Tests for claiming tokens after auction ends:

```typescript
✔ Encode claimTokens(bidId)
✔ Encode claimTokensBatch(owner, bidIds[])
✔ Validate batch claims with different counts (1-5 bids)
```

**Claim Workflow**:
1. Wait for auction to end
2. Wait for claim block to be reached
3. Call `claimTokens` with bid ID
4. Receive tokens at final clearing price

### 5. Bid Exit Operations (2 tests)

Tests for exiting bids before auction ends:

```typescript
✔ Encode exitBid(bidId)
✔ Validate different bid IDs for exit
```

**Exit Scenarios**:
- Exit bid if you change your mind
- Receive refund of unmatched currency
- May receive partial tokens if partially filled

### 6. Checkpoint Operations (2 tests)

Tests for updating auction state:

```typescript
✔ Encode checkpoint() call
✔ Validate checkpoint return structure
  - blockNumber: Current block
  - clearingPrice: Current price per token
  - cumulativeMps: Cumulative market price score
```

**Usage**: Call `checkpoint()` to update clearing price during auction

### 7. View Function Calls (4 tests)

Tests for reading auction state:

```typescript
✔ isGraduated() - Check if minimum currency raised
✔ currencyRaised() - Total ETH raised
✔ claimBlock() - Block when claims available
✔ Validate return types (bool, uint256, uint64)
```

### 8. Event Validation (6 tests)

Tests for event structure and parsing:

```typescript
✔ BidSubmitted(id, owner, price, amount)
✔ TokensClaimed(bidId, owner, tokensFilled)
✔ BidExited(bidId, owner, tokensFilled, currencyRefunded)
✔ Parse event topics for monitoring
```

**Event Monitoring**:
- Watch for `BidSubmitted` to track your bids
- Watch for `TokensClaimed` to confirm claims
- Watch for `BidExited` for exit confirmations

### 9. Clearing Price Calculations (4 tests)

Tests for understanding token allocation:

```typescript
✔ Calculate tokens at different clearing prices
  - 1 ETH @ 0.01 = 100 tokens
  - 1 ETH @ 0.1 = 10 tokens
  - 1 ETH @ 1.0 = 1 token

✔ Full refund when maxPrice < clearingPrice
✔ Get tokens when maxPrice >= clearingPrice
✔ Handle partial fills correctly
```

**Clearing Price Logic**:
```javascript
if (maxPrice >= clearingPrice) {
  tokensReceived = bidAmount / clearingPrice;
  refund = 0;
} else {
  tokensReceived = 0;
  refund = bidAmount; // Full refund
}
```

### 10. Multi-Bidder Scenarios (2 tests)

Tests for multiple participants:

```typescript
✔ Handle multiple bidders with different max prices
✔ Calculate total currency raised from all bids
```

**Example**:
- Bidder 1: 1 ETH @ 0.01 max
- Bidder 2: 2 ETH @ 0.05 max
- Bidder 3: 5 ETH @ 0.1 max
- Total: 8 ETH raised

### 11. Transaction Value Validation (2 tests)

Tests for ETH value requirements:

```typescript
✔ ETH value must equal bid amount
✔ Validate sufficient balance for bid + gas
```

**Important**: When calling `submitBid`, send ETH equal to your bid amount!

### 12. ABI Function Availability (3 tests)

Tests that all required functions exist:

```typescript
✔ Participation functions available
  - submitBid, claimTokens, claimTokensBatch, exitBid, checkpoint

✔ View functions available
  - isGraduated, currencyRaised, claimBlock

✔ Events available
  - BidSubmitted, TokensClaimed, BidExited
```

### 13. Integration Validation (2 tests)

Tests for complete transaction preparation:

```typescript
✔ Create complete bid submission transaction
✔ Prepare complete claim transaction
```

## Running the Tests

### Run Participation Tests Only

```bash
npm run test:participation
```

### Run All Tests

```bash
npm test
```

### Run with Verbose Output

```bash
npm run test:verbose
```

### Run with Gas Reporting

```bash
npm run test:gas
```

## Test Scenarios Explained

### Scenario 1: Basic Bid Submission

```javascript
// Parameters
const maxPrice = parseEther("0.01");    // 0.01 ETH per token max
const amount = parseEther("1.0");        // 1 ETH bid
const owner = bidder1.address;
const hookData = "0x";

// Expected tokens at different clearing prices:
// - If clearing = 0.005 ETH: 1 / 0.005 = 200 tokens
// - If clearing = 0.01 ETH:  1 / 0.01 = 100 tokens
// - If clearing = 0.02 ETH:  No tokens, full refund
```

### Scenario 2: Batch Claim

```javascript
// After auction ends, claim multiple bids at once
const bidIds = [1n, 2n, 3n, 4n, 5n];
await auction.claimTokensBatch(owner, bidIds);

// More gas efficient than claiming individually
```

### Scenario 3: Exit Before Auction Ends

```javascript
// Exit bid #1 before auction ends
await auction.exitBid(1n);

// Receive:
// - Any tokens you're entitled to (if partially filled)
// - Refund of unmatched currency
```

### Scenario 4: Check Auction Status

```javascript
// Check if auction graduated (met minimum raise)
const graduated = await auction.isGraduated();

// Check total raised
const raised = await auction.currencyRaised();

// Check when claims available
const claimBlockNum = await auction.claimBlock();
```

## Bid Lifecycle

```
1. SUBMIT BID
   ↓
   submitBid(maxPrice, amount, owner, hookData) + ETH value
   ↓
   Receive bidId
   ↓
   Event: BidSubmitted(bidId, owner, price, amount)

2. DURING AUCTION
   ↓
   Option A: Wait for auction to end
   Option B: Exit bid via exitBid(bidId)
   ↓
   Monitor clearing price via checkpoint()

3. AFTER AUCTION ENDS
   ↓
   Wait for claimBlock
   ↓
   claimTokens(bidId) OR claimTokensBatch(owner, [bidIds])
   ↓
   Receive tokens at final clearing price
   ↓
   Event: TokensClaimed(bidId, owner, tokensFilled)
```

## Common Test Patterns

### Encoding a Bid

```javascript
const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
const encodedCall = auctionInterface.encodeFunctionData("submitBid", [
  maxPrice,
  amount,
  owner,
  hookData,
]);

// Send transaction with:
// - data: encodedCall
// - value: amount (same as amount parameter)
```

### Calculating Expected Tokens

```javascript
const bidAmount = parseEther("1.0");
const clearingPrice = parseEther("0.01");

const expectedTokens = bidAmount / clearingPrice;
// = 1.0 / 0.01 = 100 tokens
```

### Validating Event Topics

```javascript
const bidSubmittedTopic = keccak256(
  toUtf8Bytes("BidSubmitted(uint256,address,uint256,uint128)")
);

// Use this topic to filter events in transaction receipt
```

## Expected Test Results

When all tests pass, you should see:

```
  CCA Auction Participation
    Bid Parameter Validation (5 tests)
      ✔ should validate bid amount is positive
      ✔ should validate max price is positive
      ✔ should validate max price is greater than or equal to floor price
      ✔ should calculate expected tokens from bid amount and price
      ✔ should handle different bid amount and price combinations

    Bid Submission Data Encoding (6 tests)
      ✔ should encode submitBid function call correctly
      ✔ should encode different bid amounts correctly
      ✔ should encode different max prices correctly
      ✔ should include ETH value with bid submission
      ✔ should validate owner address format
      ✔ should handle empty hook data

    Bid ID Management (2 tests)
      ✔ should validate bid ID is a number
      ✔ should handle multiple bid IDs for batch operations

    Token Claim Operations (3 tests)
      ✔ should encode claimTokens function call correctly
      ✔ should encode claimTokensBatch function call correctly
      ✔ should validate batch claim with different bid counts

    Bid Exit Operations (2 tests)
      ✔ should encode exitBid function call correctly
      ✔ should validate different bid IDs for exit

    Checkpoint Operations (2 tests)
      ✔ should encode checkpoint function call correctly
      ✔ should validate checkpoint return structure

    View Function Calls (4 tests)
      ✔ should encode isGraduated function call correctly
      ✔ should encode currencyRaised function call correctly
      ✔ should encode claimBlock function call correctly
      ✔ should validate view function return types

    Event Validation (6 tests)
      ✔ should validate BidSubmitted event structure
      ✔ should validate TokensClaimed event structure
      ✔ should validate BidExited event structure
      ✔ should parse BidSubmitted event topic
      ✔ should parse TokensClaimed event topic
      ✔ should parse BidExited event topic

    Clearing Price Calculations (4 tests)
      ✔ should calculate tokens received at different clearing prices
      ✔ should calculate refund when max price < clearing price
      ✔ should calculate tokens when max price >= clearing price
      ✔ should handle partial fills correctly

    Multi-Bidder Scenarios (2 tests)
      ✔ should handle multiple bidders with different max prices
      ✔ should calculate total currency raised from multiple bids

    Transaction Value Validation (2 tests)
      ✔ should require ETH value equal to bid amount
      ✔ should validate sufficient balance for bid

    ABI Function Availability (3 tests)
      ✔ should have all required participation functions in ABI
      ✔ should have all required view functions in ABI
      ✔ should have all required events in ABI

    Integration Validation (2 tests)
      ✔ should create complete bid submission transaction data
      ✔ should prepare complete claim transaction data

  43 passing (276ms)
```

## Integration with Frontend

The tests validate the same logic used in [app/auctions/page.tsx](../app/auctions/page.tsx:45-83):

### Bid Submission (lines 45-68)
```typescript
✔ Encode submitBid with maxPrice, amount, owner, hookData
✔ Send ETH value equal to bid amount
✔ Handle transaction confirmation
```

### Token Claiming (lines 70-83)
```typescript
✔ Encode claimTokens with bidId
✔ Call after auction ends and claim block reached
```

## Manual Testing Checklist

Use this checklist to manually test participation on Sepolia:

### Pre-Participation

- [ ] Auction is deployed and active
- [ ] Auction address is known
- [ ] Wallet connected to Sepolia
- [ ] Sufficient Sepolia ETH for bid + gas

### Bid Submission Tests

- [ ] Bid amount is positive number
- [ ] Max price >= floor price
- [ ] Owner address is valid
- [ ] Transaction sends correct ETH value
- [ ] Transaction confirms successfully
- [ ] BidSubmitted event is emitted
- [ ] Bid ID is received and saved

### During Auction Tests

- [ ] Can view current clearing price
- [ ] Can check if graduated
- [ ] Can check currency raised
- [ ] Can exit bid if needed

### Post-Auction Tests

- [ ] Auction has ended
- [ ] Claim block has been reached
- [ ] Can claim individual bid
- [ ] Can batch claim multiple bids
- [ ] TokensClaimed event is emitted
- [ ] Tokens received in wallet

### Error Scenarios to Test

- [ ] Bidding with max price below floor (should fail)
- [ ] Bidding with zero amount (should fail)
- [ ] Claiming before claim block (should fail)
- [ ] Claiming already claimed bid (should fail)
- [ ] Sending wrong ETH value (should fail)

## Key Concepts

### Max Price

The **maximum price per token** you're willing to pay. Your bid will only be filled if the final clearing price is ≤ your max price.

### Clearing Price

The **final price per token** determined by the auction mechanism. All participants pay the same clearing price.

### Bid Amount

The **total ETH you're bidding** with. This is the value sent with your transaction.

### Tokens Received

Calculated as: `bidAmount / clearingPrice` (if maxPrice >= clearingPrice)

### Refund

If `clearingPrice > maxPrice`, you receive a full refund. Otherwise, refund = 0 (you spent your full bid amount).

## Troubleshooting

### "Insufficient balance" error
- Check wallet has enough ETH for bid + gas
- Reduce bid amount or add more ETH

### "Transaction reverted" when claiming
- Ensure auction has ended
- Ensure claim block has been reached
- Check bid ID is valid and not already claimed

### "Max price too low" error
- Increase max price to at least floor price
- Consider market conditions and set competitive price

### Gas estimation fails
- Check auction contract address is correct
- Verify network is Sepolia
- Ensure auction is still active (for bids)

## Next Steps

After participation tests pass:
1. Test on Sepolia testnet with real transactions
2. Monitor events for bid/claim confirmations
3. Verify token balances after claiming
4. Test edge cases with very small/large amounts
5. Test batch operations with multiple bids

## Resources

- [Uniswap CCA Documentation](https://docs.uniswap.org/contracts/liquidity-launchpad/CCA)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)
- [Hardhat Testing Guide](https://hardhat.org/tutorial/testing-contracts)
- [CCA Participation Page](../app/auctions/page.tsx)
- [CCA ABI Definitions](../lib/cca-abi.ts)

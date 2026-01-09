# CCA Auction Creation Tests

This directory contains comprehensive tests for the Continuous Clearing Auction (CCA) creation functionality.

## Overview

The test suite validates all aspects of creating a CCA auction through the Uniswap factory contract, including:
- Parameter encoding and validation
- Factory contract interactions
- Token approval workflows
- Event validation
- Gas estimation
- Integration testing

## Test Structure

### CCACreation.test.ts

The main test file covers:

1. **Auction Parameter Encoding**
   - Correct encoding of auction parameters into configData
   - Different floor prices (0.001 ETH to 100 ETH)
   - Various auction durations (1 day to 30 days)
   - Different recipient addresses

2. **Salt Generation**
   - Unique salt value generation
   - Valid bytes32 format validation
   - Randomness verification

3. **Factory Contract Interactions**
   - Factory address validation
   - Contract instance creation
   - ABI function availability checks

4. **Auction Deployment Preparation**
   - Valid parameter preparation
   - Token supply validation
   - Timing parameter validation
   - Floor price validation
   - Required currency raised edge cases

5. **Token Approval Workflow**
   - Token approval for factory contract
   - Maximum approval handling
   - Balance verification before approval

6. **Event Validation**
   - AuctionCreated event structure
   - Event topic parsing

7. **Gas Estimation**
   - Gas cost estimation for auction creation

8. **Integration Validation**
   - Complete auction deployment transaction data generation

## Running the Tests

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. (Optional) Set up environment variables for forking Sepolia:
```bash
# Create .env file
echo "SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY" > .env
```

### Run All Tests

```bash
npm test
```

Or using npx:
```bash
npx hardhat test
```

### Run Specific Test File

```bash
npx hardhat test test/CCACreation.test.ts
```

### Run Tests with Gas Reporting

```bash
REPORT_GAS=true npx hardhat test
```

### Run Tests in Verbose Mode

```bash
npx hardhat test --verbose
```

## Test Scenarios

### Basic Auction Creation

Tests validate that you can create an auction with:
- Token address
- Total supply to auction
- Floor price (minimum price per token)
- Auction duration (in blocks)
- Payment currency (ETH by default)
- Recipients for leftover tokens and raised funds

### Parameter Validation

Tests ensure:
- Start block is in the future
- End block is after start block
- Claim block is after end block
- Floor price is positive
- Token supply is available

### Encoding Tests

Tests verify correct encoding of:
- AuctionParameters struct
- Different data types (address, uint64, uint256, uint128, bytes)
- Edge cases (zero values, maximum values)

### Integration Tests

Tests validate the complete flow:
1. Deploy ERC20 token
2. Encode auction parameters
3. Generate unique salt
4. Prepare factory contract call
5. Verify transaction data encoding

## Understanding the Tests

### Fixture Pattern

Tests use Hardhat's `loadFixture` for efficient test setup:

```typescript
async function deployTokenAndSetupFixture() {
  // Deploy token
  // Get factory contract
  // Calculate timing blocks
  // Return all needed objects
}
```

This pattern ensures:
- Fast test execution (reuses blockchain snapshots)
- Isolated test environment
- Consistent starting state

### Auction Parameters

The `AuctionParameters` interface defines all required auction configuration:

```typescript
interface AuctionParameters {
  currency: `0x${string}`;              // Payment token (address(0) for ETH)
  tokensRecipient: `0x${string}`;       // Receives unsold tokens
  fundsRecipient: `0x${string}`;        // Receives raised funds
  startBlock: bigint;                   // When auction starts
  endBlock: bigint;                     // When auction ends
  claimBlock: bigint;                   // When tokens can be claimed
  tickSpacing: bigint;                  // Price granularity
  validationHook: `0x${string}`;        // Optional validation hook
  floorPrice: bigint;                   // Minimum price per token
  requiredCurrencyRaised: bigint;       // Minimum funds to raise
  auctionStepsData: `0x${string}`;      // Issuance schedule (empty for linear)
}
```

### Block Time Calculations

On Sepolia testnet (~12 second blocks):
- 7200 blocks ≈ 1 day
- 21600 blocks ≈ 3 days
- 50400 blocks ≈ 7 days
- 216000 blocks ≈ 30 days

### Salt Generation

Each auction needs a unique salt for CREATE2 deployment:

```typescript
const salt = keccak256(toHex(Date.now().toString() + Math.random().toString()));
```

This generates a unique bytes32 value for deterministic contract addresses.

## Common Test Patterns

### Encoding Parameters

```typescript
const configData = encodeAbiParameters(
  parseAbiParameters("address, address, address, uint64, uint64, uint64, uint256, address, uint256, uint128, bytes"),
  [
    params.currency,
    params.tokensRecipient,
    params.fundsRecipient,
    params.startBlock,
    params.endBlock,
    params.claimBlock,
    params.tickSpacing,
    params.validationHook,
    params.floorPrice,
    params.requiredCurrencyRaised,
    params.auctionStepsData,
  ]
);
```

### Testing Token Approval

```typescript
await token.connect(owner).approve(factoryAddress, approvalAmount);
const allowance = await token.allowance(owner.address, factoryAddress);
expect(allowance).to.equal(approvalAmount);
```

### Validating Events

```typescript
const factoryInterface = new ethers.Interface(CCA_FACTORY_ABI);
const auctionCreatedEvent = factoryInterface.getEvent("AuctionCreated");
expect(auctionCreatedEvent?.name).to.equal("AuctionCreated");
```

## Expected Test Results

When all tests pass, you should see output similar to:

```
  CCA Auction Creation
    Auction Parameter Encoding
      ✔ should correctly encode auction parameters
      ✔ should handle different floor prices correctly
      ✔ should handle different auction durations correctly
      ✔ should support different recipient addresses
    Salt Generation
      ✔ should generate unique salt values
      ✔ should generate valid bytes32 salt
    Factory Contract Interactions
      ✔ should have correct factory address
      ✔ should create factory contract instance
      ✔ should validate factory ABI has required functions
    Auction Deployment Preparation
      ✔ should prepare valid auction creation parameters
      ✔ should validate token supply before auction creation
      ✔ should check auction timing parameters are valid
      ✔ should validate floor price is positive
      ✔ should handle edge cases for required currency raised
    Token Approval Workflow
      ✔ should allow owner to approve factory for token transfer
      ✔ should handle maximum approval amount
      ✔ should verify token balance before approval
    Event Validation
      ✔ should validate AuctionCreated event structure
      ✔ should be able to parse AuctionCreated event topic
    Gas Estimation
      ✔ should estimate gas for auction creation parameters
    Integration Validation
      ✔ should create complete auction deployment transaction data

  21 passing
```

## Troubleshooting

### "Cannot find module 'hardhat'"

Make sure dependencies are installed:
```bash
npm install
```

### "Could not connect to contract"

This is normal for these tests as they validate parameter encoding and preparation, not actual contract deployment. To test actual deployment, you need to:
1. Set `SEPOLIA_RPC_URL` in `.env`
2. Enable forking in `hardhat.config.ts`
3. Run tests against the forked network

### "Block number errors"

If tests fail due to block numbers, ensure:
- Block calculations use `BigInt`
- Current block is fetched correctly
- Start block is sufficiently in the future

## Next Steps

After these creation tests pass, you can:
1. Run tests against a forked Sepolia network
2. Test actual auction deployment
3. Create tests for auction participation (bidding)
4. Test token claiming after auction ends
5. Test edge cases and error conditions

## Additional Resources

- [Hardhat Testing Guide](https://hardhat.org/tutorial/testing-contracts)
- [Chai Matchers](https://hardhat.org/hardhat-chai-matchers/docs/overview)
- [Uniswap CCA Documentation](https://docs.uniswap.org/contracts/liquidity-launchpad/CCA)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)

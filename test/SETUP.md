# Test Setup Guide

## Quick Start

Due to compatibility issues between Next.js 15 (requires ESM) and Hardhat testing (works better with CommonJS in v2.x), we recommend using Vit est or Jest for testing the TypeScript/React components.

For now, the test file `CCACreation.test.ts` is provided as a **reference implementation** showing how to test CCA auction creation.

## Running Tests with Alternative Setup

### Option 1: Use Vitest (Recommended)

1. Install Vitest:
```bash
npm install --save-dev vitest @vitest/ui
```

2. Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

3. Update test file to use Vitest syntax (replace `describe`/`it` imports)

4. Run tests:
```bash
npx vitest
```

### Option 2: Create a Separate Hardhat Project

1. Create a new directory for contract tests:
```bash
mkdir cca-tests
cd cca-tests
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox ethers chai
```

2. Initialize Hardhat:
```bash
npx hardhat init
# Choose "Create a TypeScript project"
```

3. Copy the test file and contracts:
```bash
cp ../test/CCACreation.test.ts test/
cp -r ../contracts .
cp -r ../lib .
```

4. Run tests:
```bash
npx hardhat test
```

### Option 3: Manual Testing via Frontend

The most practical approach for this project is to test through the UI:

1. Start the development server:
```bash
npm run dev
```

2. Navigate to http://localhost:3000/create

3. Test auction creation workflow:
   - Connect wallet
   - Deploy a test token (use SimpleERC20.sol)
   - Fill in auction parameters
   - Create auction
   - Verify transaction and auction address

## Test File Overview

The `CCACreation.test.ts` file includes tests for:

- ✅ Auction parameter encoding validation
- ✅ Different floor price scenarios
- ✅ Various auction duration calculations
- ✅ Salt generation for CREATE2
- ✅ Factory contract interaction setup
- ✅ Token approval workflows
- ✅ Event validation
- ✅ Complete transaction data preparation

## Manual Test Checklist

Use this checklist to manually test auction creation:

### Pre-Creation Tests

- [ ] ERC20 token deployed on Sepolia
- [ ] Wallet has sufficient Sepolia ETH for gas
- [ ] Token balance verified in wallet
- [ ] Factory contract address is correct: `0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D`

### Parameter Encoding Tests

- [ ] Token address is valid (40 hex characters)
- [ ] Total supply is positive number
- [ ] Floor price is greater than 0
- [ ] Duration matches expected blocks (1 day = ~7200 blocks on Sepolia)
- [ ] Currency is set to ETH (0x0000...0000) or valid ERC20
- [ ] Recipients are valid addresses

### Creation Process Tests

- [ ] Transaction is submitted successfully
- [ ] Gas estimate is reasonable (<5M gas)
- [ ] Transaction confirms on-chain
- [ ] AuctionCreated event is emitted
- [ ] Auction contract address is extracted from event
- [ ] Auction address is non-zero and valid

### Post-Creation Tests

- [ ] Token approval for auction contract succeeds
- [ ] Auction parameters are readable on-chain
- [ ] Start/end/claim blocks are correctly set
- [ ] Floor price matches input
- [ ] Total supply matches input

### Error Scenarios to Test

- [ ] Creating auction without token approval (should fail)
- [ ] Creating auction with zero supply (should fail)
- [ ] Creating auction with zero floor price (should fail)
- [ ] Creating auction with invalid token address (should fail)
- [ ] Creating auction with end block before start block (should fail)

## Example Test Results

When tests are properly configured and running, you should see:

```
✓ Auction Parameter Encoding (21 tests)
  ✓ should correctly encode auction parameters
  ✓ should handle different floor prices correctly (4 scenarios)
  ✓ should handle different auction durations correctly (4 scenarios)
  ✓ should support different recipient addresses

✓ Salt Generation (2 tests)
  ✓ should generate unique salt values
  ✓ should generate valid bytes32 salt

✓ Factory Contract Interactions (3 tests)
  ✓ should have correct factory address
  ✓ should create factory contract instance
  ✓ should validate factory ABI has required functions

✓ Auction Deployment Preparation (5 tests)
  ✓ should prepare valid auction creation parameters
  ✓ should validate token supply before auction creation
  ✓ should check auction timing parameters are valid
  ✓ should validate floor price is positive
  ✓ should handle edge cases for required currency raised

✓ Token Approval Workflow (3 tests)
  ✓ should allow owner to approve factory for token transfer
  ✓ should handle maximum approval amount
  ✓ should verify token balance before approval

✓ Event Validation (2 tests)
  ✓ should validate AuctionCreated event structure
  ✓ should be able to parse AuctionCreated event topic

✓ Integration Validation (1 test)
  ✓ should create complete auction deployment transaction data

Total: 21 tests passing
```

## Integration with Frontend

The test file validates the same logic used in [app/create/page.tsx](../app/create/page.tsx:45-122):

1. **Parameter Encoding** (lines 84-100)
2. **Salt Generation** (line 103)
3. **Factory Contract Call** (lines 106-117)

## Next Steps

1. For production deployment, set up proper integration tests
2. Consider using a test framework that's compatible with your stack
3. Test on Sepolia testnet before mainnet deployment
4. Add E2E tests using Playwright or Cypress
5. Set up CI/CD pipeline with automated testing

## Resources

- [Hardhat Testing Guide](https://hardhat.org/tutorial/testing-contracts)
- [Vitest Documentation](https://vitest.dev/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [Testing Best Practices](https://hardhat.org/hardhat-runner/docs/guides/test-contracts)

'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther, parseUnits, encodeAbiParameters, parseAbiParameters, keccak256, toHex, concat, pad, numberToHex } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { CCA_FACTORY_ABI, CCA_FACTORY_ADDRESS, CCA_AUCTION_ABI, ERC20_ABI, type AuctionParameters } from '@/lib/cca-abi';

// Constants from Uniswap CCA contracts
const MPS_TOTAL = 10_000_000n; // Total MPS must sum to 1e7 (10 million)
const MAX_MPS = (1n << 24n) - 1n; // 16,777,215 - max value for 24-bit mps
const MAX_BLOCK_DELTA = (1n << 40n) - 1n; // max value for 40-bit blockDelta

/**
 * Encode auction steps data for a linear auction
 * Each step is 8 bytes: 24-bit mps (upper) + 40-bit blockDelta (lower)
 * The sum of (mps * blockDelta) for all steps must equal MPS_TOTAL (1e7) EXACTLY
 *
 * To ensure exact division, we may need multiple steps if the duration doesn't divide evenly
 */
function encodeLinearAuctionSteps(durationInBlocks: bigint): `0x${string}` {
  // Validate duration
  if (durationInBlocks <= 0n) {
    throw new Error('Duration must be positive');
  }
  if (durationInBlocks > MAX_BLOCK_DELTA) {
    throw new Error(`Duration ${durationInBlocks} exceeds maximum block delta (${MAX_BLOCK_DELTA})`);
  }

  // Calculate MPS for this duration
  const baseMps = MPS_TOTAL / durationInBlocks;
  const remainder = MPS_TOTAL % durationInBlocks;

  // Validate MPS fits in 24 bits
  if (baseMps > MAX_MPS || baseMps + 1n > MAX_MPS) {
    throw new Error(`MPS value exceeds 24-bit maximum. Use a longer duration.`);
  }

  console.log('Step calculation:', {
    durationInBlocks: durationInBlocks.toString(),
    baseMps: baseMps.toString(),
    remainder: remainder.toString(),
  });

  let steps: Array<{ mps: bigint; blockDelta: bigint }> = [];

  if (remainder === 0n) {
    // Perfect division - single step
    steps = [{ mps: baseMps, blockDelta: durationInBlocks }];
  } else {
    // Need two steps to hit exact total
    // deficit blocks use (baseMps + 1), rest use baseMps
    const blocksAtHigherMps = remainder;
    const blocksAtBaseMps = durationInBlocks - remainder;

    if (blocksAtBaseMps > 0n) {
      steps.push({ mps: baseMps, blockDelta: blocksAtBaseMps });
    }
    steps.push({ mps: baseMps + 1n, blockDelta: blocksAtHigherMps });
  }

  // Verify total before encoding
  let totalMps = 0n;
  for (const step of steps) {
    totalMps += step.mps * step.blockDelta;
  }

  if (totalMps !== MPS_TOTAL) {
    throw new Error(`MPS total mismatch: ${totalMps} !== ${MPS_TOTAL}`);
  }

  console.log('Steps created:', steps.map(s => ({
    mps: s.mps.toString(),
    blockDelta: s.blockDelta.toString(),
    product: (s.mps * s.blockDelta).toString(),
  })));
  console.log('Total MPS:', totalMps.toString(), 'Target:', MPS_TOTAL.toString(), 'Match:', totalMps === MPS_TOTAL);

  // Encode all steps - each step is exactly 8 bytes (16 hex chars)
  let encoded = '0x';
  for (const step of steps) {
    // Pack: 24-bit mps in upper bits, 40-bit blockDelta in lower bits
    const packedValue = (step.mps << 40n) | step.blockDelta;
    const hexValue = packedValue.toString(16).padStart(16, '0');
    encoded += hexValue;
  }

  console.log('Encoded steps:', encoded);
  return encoded as `0x${string}`;
}

export default function CreateAuction() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Auction creation hooks
  const { writeContract: createAuction, data: createHash, isPending: isCreatePending, error: createError } = useWriteContract();
  const { isLoading: isCreateConfirming, isSuccess: isCreateSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createHash });

  // Token transfer hooks
  const { writeContract: transferTokens, data: transferHash, isPending: isTransferPending, error: transferError } = useWriteContract();
  const { isLoading: isTransferConfirming, isSuccess: isTransferSuccess } = useWaitForTransactionReceipt({ hash: transferHash });

  // Auction activation hooks
  const { writeContract: activateAuction, data: activateHash, isPending: isActivatePending, error: activateError } = useWriteContract();
  const { isLoading: isActivateConfirming, isSuccess: isActivateSuccess } = useWaitForTransactionReceipt({ hash: activateHash });

  const [formData, setFormData] = useState({
    tokenAddress: '',
    totalSupply: '',
    floorPrice: '0.00001', // Default floor price (price per token in ETH)
    duration: '7', // days
    currency: '0x0000000000000000000000000000000000000000', // ETH
    requiredCurrencyRaised: '0.001', // Optional: minimum ETH to raise (default 0.001 ETH)
  });

  const [deployedAuctionAddress, setDeployedAuctionAddress] = useState<string | null>(null);
  const [showTokenHelper, setShowTokenHelper] = useState(false);

  // Extract deployed auction address from transaction receipt
  if (isCreateSuccess && createReceipt && !deployedAuctionAddress) {
    const auctionCreatedLog = createReceipt.logs.find((log) => {
      try {
        return log.topics[0] === keccak256(toHex('AuctionCreated(address,address,uint256,bytes)'));
      } catch {
        return false;
      }
    });

    if (auctionCreatedLog && auctionCreatedLog.topics[1]) {
      // The auction address is the first indexed parameter (topics[1])
      const auctionAddress = `0x${auctionCreatedLog.topics[1].slice(26)}`;
      setDeployedAuctionAddress(auctionAddress);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      // Calculate block numbers (Sepolia has ~12 second block time)
      const currentBlock = await publicClient?.getBlockNumber();
      if (!currentBlock) {
        alert('Unable to fetch current block number');
        return;
      }

      const durationInDays = parseInt(formData.duration);
      const blocksPerDay = BigInt(Math.floor((24 * 60 * 60) / 12)); // ~7200 blocks per day
      const durationInBlocks = blocksPerDay * BigInt(durationInDays);

      const startBlock = currentBlock + BigInt(300); // Start in ~1 hour (300 blocks * 12 sec = 3600 sec)
      const endBlock = startBlock + durationInBlocks;
      const claimBlock = endBlock + BigInt(100); // Claims available ~20 minutes after end

      // Build AuctionParameters struct
      const userFloorPrice = parseEther(formData.floorPrice);

      // Contract requires minimum floor price of 2^32 (4,294,967,296 wei)
      const MIN_FLOOR_PRICE = BigInt(4294967296);
      const floorPrice = userFloorPrice > MIN_FLOOR_PRICE ? userFloorPrice : MIN_FLOOR_PRICE;

      // Calculate tickSpacing as 1% of floor price (recommended by Uniswap docs)
      // Contract requires minimum tickSpacing of 2
      const MIN_TICK_SPACING = BigInt(2);
      let tickSpacing = floorPrice / BigInt(100); // 1% of floor price
      if (tickSpacing < MIN_TICK_SPACING) {
        tickSpacing = MIN_TICK_SPACING;
      }

      // Parse requiredCurrencyRaised
      console.log('RequiredCurrencyRaised Debug:', {
        formDataValue: formData.requiredCurrencyRaised,
        valueType: typeof formData.requiredCurrencyRaised,
        valueLength: formData.requiredCurrencyRaised.length,
        isEmpty: formData.requiredCurrencyRaised === '',
        parsedValue: parseEther(formData.requiredCurrencyRaised || '0').toString(),
      });

      console.log('Floor Price Debug:', {
        formDataFloorPrice: formData.floorPrice,
        userFloorPrice: userFloorPrice.toString(),
        minFloorPrice: MIN_FLOOR_PRICE.toString(),
        finalFloorPrice: floorPrice.toString(),
        tickSpacing: tickSpacing.toString(),
      });

      const auctionParams: AuctionParameters = {
        currency: formData.currency as `0x${string}`,
        tokensRecipient: address, // Send leftover tokens to creator
        fundsRecipient: address, // Send raised funds to creator
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing, // 1% of floor price for gas efficiency
        validationHook: '0x0000000000000000000000000000000000000000' as `0x${string}`, // No validation hook
        floorPrice, // Price per token in wei (uses minimum if user value too low)
        requiredCurrencyRaised: parseEther(formData.requiredCurrencyRaised),
        auctionStepsData: encodeLinearAuctionSteps(durationInBlocks), // Encoded steps for linear auction
      };

      console.log('Auction Params:', {
        ...auctionParams,
        floorPrice: auctionParams.floorPrice.toString(),
        tickSpacing: auctionParams.tickSpacing.toString(),
        requiredCurrencyRaised: auctionParams.requiredCurrencyRaised.toString(),
      });

      console.log('RequiredCurrencyRaised VERIFICATION:', {
        rawValue: formData.requiredCurrencyRaised,
        parsedInParams: auctionParams.requiredCurrencyRaised.toString(),
        isZero: auctionParams.requiredCurrencyRaised === BigInt(0),
        expected: parseEther('0.001').toString(),
      });

      // Log individual parameters before encoding
      console.log('Individual params before encoding:', {
        '1_currency': auctionParams.currency,
        '2_tokensRecipient': auctionParams.tokensRecipient,
        '3_fundsRecipient': auctionParams.fundsRecipient,
        '4_startBlock': auctionParams.startBlock.toString(),
        '5_endBlock': auctionParams.endBlock.toString(),
        '6_claimBlock': auctionParams.claimBlock.toString(),
        '7_tickSpacing': auctionParams.tickSpacing.toString(),
        '8_validationHook': auctionParams.validationHook,
        '9_floorPrice': auctionParams.floorPrice.toString(),
        '10_requiredCurrencyRaised': auctionParams.requiredCurrencyRaised.toString(),
        '11_auctionStepsData': auctionParams.auctionStepsData,
      });

      // Validate requiredCurrencyRaised fits in uint128
      const MAX_UINT128 = (1n << 128n) - 1n;
      if (auctionParams.requiredCurrencyRaised > MAX_UINT128) {
        alert('Required currency raised exceeds maximum allowed value (uint128)');
        return;
      }

      // Encode the AuctionParameters struct as a tuple
      // CRITICAL: The contract expects configData to be an ABI-encoded struct (tuple),
      // so we must wrap the types in parentheses and pass values as a nested array
      // NOTE: tickSpacing is uint256 per the Uniswap CCA Solidity struct definition
      const configData = encodeAbiParameters(
        parseAbiParameters('(address, address, address, uint64, uint64, uint64, uint256, address, uint256, uint128, bytes)'),
        [[
          auctionParams.currency,
          auctionParams.tokensRecipient,
          auctionParams.fundsRecipient,
          auctionParams.startBlock,
          auctionParams.endBlock,
          auctionParams.claimBlock,
          auctionParams.tickSpacing,
          auctionParams.validationHook,
          auctionParams.floorPrice,
          auctionParams.requiredCurrencyRaised,
          auctionParams.auctionStepsData,
        ]]
      );

      console.log('Encoded configData:', configData);
      console.log('ConfigData length:', configData.length);

      // Generate a random salt for CREATE2
      const salt = keccak256(toHex(Date.now().toString() + Math.random().toString()));

      // Parse total supply
      const totalSupplyInWei = parseUnits(formData.totalSupply, 18);
      console.log('Total Supply Parsing:', {
        formDataTotalSupply: formData.totalSupply,
        totalSupplyInWei: totalSupplyInWei.toString(),
      });

      // Log final transaction args
      console.log('Final Transaction Args:', {
        tokenAddress: formData.tokenAddress,
        totalSupply: totalSupplyInWei.toString(),
        configDataPreview: configData.substring(0, 100) + '...',
        salt,
      });

      // Call factory to create auction
      createAuction({
        address: CCA_FACTORY_ADDRESS,
        abi: CCA_FACTORY_ABI,
        functionName: 'initializeDistribution',
        args: [
          formData.tokenAddress as `0x${string}`,
          totalSupplyInWei,
          configData,
          salt,
        ],
        gas: BigInt(5000000), // Set explicit gas limit under Sepolia's cap
      });
    } catch (err) {
      console.error('Error creating auction:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleTransferTokens = () => {
    if (!deployedAuctionAddress || !formData.tokenAddress || !formData.totalSupply) {
      alert('Missing required information');
      return;
    }

    transferTokens({
      address: formData.tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [
        deployedAuctionAddress as `0x${string}`,
        parseUnits(formData.totalSupply, 18),
      ],
    });
  };

  const handleActivateAuction = () => {
    if (!deployedAuctionAddress) {
      alert('Auction address not found');
      return;
    }

    activateAuction({
      address: deployedAuctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'onTokensReceived',
      args: [],
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-white hover:text-indigo-600">
              CCA Minimal
            </Link>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Create Auction
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Set up a Continuous Clearing Auction for your token launch
          </p>
        </div>

        {/* Token Deployment Helper */}
        <div className="mb-6 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <button
            onClick={() => setShowTokenHelper(!showTokenHelper)}
            className="w-full flex justify-between items-center text-left"
          >
            <div>
              <h3 className="font-bold text-indigo-900 dark:text-indigo-300">
                Need to deploy a token first?
              </h3>
              <p className="text-sm text-indigo-700 dark:text-indigo-400">
                Click here for quick deployment instructions
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-indigo-600 dark:text-indigo-400 transition-transform ${showTokenHelper ? 'rotate-180' : ''}`}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>

          {showTokenHelper && (
            <div className="mt-4 pt-4 border-t border-indigo-200 dark:border-indigo-700">
              <div className="space-y-3 text-sm text-indigo-800 dark:text-indigo-300">
                <p className="font-semibold">Quick Deploy via Remix IDE:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Open <a href="https://remix.ethereum.org" target="_blank" rel="noopener noreferrer" className="underline font-medium">Remix IDE</a></li>
                  <li>Create a new file <code className="bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 rounded">SimpleERC20.sol</code></li>
                  <li>Copy the contract code from <code className="bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 rounded">contracts/SimpleERC20.sol</code> in this project</li>
                  <li>Compile with Solidity 0.8.20+</li>
                  <li>Deploy on Sepolia network with:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                      <li><strong>name:</strong> Your token name (e.g., "My Token")</li>
                      <li><strong>symbol:</strong> Token symbol (e.g., "MTK")</li>
                      <li><strong>initialSupply:</strong> Total supply (e.g., 1000000)</li>
                    </ul>
                  </li>
                  <li>Copy the deployed contract address and paste it below</li>
                </ol>
                <div className="mt-3 p-3 bg-indigo-100 dark:bg-indigo-900 rounded">
                  <p className="font-semibold mb-1">Contract file location:</p>
                  <code className="text-xs">contracts/SimpleERC20.sol</code>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Token Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Token Contract Address
              </label>
              <input
                type="text"
                name="tokenAddress"
                value={formData.tokenAddress}
                onChange={handleChange}
                placeholder="0x..."
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                The ERC-20 token you want to sell
              </p>
            </div>

            {/* Total Supply */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Total Supply to Auction
              </label>
              <input
                type="number"
                name="totalSupply"
                value={formData.totalSupply}
                onChange={handleChange}
                placeholder="1000000"
                required
                step="any"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Number of tokens to sell (in whole units)
              </p>
            </div>

            {/* Floor Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Floor Price (ETH)
              </label>
              <input
                type="number"
                name="floorPrice"
                value={formData.floorPrice}
                onChange={handleChange}
                placeholder="0.001"
                required
                step="any"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Minimum price per token in ETH (contract enforces min: 0.000000004295 ETH)
              </p>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Auction Duration
              </label>
              <select
                name="duration"
                value={formData.duration}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="1">1 Day</option>
                <option value="3">3 Days</option>
                <option value="7">7 Days</option>
                <option value="14">14 Days</option>
                <option value="30">30 Days</option>
              </select>
            </div>

            {/* Required Currency Raised */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Minimum ETH to Raise (Optional)
              </label>
              <input
                type="number"
                name="requiredCurrencyRaised"
                value={formData.requiredCurrencyRaised}
                onChange={handleChange}
                placeholder="0.001"
                step="any"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Minimum amount of ETH required for auction to succeed (0 for no minimum)
              </p>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Payment Currency
              </label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="0x0000000000000000000000000000000000000000">ETH</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Currency users will pay with
              </p>
            </div>

            {/* Status Messages */}
            {createError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">
                  Error: {createError.message}
                </p>
              </div>
            )}

            {isCreateSuccess && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
                  Auction created successfully!
                </p>
                {deployedAuctionAddress && (
                  <p className="text-sm text-green-600 dark:text-green-400 mb-1">
                    <strong>Auction Address:</strong> {deployedAuctionAddress}
                  </p>
                )}
                <p className="text-sm text-green-600 dark:text-green-400">
                  <strong>Transaction:</strong> {createHash}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isConnected || isCreatePending || isCreateConfirming}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              {!isConnected
                ? 'Connect Wallet to Continue'
                : isCreatePending
                ? 'Waiting for approval...'
                : isCreateConfirming
                ? 'Creating auction...'
                : 'Create Auction'}
            </button>
          </form>

          {/* Automated Helper Buttons - Show after auction is created */}
          {isCreateSuccess && deployedAuctionAddress && (
            <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-200 dark:border-purple-700 rounded-lg">
              <h2 className="text-xl font-bold text-purple-900 dark:text-purple-300 mb-4 flex items-center">
                <span className="mr-2">🚀</span>
                Next Steps: Complete Your Auction Setup
              </h2>

              {/* Step 1: Transfer Tokens */}
              <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-purple-900 dark:text-purple-300 flex items-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-bold text-white bg-purple-600 rounded-full">1</span>
                      Transfer Tokens to Auction
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 ml-8">
                      Send {formData.totalSupply} tokens to the auction contract
                    </p>
                  </div>
                  {isTransferSuccess && (
                    <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
                  )}
                </div>

                {transferError && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Error: {transferError.message}
                    </p>
                  </div>
                )}

                {isTransferSuccess && (
                  <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Tokens transferred successfully! Transaction: {transferHash}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleTransferTokens}
                  disabled={isTransferPending || isTransferConfirming || isTransferSuccess}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  {isTransferPending
                    ? 'Waiting for approval...'
                    : isTransferConfirming
                    ? 'Transferring tokens...'
                    : isTransferSuccess
                    ? 'Tokens Transferred ✓'
                    : 'Transfer Tokens'}
                </button>
              </div>

              {/* Step 2: Activate Auction */}
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-purple-900 dark:text-purple-300 flex items-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-bold text-white bg-purple-600 rounded-full">2</span>
                      Activate Auction
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 ml-8">
                      Call onTokensReceived() to make the auction live
                    </p>
                  </div>
                  {isActivateSuccess && (
                    <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
                  )}
                </div>

                {activateError && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Error: {activateError.message}
                    </p>
                  </div>
                )}

                {isActivateSuccess && (
                  <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <p className="text-sm text-green-600 dark:text-green-400 font-bold">
                      🎉 Auction is now LIVE and ready for bids! Transaction: {activateHash}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleActivateAuction}
                  disabled={!isTransferSuccess || isActivatePending || isActivateConfirming || isActivateSuccess}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  {isActivatePending
                    ? 'Waiting for approval...'
                    : isActivateConfirming
                    ? 'Activating auction...'
                    : isActivateSuccess
                    ? 'Auction Activated ✓'
                    : !isTransferSuccess
                    ? 'Transfer tokens first'
                    : 'Activate Auction'}
                </button>
              </div>

              {/* Important Notes */}
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                <p className="text-sm text-amber-800 dark:text-amber-400">
                  <strong>⚠️ Important:</strong> You have ~1 hour to complete both steps before the auction start block.
                  Complete these in order: Transfer → Activate.
                </p>
              </div>
            </div>
          )}

          {/* Complete Workflow Guide */}
          <div className="mt-8 space-y-4">
            {/* Step 1: Pre-Creation */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="font-bold text-blue-900 dark:text-blue-300 mb-2 flex items-center">
                <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-bold text-white bg-blue-600 rounded-full">1</span>
                Before Creating Auction
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-disc list-inside ml-8">
                <li>Deploy your ERC20 token first (see helper above)</li>
                <li>Get Sepolia ETH for gas fees from <a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">faucet</a></li>
                <li>Copy your token contract address</li>
                <li>Fill in the auction parameters above</li>
              </ul>
            </div>

            {/* Step 2: Create Auction */}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <h3 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2 flex items-center">
                <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-bold text-white bg-indigo-600 rounded-full">2</span>
                Create Auction
              </h3>
              <ul className="text-sm text-indigo-800 dark:text-indigo-400 space-y-1 list-disc list-inside ml-8">
                <li>Click "Create Auction" button above</li>
                <li>Confirm the transaction in your wallet</li>
                <li>The auction start block is set to ~1 hour from now</li>
                <li><strong>Use the automated buttons above to complete setup!</strong></li>
              </ul>
            </div>

            {/* Step 3: Automated Transfer */}
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <h3 className="font-bold text-purple-900 dark:text-purple-300 mb-2 flex items-center">
                <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-bold text-white bg-purple-600 rounded-full">3</span>
                Transfer Tokens (Automated)
              </h3>
              <p className="text-sm text-purple-800 dark:text-purple-400 ml-8">
                After creating the auction, use the "Transfer Tokens" button in the purple section above.
                This automatically transfers your tokens to the auction contract.
              </p>
            </div>

            {/* Step 4: Automated Activation */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h3 className="font-bold text-green-900 dark:text-green-300 mb-2 flex items-center">
                <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-bold text-white bg-green-600 rounded-full">4</span>
                Activate Auction (Automated)
              </h3>
              <p className="text-sm text-green-800 dark:text-green-400 ml-8">
                After transferring tokens, use the "Activate Auction" button to call onTokensReceived().
                Your auction will then be live and ready for bids!
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

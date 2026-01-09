'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBlockNumber } from 'wagmi';
import { parseEther, formatEther, formatUnits } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { CCA_FACTORY_ABI, CCA_FACTORY_ADDRESS, CCA_AUCTION_ABI, ERC20_ABI } from '@/lib/cca-abi';

// Helper to format address
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Helper to calculate time from blocks
function blocksToTime(blocks: bigint): string {
  const seconds = Number(blocks) * 12; // ~12 seconds per block
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Auction status type
type AuctionStatus = 'pending' | 'active' | 'ended' | 'claimable' | 'inactive';

function getAuctionStatus(
  activated: boolean | undefined,
  startBlock: bigint | undefined,
  endBlock: bigint | undefined,
  claimBlock: bigint | undefined,
  currentBlock: bigint | undefined
): AuctionStatus {
  if (!activated) return 'inactive';
  if (!currentBlock || !startBlock || !endBlock || !claimBlock) return 'pending';

  if (currentBlock < startBlock) return 'pending';
  if (currentBlock >= startBlock && currentBlock < endBlock) return 'active';
  if (currentBlock >= endBlock && currentBlock < claimBlock) return 'ended';
  return 'claimable';
}

function StatusBadge({ status }: { status: AuctionStatus }) {
  const styles = {
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    ended: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    claimable: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  };

  const labels = {
    inactive: 'Not Activated',
    pending: 'Pending',
    active: 'Active',
    ended: 'Ended',
    claimable: 'Claimable',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function Auctions() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: currentBlock } = useBlockNumber({ watch: true });

  // State for auction address input
  const [auctionAddress, setAuctionAddress] = useState('');
  const [savedAuctions, setSavedAuctions] = useState<string[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<string | null>(null);

  // Bidding state
  const [bidAmount, setBidAmount] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Load saved auctions from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cca-auctions');
    if (saved) {
      const auctions = JSON.parse(saved);
      setSavedAuctions(auctions);
      if (auctions.length > 0 && !selectedAuction) {
        setSelectedAuction(auctions[0]);
      }
    }
  }, []);

  // Save auctions to localStorage
  const saveAuction = (addr: string) => {
    if (!addr || savedAuctions.includes(addr)) return;
    const updated = [...savedAuctions, addr];
    setSavedAuctions(updated);
    localStorage.setItem('cca-auctions', JSON.stringify(updated));
    setSelectedAuction(addr);
    setAuctionAddress('');
  };

  const removeAuction = (addr: string) => {
    const updated = savedAuctions.filter(a => a !== addr);
    setSavedAuctions(updated);
    localStorage.setItem('cca-auctions', JSON.stringify(updated));
    if (selectedAuction === addr) {
      setSelectedAuction(updated[0] || null);
    }
  };

  // Batch read all auction data in a single multicall
  const auctionContract = {
    address: selectedAuction as `0x${string}`,
    abi: CCA_AUCTION_ABI,
  } as const;

  const { data: auctionData, isLoading: isLoadingAuction } = useReadContracts({
    contracts: [
      { ...auctionContract, functionName: 'TOKEN' },
      { ...auctionContract, functionName: 'CURRENCY' },
      { ...auctionContract, functionName: 'TOTAL_SUPPLY' },
      { ...auctionContract, functionName: 'FLOOR_PRICE' },
      { ...auctionContract, functionName: 'TICK_SPACING' },
      { ...auctionContract, functionName: 'START_BLOCK' },
      { ...auctionContract, functionName: 'END_BLOCK' },
      { ...auctionContract, functionName: 'CLAIM_BLOCK' },
      { ...auctionContract, functionName: 'REQUIRED_CURRENCY_RAISED' },
      { ...auctionContract, functionName: 'currencyRaised' },
      { ...auctionContract, functionName: 'isGraduated' },
      { ...auctionContract, functionName: 'activated' },
      { ...auctionContract, functionName: 'totalCleared' },
    ],
    query: { enabled: !!selectedAuction },
  });

  // Extract results from multicall
  const tokenAddress = auctionData?.[0]?.result as `0x${string}` | undefined;
  const currency = auctionData?.[1]?.result as `0x${string}` | undefined;
  const totalSupply = auctionData?.[2]?.result as bigint | undefined;
  const floorPrice = auctionData?.[3]?.result as bigint | undefined;
  const tickSpacing = auctionData?.[4]?.result as bigint | undefined;
  const startBlock = auctionData?.[5]?.result as bigint | undefined;
  const endBlock = auctionData?.[6]?.result as bigint | undefined;
  const claimBlock = auctionData?.[7]?.result as bigint | undefined;
  const requiredCurrencyRaised = auctionData?.[8]?.result as bigint | undefined;
  const currencyRaised = auctionData?.[9]?.result as bigint | undefined;
  const isGraduated = auctionData?.[10]?.result as boolean | undefined;
  const activated = auctionData?.[11]?.result as boolean | undefined;
  const totalCleared = auctionData?.[12]?.result as bigint | undefined;

  // Batch read token metadata (only when we have tokenAddress)
  const { data: tokenData } = useReadContracts({
    contracts: [
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'name' },
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'symbol' },
    ],
    query: { enabled: !!tokenAddress },
  });

  const tokenName = tokenData?.[0]?.result as string | undefined;
  const tokenSymbol = tokenData?.[1]?.result as string | undefined;

  // Write contract for bidding
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const auctionStatus = getAuctionStatus(
    activated as boolean,
    startBlock as bigint,
    endBlock as bigint,
    claimBlock as bigint,
    currentBlock
  );

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !selectedAuction) {
      alert('Please connect wallet and select an auction');
      return;
    }

    try {
      const bidAmountWei = parseEther(bidAmount);
      const maxPriceWei = parseEther(maxPrice);

      writeContract({
        address: selectedAuction as `0x${string}`,
        abi: CCA_AUCTION_ABI,
        functionName: 'submitBid',
        args: [
          maxPriceWei,
          bidAmountWei,
          address!,
          '0x' as `0x${string}`, // Empty hook data
        ],
        value: bidAmountWei,
      });
    } catch (err) {
      console.error('Error placing bid:', err);
    }
  };

  // Calculate progress and time remaining
  const progressPercent = totalSupply && totalCleared
    ? Number((totalCleared as bigint) * 100n / (totalSupply as bigint))
    : 0;

  const blocksUntilStart = currentBlock && startBlock && currentBlock < startBlock
    ? startBlock - currentBlock
    : 0n;

  const blocksUntilEnd = currentBlock && endBlock && currentBlock < endBlock
    ? endBlock - currentBlock
    : 0n;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-white hover:text-indigo-600">
              CCA Minimal
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/create" className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                Create Auction
              </Link>
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Participate in Auctions
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Enter an auction address to view details and place bids
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Auction Selection */}
          <div className="space-y-4">
            {/* Add Auction */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Add Auction
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={auctionAddress}
                  onChange={(e) => setAuctionAddress(e.target.value)}
                  placeholder="0x... auction address"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={() => saveAuction(auctionAddress)}
                  disabled={!auctionAddress}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Saved Auctions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Your Auctions
              </h2>
              {savedAuctions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No auctions saved. Add an auction address above.
                </p>
              ) : (
                <div className="space-y-2">
                  {savedAuctions.map((addr) => (
                    <div
                      key={addr}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedAuction === addr
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700'
                          : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                      onClick={() => setSelectedAuction(addr)}
                    >
                      <span className="font-mono text-xs text-gray-900 dark:text-white">
                        {formatAddress(addr)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAuction(addr);
                        }}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Middle Column - Auction Details */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedAuction ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  Select or add an auction to view details
                </p>
              </div>
            ) : isLoadingAuction ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">
                  Loading auction data...
                </p>
              </div>
            ) : (
              <>
                {/* Auction Overview */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {tokenName || 'Loading...'} ({tokenSymbol || '...'})
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {selectedAuction}
                      </p>
                    </div>
                    <StatusBadge status={auctionStatus} />
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Tokens Sold</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {progressPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs mt-1 text-gray-500">
                      <span>{totalCleared ? formatEther(totalCleared as bigint) : '0'} sold</span>
                      <span>{totalSupply ? formatEther(totalSupply as bigint) : '0'} total</span>
                    </div>
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Floor Price</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {floorPrice ? formatEther(floorPrice as bigint) : '0'} ETH
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Currency Raised</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {currencyRaised ? formatEther(currencyRaised as bigint) : '0'} ETH
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Required Raise</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {requiredCurrencyRaised ? formatEther(requiredCurrencyRaised as bigint) : '0'} ETH
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Graduated</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {isGraduated ? '✓ Yes' : '✗ No'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Auction Parameters */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Auction Parameters
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Token Address</span>
                        <a
                          href={`https://sepolia.etherscan.io/address/${tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-indigo-600 hover:text-indigo-800"
                        >
                          {tokenAddress ? formatAddress(tokenAddress as string) : '...'}
                        </a>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Total Supply</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {totalSupply ? formatEther(totalSupply as bigint) : '0'} tokens
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Tick Spacing</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {tickSpacing ? formatEther(tickSpacing as bigint) : '0'} ETH
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Currency</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {currency === '0x0000000000000000000000000000000000000000' ? 'ETH' : formatAddress(currency as string || '')}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Start Block</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {startBlock?.toString() || '...'}
                          {blocksUntilStart > 0n && (
                            <span className="text-xs text-gray-500 ml-1">
                              (in {blocksToTime(blocksUntilStart)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">End Block</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {endBlock?.toString() || '...'}
                          {blocksUntilEnd > 0n && (
                            <span className="text-xs text-gray-500 ml-1">
                              (in {blocksToTime(blocksUntilEnd)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Claim Block</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {claimBlock?.toString() || '...'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Current Block</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {currentBlock?.toString() || '...'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Place Bid */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Place Bid
                  </h3>

                  {auctionStatus !== 'active' && (
                    <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        {auctionStatus === 'inactive' && 'This auction has not been activated yet. Tokens need to be transferred to the auction contract.'}
                        {auctionStatus === 'pending' && `Auction starts in approximately ${blocksToTime(blocksUntilStart)}`}
                        {auctionStatus === 'ended' && 'This auction has ended. Wait for the claim period.'}
                        {auctionStatus === 'claimable' && 'Auction is complete. You can now claim your tokens.'}
                      </p>
                    </div>
                  )}

                  <form onSubmit={handlePlaceBid} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Bid Amount (ETH)
                        </label>
                        <input
                          type="number"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          placeholder="0.1"
                          step="any"
                          required
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                        />
                        <p className="mt-1 text-xs text-gray-500">Amount of ETH to spend</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Price (ETH per token)
                        </label>
                        <input
                          type="number"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="0.001"
                          step="any"
                          required
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                        />
                        <p className="mt-1 text-xs text-gray-500">Max price per token you'll accept</p>
                      </div>
                    </div>

                    {bidAmount && maxPrice && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                          <strong>Estimated tokens:</strong>{' '}
                          {(parseFloat(bidAmount) / parseFloat(maxPrice)).toLocaleString()} tokens at max price
                        </p>
                      </div>
                    )}

                    {error && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Error: {error.message}
                        </p>
                      </div>
                    )}

                    {isSuccess && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Bid placed successfully!{' '}
                          <a
                            href={`https://sepolia.etherscan.io/tx/${hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            View transaction
                          </a>
                        </p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={!isConnected || isPending || isConfirming || auctionStatus !== 'active'}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                      {!isConnected
                        ? 'Connect Wallet'
                        : auctionStatus !== 'active'
                        ? 'Auction Not Active'
                        : isPending
                        ? 'Confirm in Wallet...'
                        : isConfirming
                        ? 'Placing Bid...'
                        : 'Place Bid'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

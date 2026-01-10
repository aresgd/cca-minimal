'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBlockNumber } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { CCA_AUCTION_ABI, ERC20_ABI } from '@/lib/cca-abi';

// Bid type from contract - matches the bids() return tuple
interface Bid {
  startBlock: bigint;
  startCumulativeMps: number; // uint24 fits in number
  exitedBlock: bigint;
  maxPrice: bigint;
  owner: `0x${string}`;
  amountQ96: bigint;
  tokensFilled: bigint;
}

// User bid with ID
interface UserBid {
  id: bigint;
  bid: Bid;
}

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

// Helper to estimate date/time from block difference
function blocksToEstimatedTime(blockDiff: bigint, isFuture: boolean = true): string {
  const seconds = Number(blockDiff) * 12; // ~12 seconds per block
  const now = new Date();
  const targetTime = new Date(now.getTime() + (isFuture ? seconds : -seconds) * 1000);

  // Format as readable date/time
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return targetTime.toLocaleDateString('en-US', options);
}

// Helper to get relative time description
function getRelativeTimeDescription(blockDiff: bigint, isFuture: boolean): string {
  const seconds = Math.abs(Number(blockDiff) * 12);

  if (seconds < 60) return isFuture ? `in ${seconds}s` : `${seconds}s ago`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return isFuture ? `in ${mins}m` : `${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return isFuture ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

// Auction status type
type AuctionStatus = 'pending' | 'active' | 'ended' | 'claimable' | 'inactive';

function getAuctionStatus(
  totalSupply: bigint | undefined,
  startBlock: bigint | undefined,
  endBlock: bigint | undefined,
  claimBlock: bigint | undefined,
  currentBlock: bigint | undefined
): AuctionStatus {
  // Check if auction has tokens (activated) - totalSupply > 0 means tokens were transferred
  if (!totalSupply || totalSupply === 0n) return 'inactive';

  // Need all block info to determine timing status
  if (!currentBlock || !startBlock || !endBlock || !claimBlock) return 'pending';

  // Determine status based on current block position
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

  // User bids state
  const [userBids, setUserBids] = useState<UserBid[]>([]);
  const [isLoadingBids, setIsLoadingBids] = useState(false);

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
      { ...auctionContract, functionName: 'token' },
      { ...auctionContract, functionName: 'currency' },
      { ...auctionContract, functionName: 'totalSupply' },
      { ...auctionContract, functionName: 'floorPrice' },
      { ...auctionContract, functionName: 'tickSpacing' },
      { ...auctionContract, functionName: 'startBlock' },
      { ...auctionContract, functionName: 'endBlock' },
      { ...auctionContract, functionName: 'claimBlock' },
      { ...auctionContract, functionName: 'requiredCurrencyRaised' },
      { ...auctionContract, functionName: 'currencyRaised' },
      { ...auctionContract, functionName: 'isGraduated' },
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
  const totalCleared = auctionData?.[11]?.result as bigint | undefined;

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

  // Fetch user bids by iterating through bid IDs (more reliable than events)
  useEffect(() => {
    const fetchUserBids = async () => {
      if (!publicClient || !selectedAuction || !address) {
        setUserBids([]);
        return;
      }

      setIsLoadingBids(true);
      try {
        // Get the total number of bids in this auction
        const nextBidIdResult = await publicClient.readContract({
          address: selectedAuction as `0x${string}`,
          abi: CCA_AUCTION_ABI,
          functionName: 'nextBidId',
        }) as bigint;

        console.log(`[BidFetch] Total bids in auction: ${nextBidIdResult.toString()}`);
        console.log(`[BidFetch] Looking for bids owned by: ${address}`);

        // Iterate through all bid IDs and filter by owner
        const bidPromises: Promise<UserBid | null>[] = [];
        for (let bidId = 0n; bidId < nextBidIdResult; bidId++) {
          bidPromises.push(
            (async () => {
              try {
                const bidData = await publicClient.readContract({
                  address: selectedAuction as `0x${string}`,
                  abi: CCA_AUCTION_ABI,
                  functionName: 'bids',
                  args: [bidId],
                }) as Bid;

                // Check if this bid belongs to the connected user (case-insensitive)
                if (bidData.owner.toLowerCase() === address.toLowerCase()) {
                  console.log(`[BidFetch] Found user bid #${bidId}:`, {
                    owner: bidData.owner,
                    maxPrice: bidData.maxPrice.toString(),
                    amountQ96: bidData.amountQ96.toString(),
                    tokensFilled: bidData.tokensFilled.toString(),
                    exitedBlock: bidData.exitedBlock.toString(),
                  });
                  return { id: bidId, bid: bidData };
                }
                return null;
              } catch (bidError) {
                console.error(`[BidFetch] Error reading bid #${bidId}:`, bidError);
                return null;
              }
            })()
          );
        }

        const bids = (await Promise.all(bidPromises)).filter((b): b is UserBid => b !== null);
        console.log(`[BidFetch] Successfully loaded ${bids.length} user bids out of ${nextBidIdResult.toString()} total bids`);
        setUserBids(bids);
      } catch (err) {
        console.error('[BidFetch] Error fetching bids:', err);
        setUserBids([]);
      }
      setIsLoadingBids(false);
    };

    fetchUserBids();
  }, [publicClient, selectedAuction, address, isSuccess]); // Refresh when a new bid is placed

  const auctionStatus = getAuctionStatus(
    totalSupply,
    startBlock,
    endBlock,
    claimBlock,
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

                  {/* Auction Timeline */}
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Auction Timeline</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      {/* Start */}
                      <div className={`p-3 rounded-lg ${
                        currentBlock && startBlock && currentBlock >= startBlock
                          ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
                      }`}>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Start</p>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                          Block {startBlock?.toString() || '...'}
                        </p>
                        {currentBlock && startBlock && (
                          <p className="text-xs mt-1">
                            {currentBlock < startBlock ? (
                              <span className="text-yellow-600 dark:text-yellow-400">
                                {blocksToEstimatedTime(startBlock - currentBlock, true)}
                                <br />
                                <span className="text-gray-500">({getRelativeTimeDescription(startBlock - currentBlock, true)})</span>
                              </span>
                            ) : (
                              <span className="text-green-600 dark:text-green-400">Started</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* End */}
                      <div className={`p-3 rounded-lg ${
                        currentBlock && endBlock && currentBlock >= endBlock
                          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
                      }`}>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">End</p>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                          Block {endBlock?.toString() || '...'}
                        </p>
                        {currentBlock && endBlock && (
                          <p className="text-xs mt-1">
                            {currentBlock < endBlock ? (
                              <span className="text-blue-600 dark:text-blue-400">
                                {blocksToEstimatedTime(endBlock - currentBlock, true)}
                                <br />
                                <span className="text-gray-500">({getRelativeTimeDescription(endBlock - currentBlock, true)})</span>
                              </span>
                            ) : (
                              <span className="text-blue-600 dark:text-blue-400">Ended</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Claim */}
                      <div className={`p-3 rounded-lg ${
                        currentBlock && claimBlock && currentBlock >= claimBlock
                          ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
                      }`}>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Claim</p>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                          Block {claimBlock?.toString() || '...'}
                        </p>
                        {currentBlock && claimBlock && (
                          <p className="text-xs mt-1">
                            {currentBlock < claimBlock ? (
                              <span className="text-purple-600 dark:text-purple-400">
                                {blocksToEstimatedTime(claimBlock - currentBlock, true)}
                                <br />
                                <span className="text-gray-500">({getRelativeTimeDescription(claimBlock - currentBlock, true)})</span>
                              </span>
                            ) : (
                              <span className="text-purple-600 dark:text-purple-400">Claimable</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
                      Current Block: {currentBlock?.toString() || '...'} | ~12 seconds per block
                    </p>
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
                    {totalCleared === 0n && auctionStatus === 'active' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                        * Tokens sold updates when checkpoint() is called on the contract
                      </p>
                    )}
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
                    Auction Details
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
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Currency</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {currency === '0x0000000000000000000000000000000000000000' ? 'ETH' : formatAddress(currency as string || '')}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Auction Contract</span>
                        <a
                          href={`https://sepolia.etherscan.io/address/${selectedAuction}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-indigo-600 hover:text-indigo-800"
                        >
                          {selectedAuction ? formatAddress(selectedAuction) : '...'}
                        </a>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                        <span className="text-gray-600 dark:text-gray-400">Activation Status</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {totalSupply && totalSupply > 0n ? '✓ Tokens Received' : '✗ Awaiting Tokens'}
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
                        {auctionStatus === 'pending' && startBlock && currentBlock && currentBlock < startBlock && (
                          <>Auction starts {getRelativeTimeDescription(startBlock - currentBlock, true)} (estimated: {blocksToEstimatedTime(startBlock - currentBlock, true)})</>
                        )}
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

                {/* Claim Tokens Callout - Show when auction is claimable/ended and user has bids */}
                {isConnected && (auctionStatus === 'claimable' || auctionStatus === 'ended') && userBids.length > 0 && (
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg shadow-lg border-2 border-purple-300 dark:border-purple-700 p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-purple-500 dark:bg-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-2xl">🎁</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                          {auctionStatus === 'claimable' ? 'Ready to Claim Your Tokens!' : 'Auction Ended - Claim Period Coming Soon'}
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">
                          {auctionStatus === 'claimable'
                            ? 'The auction has ended and the claim period has started. You can now claim your tokens from your bids below.'
                            : `The auction has ended. You'll be able to claim tokens starting at block ${claimBlock?.toString()}.`
                          }
                        </p>
                        {auctionStatus === 'claimable' && (
                          <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="font-medium">Scroll down to your bids and click "Claim Tokens"</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Your Bids Section */}
                {isConnected && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Your Bids
                    </h3>

                    {isLoadingBids ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-500">Loading your bids...</p>
                      </div>
                    ) : userBids.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                        You haven't placed any bids in this auction yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {userBids.map((userBid) => {
                          const isExited = userBid.bid.exitedBlock > 0n;
                          const canClaim = auctionStatus === 'claimable' && !isExited && userBid.bid.tokensFilled > 0n;
                          // Can only exit after auction ends (not during active bidding)
                          const canExit = (auctionStatus === 'ended' || auctionStatus === 'claimable') && !isExited;
                          // amountQ96 is in Q96 format: (wei amount) * 2^96
                          // To get ETH: divide by 2^96 to get wei, then divide by 10^18 to get ETH
                          // Simplified: divide by (2^96 * 10^18)
                          const amountWei = userBid.bid.amountQ96 / (2n ** 96n);
                          const amountEth = formatEther(amountWei);

                          return (
                            <div
                              key={userBid.id.toString()}
                              className={`p-4 rounded-lg border ${
                                isExited
                                  ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                                  : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  Bid #{userBid.id.toString()}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  isExited
                                    ? 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                }`}>
                                  {isExited ? 'Exited' : 'Active'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Amount:</span>
                                  <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                    {amountEth} ETH
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Max Price:</span>
                                  <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                    {formatEther(userBid.bid.maxPrice)} ETH
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Tokens Filled:</span>
                                  <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                    {formatEther(userBid.bid.tokensFilled)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Block:</span>
                                  <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                    {userBid.bid.startBlock.toString()}
                                  </span>
                                </div>
                              </div>

                              {(canClaim || canExit || (auctionStatus === 'active' && !isExited)) && (
                                <div className="flex flex-col gap-2">
                                  {auctionStatus === 'active' && !isExited && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                      💡 You can exit this bid after the auction ends (block {endBlock?.toString()})
                                    </p>
                                  )}
                                  {(canExit || canClaim) && (
                                    <div className="flex gap-2">
                                      {canExit && (
                                        <button
                                          onClick={() => {
                                            writeContract({
                                              address: selectedAuction as `0x${string}`,
                                              abi: CCA_AUCTION_ABI,
                                              functionName: 'exitBid',
                                              args: [userBid.id],
                                            });
                                          }}
                                          disabled={isPending}
                                          className="flex-1 px-3 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white rounded-lg"
                                        >
                                          Exit Bid
                                        </button>
                                      )}
                                      {canClaim && (
                                        <button
                                          onClick={() => {
                                            writeContract({
                                              address: selectedAuction as `0x${string}`,
                                              abi: CCA_AUCTION_ABI,
                                              functionName: 'claimTokens',
                                              args: [userBid.id],
                                            });
                                          }}
                                          disabled={isPending}
                                          className="flex-1 px-3 py-2 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg"
                                        >
                                          Claim Tokens
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAccount, usePublicClient, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBlockNumber } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CCA_AUCTION_ABI, ERC20_ABI } from '@/lib/cca-abi';
import { AuctionTheme, defaultTheme, auctionThemes, createTheme } from '@/lib/theme-config';

// Bid interface matching the contract struct
interface Bid {
  startBlock: bigint;
  startCumulativeMps: number;
  exitedBlock: bigint;
  maxPrice: bigint;
  owner: `0x${string}`;
  amountQ96: bigint;
  tokensFilled: bigint;
}

interface UserBid {
  bidId: bigint;
  amount: bigint;
  maxPrice: bigint;
  tokensFilled: bigint;
  isExited: boolean;
}

// Utility functions
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function blocksToTime(blocks: bigint): string {
  const seconds = Number(blocks) * 12;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

type AuctionStatus = 'inactive' | 'pending' | 'active' | 'ended' | 'claimable';

function getAuctionStatus(
  activated: boolean | undefined,
  startBlock: bigint | undefined,
  endBlock: bigint | undefined,
  claimBlock: bigint | undefined,
  currentBlock: bigint | undefined
): AuctionStatus {
  if (!activated) return 'inactive';
  if (!startBlock || !endBlock || !claimBlock || !currentBlock) return 'inactive';
  if (currentBlock < startBlock) return 'pending';
  if (currentBlock >= startBlock && currentBlock < endBlock) return 'active';
  if (currentBlock >= endBlock && currentBlock < claimBlock) return 'ended';
  return 'claimable';
}

// Status Badge Component
function StatusBadge({ status, theme }: { status: AuctionStatus; theme: AuctionTheme }) {
  const statusConfig = {
    inactive: { label: 'Not Active', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
    pending: { label: 'Starting Soon', className: theme.statusPending },
    active: { label: 'Live Now', className: theme.statusActive },
    ended: { label: 'Ended', className: theme.statusEnded },
    claimable: { label: 'Claim Open', className: theme.statusClaimable },
  };

  const config = statusConfig[status];
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

// Countdown Timer Component
function CountdownTimer({ targetBlock, currentBlock, label }: {
  targetBlock: bigint;
  currentBlock: bigint;
  label: string;
}) {
  const blocksRemaining = targetBlock > currentBlock ? targetBlock - currentBlock : 0n;
  const seconds = Number(blocksRemaining) * 12;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (blocksRemaining === 0n) {
    return <div className="text-center text-gray-500">--:--:--</div>;
  }

  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex justify-center gap-2 text-2xl font-mono font-bold">
        {days > 0 && (
          <>
            <div className="flex flex-col items-center">
              <span>{days.toString().padStart(2, '0')}</span>
              <span className="text-xs font-normal text-gray-500">days</span>
            </div>
            <span>:</span>
          </>
        )}
        <div className="flex flex-col items-center">
          <span>{hours.toString().padStart(2, '0')}</span>
          <span className="text-xs font-normal text-gray-500">hrs</span>
        </div>
        <span>:</span>
        <div className="flex flex-col items-center">
          <span>{minutes.toString().padStart(2, '0')}</span>
          <span className="text-xs font-normal text-gray-500">min</span>
        </div>
        <span>:</span>
        <div className="flex flex-col items-center">
          <span>{secs.toString().padStart(2, '0')}</span>
          <span className="text-xs font-normal text-gray-500">sec</span>
        </div>
      </div>
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ raised, goal, theme }: {
  raised: bigint;
  goal: bigint;
  theme: AuctionTheme;
}) {
  const percentage = goal > 0n ? Number((raised * 100n) / goal) : 0;
  const cappedPercentage = Math.min(percentage, 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className={theme.textSecondary}>Raised</span>
        <span className={theme.textPrimary}>{formatEther(raised)} ETH</span>
      </div>
      <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${theme.primaryColor} transition-all duration-500`}
          style={{ width: `${cappedPercentage}%` }}
        />
      </div>
      {goal > 0n && (
        <div className="flex justify-between text-xs mt-1">
          <span className={theme.textSecondary}>{percentage}% of goal</span>
          <span className={theme.textSecondary}>Goal: {formatEther(goal)} ETH</span>
        </div>
      )}
    </div>
  );
}

export default function ParticipatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const auctionAddress = params.address as string;

  // Theme configuration from URL params or default
  const themeName = searchParams.get('theme') || 'default';
  const customThemeJson = searchParams.get('config');

  const theme = useMemo(() => {
    if (customThemeJson) {
      try {
        const customConfig = JSON.parse(decodeURIComponent(customThemeJson));
        return createTheme(customConfig);
      } catch {
        return auctionThemes[themeName] || defaultTheme;
      }
    }
    return auctionThemes[themeName] || defaultTheme;
  }, [themeName, customThemeJson]);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Form state
  const [bidAmount, setBidAmount] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [userBids, setUserBids] = useState<UserBid[]>([]);
  const [isLoadingBids, setIsLoadingBids] = useState(false);
  const [totalBids, setTotalBids] = useState<number>(0);
  const [showCCAInfo, setShowCCAInfo] = useState(false);
  const [highestBidPrice, setHighestBidPrice] = useState<bigint | null>(null);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);

  // Contract interactions
  const { writeContract: submitBid, data: bidHash, isPending: isBidPending, error: bidError } = useWriteContract();
  const { isLoading: isBidConfirming, isSuccess: isBidSuccess } = useWaitForTransactionReceipt({ hash: bidHash });

  const { writeContract: exitBid, data: exitHash, isPending: isExitPending } = useWriteContract();
  const { isLoading: isExitConfirming, isSuccess: isExitSuccess } = useWaitForTransactionReceipt({ hash: exitHash });

  const { writeContract: claimTokens, data: claimHash, isPending: isClaimPending } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

  // Read auction data
  const auctionContract = {
    address: auctionAddress as `0x${string}`,
    abi: CCA_AUCTION_ABI,
  };

  const { data: auctionData, refetch: refetchAuction } = useReadContracts({
    contracts: [
      { ...auctionContract, functionName: 'token' },
      { ...auctionContract, functionName: 'totalSupply' },
      { ...auctionContract, functionName: 'startBlock' },
      { ...auctionContract, functionName: 'endBlock' },
      { ...auctionContract, functionName: 'claimBlock' },
      { ...auctionContract, functionName: 'floorPrice' },
      { ...auctionContract, functionName: 'requiredCurrencyRaised' },
      { ...auctionContract, functionName: 'clearingPrice' },
      { ...auctionContract, functionName: 'currencyRaised' },
      { ...auctionContract, functionName: 'totalCleared' },
      { ...auctionContract, functionName: 'isGraduated' },
      { ...auctionContract, functionName: 'tickSpacing' },
    ],
    query: { enabled: !!auctionAddress },
  });

  // Parse auction data
  const tokenAddress = auctionData?.[0]?.result as `0x${string}` | undefined;
  const totalSupply = auctionData?.[1]?.result as bigint | undefined;
  const startBlock = auctionData?.[2]?.result as bigint | undefined;
  const endBlock = auctionData?.[3]?.result as bigint | undefined;
  const claimBlock = auctionData?.[4]?.result as bigint | undefined;
  const floorPrice = auctionData?.[5]?.result as bigint | undefined;
  const requiredCurrencyRaised = auctionData?.[6]?.result as bigint | undefined;
  const clearingPrice = auctionData?.[7]?.result as bigint | undefined;
  const currencyRaised = auctionData?.[8]?.result as bigint | undefined;
  const totalCleared = auctionData?.[9]?.result as bigint | undefined;
  const isGraduated = auctionData?.[10]?.result as boolean | undefined;
  const tickSpacing = auctionData?.[11]?.result as bigint | undefined;

  // Activation is determined by whether tokens have been transferred (totalSupply > 0)
  const activated = totalSupply !== undefined && totalSupply > 0n;

  // Read token info
  const { data: tokenData } = useReadContracts({
    contracts: [
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'name' },
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'symbol' },
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'decimals' },
    ],
    query: { enabled: !!tokenAddress },
  });

  const tokenName = tokenData?.[0]?.result as string | undefined;
  const tokenSymbol = tokenData?.[1]?.result as string | undefined;

  // Calculate auction status
  const auctionStatus = getAuctionStatus(activated, startBlock, endBlock, claimBlock, currentBlock);

  // Fetch user bids, total bids, and highest active bid price
  useEffect(() => {
    async function fetchBids() {
      console.log('[ParticipatePage] fetchBids triggered:', {
        hasPublicClient: !!publicClient,
        auctionAddress,
        address,
        isBidSuccess,
      });

      if (!publicClient || !auctionAddress) {
        console.log('[ParticipatePage] Missing publicClient or auctionAddress, skipping');
        setHighestBidPrice(null);
        setContractBalance(null);
        return;
      }

      // Small delay after successful tx to let the chain update
      if (isBidSuccess || isExitSuccess || isClaimSuccess) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      setIsLoadingBids(true);
      try {
        // Get contract ETH balance (actual funds deposited)
        const balance = await publicClient.getBalance({
          address: auctionAddress as `0x${string}`,
        });
        console.log(`[ParticipatePage] Contract balance: ${formatEther(balance)} ETH (raw: ${balance.toString()})`);
        setContractBalance(balance);

        // Get nextBidId to know total bids
        const nextBidId = await publicClient.readContract({
          address: auctionAddress as `0x${string}`,
          abi: CCA_AUCTION_ABI,
          functionName: 'nextBidId',
        }) as bigint;

        setTotalBids(Number(nextBidId));

        // Iterate through all bids to find user bids and highest active bid
        let maxBidPrice = 0n;
        const userBidsList: UserBid[] = [];

        for (let bidId = 0n; bidId < nextBidId; bidId++) {
          try {
            const bidData = await publicClient.readContract({
              address: auctionAddress as `0x${string}`,
              abi: CCA_AUCTION_ABI,
              functionName: 'bids',
              args: [bidId],
            }) as Bid;

            // Track highest active bid price
            if (bidData.exitedBlock === 0n && bidData.maxPrice > maxBidPrice) {
              maxBidPrice = bidData.maxPrice;
            }

            // Check if this bid belongs to connected user
            if (address && bidData.owner.toLowerCase() === address.toLowerCase()) {
              // Calculate amount from amountQ96
              const amountWei = bidData.amountQ96 / (2n ** 96n);
              userBidsList.push({
                bidId,
                amount: amountWei,
                maxPrice: bidData.maxPrice,
                tokensFilled: bidData.tokensFilled,
                isExited: bidData.exitedBlock > 0n,
              });
            }
          } catch (bidError) {
            console.error(`Error reading bid #${bidId}:`, bidError);
          }
        }

        console.log(`[ParticipatePage] Found ${userBidsList.length} user bids out of ${nextBidId.toString()} total`);
        setUserBids(userBidsList);
        setHighestBidPrice(maxBidPrice > 0n ? maxBidPrice : null);
        console.log(`[ParticipatePage] Highest active bid price: ${maxBidPrice > 0n ? formatEther(maxBidPrice) + ' ETH' : 'none'}`);

      } catch (error) {
        console.error('Error fetching bids:', error);
        setHighestBidPrice(null);
      } finally {
        setIsLoadingBids(false);
      }
    }

    fetchBids();
    // Also set up an interval to periodically refresh bids and balance
    const intervalId = setInterval(fetchBids, 15000); // Every 15 seconds
    return () => clearInterval(intervalId);
  }, [publicClient, address, auctionAddress, isBidSuccess, isExitSuccess, isClaimSuccess]);

  // Handle bid submission
  const handleSubmitBid = () => {
    if (!bidAmount || !maxPrice || !isConnected) return;

    const bidAmountWei = parseEther(bidAmount);
    const maxPriceWei = parseEther(maxPrice);

    // Validate that max price is high enough
    if (highestBidPrice && maxPriceWei <= highestBidPrice) {
      alert(`Your max price must be higher than the current highest bid (${formatEther(highestBidPrice)} ETH)`);
      return;
    }

    // The prevTickPrice should be:
    // - floorPrice when no existing bids (empty orderbook uses floorPrice as anchor)
    // - The highest existing active bid price when bids exist
    const prevTickPrice = highestBidPrice || floorPrice || 0n;

    console.log('[submitBid] Debug info:', {
      bidAmount,
      maxPrice,
      bidAmountWei: bidAmountWei.toString(),
      maxPriceWei: maxPriceWei.toString(),
      prevTickPrice: prevTickPrice.toString(),
    });

    // Note: amount is passed as raw wei (uint128), NOT Q96 format
    // The contract internally converts to Q96 when storing the bid
    submitBid({
      address: auctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'submitBid',
      args: [maxPriceWei, bidAmountWei, address!, prevTickPrice, '0x' as `0x${string}`],
      value: bidAmountWei,
    });
  };

  // Handle bid exit
  const handleExitBid = (bidId: bigint) => {
    exitBid({
      address: auctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'exitBid',
      args: [bidId],
    });
  };

  // Handle claim tokens
  const handleClaimTokens = (bidId: bigint) => {
    claimTokens({
      address: auctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'claimTokens',
      args: [bidId],
    });
  };

  // Refetch data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refetchAuction();
    }, 12000); // Every block (~12 seconds)
    return () => clearInterval(interval);
  }, [refetchAuction]);

  return (
    <div className={`min-h-screen ${theme.backgroundColor}`}>
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {theme.projectLogo && (
                <img src={theme.projectLogo} alt={theme.projectName} className="h-10 w-10 rounded-full" />
              )}
              <div>
                <h1 className={`text-xl font-bold ${theme.textPrimary}`}>{theme.projectName}</h1>
                {tokenSymbol && (
                  <span className={`text-sm ${theme.textSecondary}`}>${tokenSymbol}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Social Links */}
              <div className="hidden sm:flex items-center gap-2">
                {theme.website && (
                  <a href={theme.website} target="_blank" rel="noopener noreferrer"
                     className={`p-2 rounded-lg ${theme.textSecondary} hover:${theme.textPrimary}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </a>
                )}
                {theme.twitter && (
                  <a href={theme.twitter} target="_blank" rel="noopener noreferrer"
                     className={`p-2 rounded-lg ${theme.textSecondary} hover:${theme.textPrimary}`}>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                )}
                {theme.discord && (
                  <a href={theme.discord} target="_blank" rel="noopener noreferrer"
                     className={`p-2 rounded-lg ${theme.textSecondary} hover:${theme.textPrimary}`}>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </a>
                )}
              </div>
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="mb-4">
            <StatusBadge status={auctionStatus} theme={theme} />
          </div>
          <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${theme.textPrimary}`}>
            {theme.heroTitle}
          </h2>
          <p className={`text-xl ${theme.textSecondary} max-w-2xl mx-auto mb-4`}>
            {theme.heroSubtitle}
          </p>

          {/* How CCA Works Button */}
          <button
            onClick={() => setShowCCAInfo(!showCCAInfo)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 ${theme.textSecondary} hover:${theme.textPrimary} transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How does CCA work?
          </button>
        </div>

        {/* CCA Explanation Section */}
        {showCCAInfo && (
          <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6 mb-8 border-2 border-indigo-200 dark:border-indigo-800`}>
            <div className="flex justify-between items-start mb-4">
              <h3 className={`text-xl font-bold ${theme.textPrimary}`}>
                Understanding Continuous Clearing Auctions
              </h3>
              <button
                onClick={() => setShowCCAInfo(false)}
                className={`p-1 rounded-lg ${theme.textSecondary} hover:${theme.textPrimary}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={`space-y-4 ${theme.textSecondary}`}>
              <div>
                <h4 className={`font-semibold ${theme.textPrimary} mb-2`}>🎯 Fair Price Discovery</h4>
                <p>
                  CCA eliminates timing games and encourages early participation. The clearing price adjusts continuously
                  based on demand, ensuring everyone pays the same fair price for tokens.
                </p>
              </div>

              <div>
                <h4 className={`font-semibold ${theme.textPrimary} mb-2`}>💰 How Bidding Works</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Set Your Max Price:</strong> The maximum you're willing to pay per token</li>
                  <li><strong>Submit ETH:</strong> The amount you want to invest</li>
                  <li><strong>Dynamic Allocation:</strong> You receive tokens at the final clearing price (likely lower than your max)</li>
                  <li><strong>Refunds:</strong> Any unused ETH is automatically refunded when you claim</li>
                </ul>
              </div>

              <div>
                <h4 className={`font-semibold ${theme.textPrimary} mb-2`}>📊 Clearing Price</h4>
                <p>
                  The clearing price starts at the floor price and increases as more bids come in. It represents
                  the current market-clearing price where supply meets demand. Everyone who bid above this price
                  gets tokens at this price.
                </p>
              </div>

              <div>
                <h4 className={`font-semibold ${theme.textPrimary} mb-2`}>🔄 Price Updates</h4>
                <p>
                  The clearing price updates continuously throughout the auction as new bids are submitted.
                  Watch the "Current Price" metric to see real-time market demand.
                </p>
              </div>

              <div>
                <h4 className={`font-semibold ${theme.textPrimary} mb-2`}>✅ Claiming Your Tokens</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>After the auction ends, there's a claim period</li>
                  <li>Exit your bid first to calculate your final allocation</li>
                  <li>Then claim your tokens at the final clearing price</li>
                  <li>Any overpayment is refunded automatically</li>
                </ul>
              </div>

              <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                <p className="text-sm">
                  <strong>💡 Pro Tip:</strong> Bid early with your maximum acceptable price. The final price
                  is determined by market demand, so you'll likely pay less than your max price while securing
                  your allocation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timer Section */}
        {theme.showTimer && currentBlock && (
          <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6 mb-8`}>
            {auctionStatus === 'pending' && startBlock && (
              <CountdownTimer
                targetBlock={startBlock}
                currentBlock={currentBlock}
                label="Auction starts in"
              />
            )}
            {auctionStatus === 'active' && endBlock && (
              <CountdownTimer
                targetBlock={endBlock}
                currentBlock={currentBlock}
                label="Auction ends in"
              />
            )}
            {auctionStatus === 'ended' && claimBlock && (
              <CountdownTimer
                targetBlock={claimBlock}
                currentBlock={currentBlock}
                label="Claims open in"
              />
            )}
            {auctionStatus === 'claimable' && (
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <div className={`text-2xl font-bold ${isGraduated ? 'text-green-600' : 'text-red-600'}`}>
                  {isGraduated ? 'Claims are open!' : 'Auction Failed - Refunds Available'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Failed Auction Warning Banner */}
        {(auctionStatus === 'ended' || auctionStatus === 'claimable') && isGraduated === false && (
          <div className="mb-8 p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-2xl">
            <div className="flex items-start gap-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className={`text-xl font-bold text-red-800 dark:text-red-300`}>
                  Auction Did Not Graduate
                </h3>
                <p className="text-red-700 dark:text-red-400 mt-2">
                  This auction did not meet its fundraising requirements. All bidders receive <strong>full ETH refunds</strong> - no tokens are distributed.
                </p>
                <p className="text-sm text-red-600 dark:text-red-500 mt-3">
                  Currency raised: {currencyRaised ? formatEther(currencyRaised) : '0'} ETH
                  {requiredCurrencyRaised && requiredCurrencyRaised > 0n && (
                    <> • Required: {formatEther(requiredCurrencyRaised)} ETH</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Auction Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress */}
            {theme.showProgressBar && currencyRaised !== undefined && requiredCurrencyRaised !== undefined && (
              <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6`}>
                <h3 className={`text-lg font-semibold mb-4 ${theme.textPrimary}`}>Funding Progress</h3>
                <ProgressBar raised={currencyRaised} goal={requiredCurrencyRaised} theme={theme} />
              </div>
            )}

            {/* Current Clearing Price - Prominent Display */}
            {auctionStatus === 'active' && clearingPrice !== undefined && (
              <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6 border-2 ${theme.primaryColor.replace('bg-', 'border-')}`}>
                <div className="text-center">
                  <div className={`text-sm ${theme.textSecondary} mb-2`}>Current Clearing Price</div>
                  <div className={`text-4xl font-bold ${theme.textPrimary} mb-2`}>
                    {formatEther(clearingPrice)} ETH
                  </div>
                  <div className={`text-sm ${theme.textSecondary}`}>
                    per token • Updates every ~12 seconds
                  </div>
                  {floorPrice && clearingPrice > floorPrice && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      {((Number(clearingPrice - floorPrice) / Number(floorPrice)) * 100).toFixed(1)}% above floor
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6`}>
              <h3 className={`text-lg font-semibold mb-4 ${theme.textPrimary}`}>Auction Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Token</div>
                  <div className={`text-lg font-bold ${theme.textPrimary}`}>
                    {tokenSymbol || '---'}
                  </div>
                </div>
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Total Supply</div>
                  <div className={`text-lg font-bold ${theme.textPrimary}`}>
                    {totalSupply ? formatNumber(Number(formatEther(totalSupply))) : '---'}
                  </div>
                </div>
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Floor Price</div>
                  <div className={`text-lg font-bold ${theme.textPrimary}`}>
                    {floorPrice ? `${formatEther(floorPrice)}` : '---'}
                  </div>
                  <div className={`text-xs ${theme.textSecondary}`}>ETH/token</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Total Bids</div>
                  <div className={`text-lg font-bold ${theme.textPrimary}`}>
                    {totalBids || '0'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Total Deposited</div>
                  <div className={`text-lg font-bold ${theme.textPrimary}`}>
                    {contractBalance !== null ? `${Number(formatEther(contractBalance)).toFixed(4)}` : '---'}
                  </div>
                  <div className={`text-xs ${theme.textSecondary}`}>ETH</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>
                    {isGraduated ? 'Tokens Distributed' : 'Tokens Cleared'}
                  </div>
                  <div className={`text-lg font-bold ${isGraduated === false ? 'text-gray-400' : theme.textPrimary}`}>
                    {totalCleared ? formatNumber(Number(formatEther(totalCleared))) : '0'}
                  </div>
                  <div className={`text-xs ${isGraduated === false ? 'text-red-500' : theme.textSecondary}`}>
                    {isGraduated === false
                      ? 'Not distributed'
                      : totalSupply && totalCleared
                        ? `${((Number(totalCleared) / Number(totalSupply)) * 100).toFixed(1)}%`
                        : ''}
                  </div>
                </div>
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Avg. Price</div>
                  <div className={`text-lg font-bold ${theme.textPrimary}`}>
                    {contractBalance && totalCleared && totalCleared > 0n
                      ? `${(Number(formatEther(contractBalance)) / Number(formatEther(totalCleared))).toFixed(6)}`
                      : '---'}
                  </div>
                  <div className={`text-xs ${theme.textSecondary}`}>ETH/token</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className={`text-sm ${theme.textSecondary}`}>Graduation</div>
                  <div className={`text-lg font-bold ${isGraduated ? 'text-green-600' : theme.textPrimary}`}>
                    {isGraduated === undefined ? '---' : isGraduated ? '✓ Yes' : '✗ No'}
                  </div>
                  {requiredCurrencyRaised && requiredCurrencyRaised > 0n && (
                    <div className={`text-xs ${theme.textSecondary}`}>
                      Min: {formatEther(requiredCurrencyRaised)} ETH
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Your Bids Section */}
            {theme.showYourBids && isConnected && (
              <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6`}>
                <h3 className={`text-lg font-semibold mb-4 ${theme.textPrimary}`}>Your Bids</h3>
                {isLoadingBids ? (
                  <div className={`text-center py-8 ${theme.textSecondary}`}>Loading your bids...</div>
                ) : userBids.length === 0 ? (
                  <div className={`text-center py-8 ${theme.textSecondary}`}>
                    You haven't placed any bids yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userBids.map((bid) => (
                      <div key={bid.bidId.toString()}
                           className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                        <div>
                          <div className={`font-medium ${theme.textPrimary}`}>
                            Bid #{bid.bidId.toString()}
                          </div>
                          <div className={`text-sm ${theme.textSecondary}`}>
                            {formatEther(bid.amount)} ETH @ {formatEther(bid.maxPrice)} max price
                          </div>
                          {bid.tokensFilled > 0n && (
                            <div className="text-sm text-green-600">
                              {formatEther(bid.tokensFilled)} tokens filled
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!bid.isExited && auctionStatus === 'active' && (
                            <button
                              onClick={() => handleExitBid(bid.bidId)}
                              disabled={isExitPending || isExitConfirming}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg text-sm"
                            >
                              {isExitPending || isExitConfirming ? 'Exiting...' : 'Exit'}
                            </button>
                          )}
                          {bid.isExited && auctionStatus === 'claimable' && bid.tokensFilled > 0n && (
                            <button
                              onClick={() => handleClaimTokens(bid.bidId)}
                              disabled={isClaimPending || isClaimConfirming}
                              className={`px-4 py-2 ${theme.primaryColor} ${theme.primaryHover} disabled:bg-gray-400 text-white rounded-lg text-sm`}
                            >
                              {isClaimPending || isClaimConfirming ? 'Claiming...' : 'Claim'}
                            </button>
                          )}
                          {bid.isExited && !bid.tokensFilled && (
                            <span className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm">
                              Exited
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Bid Form */}
          <div className="lg:col-span-1">
            <div className={`${theme.cardBackground} rounded-2xl shadow-lg p-6 sticky top-24`}>
              <h3 className={`text-lg font-semibold mb-4 ${theme.textPrimary}`}>Place a Bid</h3>

              {!isConnected ? (
                <div className="text-center py-8">
                  <p className={`${theme.textSecondary} mb-4`}>Connect your wallet to participate</p>
                  <ConnectButton />
                </div>
              ) : auctionStatus !== 'active' ? (
                <div className={`text-center py-8 ${theme.textSecondary}`}>
                  {auctionStatus === 'pending' && 'Auction has not started yet.'}
                  {auctionStatus === 'ended' && 'Auction has ended. Wait for claims to open.'}
                  {auctionStatus === 'claimable' && 'Auction has ended. You can now claim your tokens.'}
                  {auctionStatus === 'inactive' && 'Auction is not active.'}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${theme.textPrimary}`}>
                      Bid Amount (ETH)
                    </label>
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="0.1"
                      step="any"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <p className={`text-xs mt-1 ${theme.textSecondary}`}>
                      Amount of ETH you want to bid
                    </p>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${theme.textPrimary}`}>
                      Max Price per Token (ETH)
                    </label>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder={clearingPrice ? formatEther(clearingPrice) : '0.001'}
                      step="any"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <p className={`text-xs mt-1 ${theme.textSecondary}`}>
                      Maximum price you're willing to pay per token
                    </p>
                  </div>

                  {/* Minimum bid price warning */}
                  {highestBidPrice && highestBidPrice > 0n && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                      <p className={`text-sm text-amber-800 dark:text-amber-300`}>
                        <strong>Minimum bid price:</strong>{' '}
                        {formatEther(highestBidPrice + (tickSpacing || 0n))} ETH per token
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Your max price must be higher than the current highest bid ({formatEther(highestBidPrice)} ETH)
                      </p>
                    </div>
                  )}

                  {/* Estimate */}
                  {bidAmount && maxPrice && (
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                      <div className={`text-sm ${theme.textSecondary}`}>Estimated tokens</div>
                      <div className={`text-xl font-bold ${theme.textPrimary}`}>
                        ~{(parseFloat(bidAmount) / parseFloat(maxPrice)).toLocaleString()} {tokenSymbol || 'tokens'}
                      </div>
                      {highestBidPrice && parseEther(maxPrice) <= highestBidPrice && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1 font-medium">
                          Warning: Your max price is too low. Bid will fail.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Error display */}
                  {bidError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {bidError.message}
                      </p>
                    </div>
                  )}

                  {/* Success display */}
                  {isBidSuccess && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Bid submitted successfully!
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSubmitBid}
                    disabled={!bidAmount || !maxPrice || isBidPending || isBidConfirming}
                    className={`w-full ${theme.primaryColor} ${theme.primaryHover} disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-xl transition-colors text-lg`}
                  >
                    {isBidPending
                      ? 'Waiting for approval...'
                      : isBidConfirming
                      ? 'Submitting bid...'
                      : 'Submit Bid'}
                  </button>

                  <p className={`text-xs text-center ${theme.textSecondary}`}>
                    By bidding, you agree to participate in a fair-price auction.
                    Your final price may be lower than your max price.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contract Info Footer */}
        <div className="mt-12 text-center">
          <div className={`inline-block ${theme.cardBackground} rounded-xl px-6 py-3`}>
            <span className={`text-sm ${theme.textSecondary}`}>Auction Contract: </span>
            <a
              href={`https://sepolia.etherscan.io/address/${auctionAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
            >
              {formatAddress(auctionAddress)}
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className={`text-sm ${theme.textSecondary}`}>
              Powered by <span className="font-semibold">Uniswap CCA</span>
            </div>
            <div className={`text-sm ${theme.textSecondary}`}>
              Built with CCA Minimal
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

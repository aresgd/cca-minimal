'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBlockNumber } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { CCA_AUCTION_ABI, ERC20_ABI } from '@/lib/cca-abi';

// Bid type from contract
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

type AuctionStatus = 'pending' | 'active' | 'ended' | 'claimable' | 'inactive';

function getAuctionStatus(
  activated: boolean,
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

function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Countdown component
function Countdown({ targetBlock, currentBlock, label }: {
  targetBlock: bigint;
  currentBlock: bigint;
  label: string;
}) {
  const blocksRemaining = targetBlock > currentBlock ? Number(targetBlock - currentBlock) : 0;
  const secondsRemaining = blocksRemaining * 12;

  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div className="text-center">
      <div className="text-sm text-gray-400 mb-2">{label}</div>
      <div className="flex justify-center gap-3">
        {days > 0 && (
          <div className="bg-gray-800 rounded-lg px-4 py-2">
            <div className="text-2xl font-bold text-white">{days}</div>
            <div className="text-xs text-gray-400">Days</div>
          </div>
        )}
        <div className="bg-gray-800 rounded-lg px-4 py-2">
          <div className="text-2xl font-bold text-white">{hours.toString().padStart(2, '0')}</div>
          <div className="text-xs text-gray-400">Hours</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-2">
          <div className="text-2xl font-bold text-white">{minutes.toString().padStart(2, '0')}</div>
          <div className="text-xs text-gray-400">Mins</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-2">
          <div className="text-2xl font-bold text-white">{seconds.toString().padStart(2, '0')}</div>
          <div className="text-xs text-gray-400">Secs</div>
        </div>
      </div>
    </div>
  );
}

// Progress bar with gradient
function SaleProgress({ raised, goal, percentage }: { raised: string; goal: string; percentage: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">Progress</span>
        <span className="text-white font-medium">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{raised} ETH raised</span>
        <span>Goal: {goal} ETH</span>
      </div>
    </div>
  );
}

export default function ParticipateStyledPage() {
  const params = useParams();
  const auctionAddress = params.address as string;

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Form state
  const [bidAmount, setBidAmount] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [userBids, setUserBids] = useState<UserBid[]>([]);
  const [isLoadingBids, setIsLoadingBids] = useState(false);
  const [totalBids, setTotalBids] = useState<number>(0);
  const [highestBidPrice, setHighestBidPrice] = useState<bigint | null>(null);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);
  const [allBidPrices, setAllBidPrices] = useState<{price: bigint, amount: bigint}[]>([]);

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

  const activated = totalSupply !== undefined && totalSupply > 0n;

  // Read token info
  const { data: tokenData } = useReadContracts({
    contracts: [
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'name' },
      { address: tokenAddress!, abi: ERC20_ABI, functionName: 'symbol' },
    ],
    query: { enabled: !!tokenAddress },
  });

  const tokenName = tokenData?.[0]?.result as string | undefined;
  const tokenSymbol = tokenData?.[1]?.result as string | undefined;

  const auctionStatus = getAuctionStatus(activated, startBlock, endBlock, claimBlock, currentBlock);

  // Fetch bids
  useEffect(() => {
    async function fetchBids() {
      if (!publicClient || !auctionAddress) return;

      if (isBidSuccess || isExitSuccess || isClaimSuccess) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      setIsLoadingBids(true);
      try {
        const balance = await publicClient.getBalance({
          address: auctionAddress as `0x${string}`,
        });
        setContractBalance(balance);

        const nextBidId = await publicClient.readContract({
          address: auctionAddress as `0x${string}`,
          abi: CCA_AUCTION_ABI,
          functionName: 'nextBidId',
        }) as bigint;

        setTotalBids(Number(nextBidId));

        let maxBidPrice = 0n;
        const userBidsList: UserBid[] = [];
        const activeBidPrices: {price: bigint, amount: bigint}[] = [];

        for (let bidId = 0n; bidId < nextBidId; bidId++) {
          try {
            const bidData = await publicClient.readContract({
              address: auctionAddress as `0x${string}`,
              abi: CCA_AUCTION_ABI,
              functionName: 'bids',
              args: [bidId],
            }) as Bid;

            if (bidData.exitedBlock === 0n) {
              if (bidData.maxPrice > maxBidPrice) maxBidPrice = bidData.maxPrice;
              const amountWei = bidData.amountQ96 / (2n ** 96n);
              activeBidPrices.push({ price: bidData.maxPrice, amount: amountWei });
            }

            if (address && bidData.owner.toLowerCase() === address.toLowerCase()) {
              const amountWei = bidData.amountQ96 / (2n ** 96n);
              userBidsList.push({
                bidId,
                amount: amountWei,
                maxPrice: bidData.maxPrice,
                tokensFilled: bidData.tokensFilled,
                isExited: bidData.exitedBlock > 0n,
              });
            }
          } catch {}
        }

        setUserBids(userBidsList);
        setHighestBidPrice(maxBidPrice > 0n ? maxBidPrice : null);
        setAllBidPrices(activeBidPrices);
      } catch {}
      setIsLoadingBids(false);
    }

    fetchBids();
    const intervalId = setInterval(fetchBids, 15000);
    return () => clearInterval(intervalId);
  }, [publicClient, address, auctionAddress, isBidSuccess, isExitSuccess, isClaimSuccess]);

  // Handlers
  const handleSubmitBid = () => {
    if (!bidAmount || !maxPrice || !isConnected) return;

    const bidAmountWei = parseEther(bidAmount);
    const maxPriceWei = parseEther(maxPrice);
    const prevTickPrice = highestBidPrice || floorPrice || 0n;

    submitBid({
      address: auctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'submitBid',
      args: [maxPriceWei, bidAmountWei, address!, prevTickPrice, '0x' as `0x${string}`],
      value: bidAmountWei,
    });
  };

  const handleExitBid = (bidId: bigint) => {
    exitBid({
      address: auctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'exitBid',
      args: [bidId],
    });
  };

  const handleClaimTokens = (bidId: bigint) => {
    claimTokens({
      address: auctionAddress as `0x${string}`,
      abi: CCA_AUCTION_ABI,
      functionName: 'claimTokens',
      args: [bidId],
    });
  };

  // Calculate progress
  const progressPercentage = requiredCurrencyRaised && requiredCurrencyRaised > 0n && contractBalance
    ? Number((contractBalance * 100n) / requiredCurrencyRaised)
    : 0;

  // Status badge
  const statusConfig = {
    inactive: { label: 'Not Active', color: 'bg-gray-500' },
    pending: { label: 'Upcoming', color: 'bg-yellow-500' },
    active: { label: 'Live', color: 'bg-green-500 animate-pulse' },
    ended: { label: 'Ended', color: 'bg-blue-500' },
    claimable: { label: 'Claimable', color: 'bg-purple-500' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700/50 backdrop-blur-xl bg-gray-900/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <span className="text-white font-bold text-xl">CCA Launchpad</span>
            </Link>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="relative mb-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-3xl" />
          <div className="relative bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-8">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Token Info */}
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <span className="text-white font-bold text-2xl">{tokenSymbol?.[0] || '?'}</span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">{tokenName || 'Token Sale'}</h1>
                    <p className="text-gray-400">{tokenSymbol || '---'}</p>
                  </div>
                  <span className={`ml-4 px-3 py-1 rounded-full text-xs font-medium text-white ${statusConfig[auctionStatus].color}`}>
                    {statusConfig[auctionStatus].label}
                  </span>
                </div>
                <p className="text-gray-300 mb-6 max-w-2xl">
                  Participate in this Continuous Clearing Auction. Bid with your maximum acceptable price - you'll pay the final clearing price, which is typically lower.
                </p>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-gray-400 text-sm mb-1">Total Supply</div>
                    <div className="text-white font-bold text-lg">
                      {totalSupply ? formatNumber(Number(formatEther(totalSupply))) : '---'}
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-gray-400 text-sm mb-1">Floor Price</div>
                    <div className="text-white font-bold text-lg">
                      {floorPrice ? formatEther(floorPrice) : '---'} ETH
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-gray-400 text-sm mb-1">Total Bids</div>
                    <div className="text-white font-bold text-lg">{totalBids}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-gray-400 text-sm mb-1">Deposited</div>
                    <div className="text-white font-bold text-lg">
                      {contractBalance ? Number(formatEther(contractBalance)).toFixed(4) : '0'} ETH
                    </div>
                  </div>
                </div>
              </div>

              {/* Timer */}
              {currentBlock && (
                <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50 min-w-[300px]">
                  {auctionStatus === 'pending' && startBlock && (
                    <Countdown targetBlock={startBlock} currentBlock={currentBlock} label="Sale Starts In" />
                  )}
                  {auctionStatus === 'active' && endBlock && (
                    <Countdown targetBlock={endBlock} currentBlock={currentBlock} label="Sale Ends In" />
                  )}
                  {auctionStatus === 'ended' && claimBlock && (
                    <Countdown targetBlock={claimBlock} currentBlock={currentBlock} label="Claims Open In" />
                  )}
                  {auctionStatus === 'claimable' && (
                    <div className="text-center">
                      <div className="text-4xl mb-2">{isGraduated ? '🎉' : '⚠️'}</div>
                      <div className={`text-xl font-bold ${isGraduated ? 'text-green-400' : 'text-red-400'}`}>
                        {isGraduated ? 'Sale Successful!' : 'Sale Failed'}
                      </div>
                      <div className="text-gray-400 text-sm mt-1">
                        {isGraduated ? 'Claim your tokens now' : 'Get your refund'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Price Banner */}
        {auctionStatus === 'active' && clearingPrice !== undefined && clearingPrice > 0n && (
          <div className="mb-8 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-cyan-400 text-sm mb-1">Current Clearing Price</div>
                <div className="text-4xl font-bold text-white">{formatEther(clearingPrice)} ETH</div>
                <div className="text-gray-400 text-sm mt-1">per token</div>
              </div>
              {floorPrice && clearingPrice > floorPrice && (
                <div className="text-right">
                  <div className="text-green-400 text-2xl font-bold">
                    +{((Number(clearingPrice - floorPrice) / Number(floorPrice)) * 100).toFixed(1)}%
                  </div>
                  <div className="text-gray-400 text-sm">above floor</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Funding Progress</h3>
              <SaleProgress
                raised={contractBalance ? Number(formatEther(contractBalance)).toFixed(4) : '0'}
                goal={requiredCurrencyRaised ? formatEther(requiredCurrencyRaised) : '0'}
                percentage={progressPercentage}
              />

              {/* Additional metrics */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center p-3 bg-gray-900/50 rounded-xl">
                  <div className="text-gray-400 text-xs mb-1">Min. Raise</div>
                  <div className="text-white font-medium">
                    {requiredCurrencyRaised ? formatEther(requiredCurrencyRaised) : '0'} ETH
                  </div>
                </div>
                <div className="text-center p-3 bg-gray-900/50 rounded-xl">
                  <div className="text-gray-400 text-xs mb-1">Tokens Cleared</div>
                  <div className="text-white font-medium">
                    {totalCleared ? formatNumber(Number(formatEther(totalCleared))) : '0'}
                  </div>
                </div>
                <div className="text-center p-3 bg-gray-900/50 rounded-xl">
                  <div className="text-gray-400 text-xs mb-1">Graduation</div>
                  <div className={`font-medium ${isGraduated === true ? 'text-green-400' : isGraduated === false ? 'text-red-400' : 'text-gray-400'}`}>
                    {isGraduated === undefined ? 'Pending' : isGraduated ? 'Success' : 'Failed'}
                  </div>
                </div>
              </div>
            </div>

            {/* Your Bids */}
            {isConnected && (
              <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Your Bids</h3>
                {isLoadingBids ? (
                  <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : userBids.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No bids placed yet</div>
                ) : (
                  <div className="space-y-3">
                    {userBids.map((bid) => {
                      const canExit = !bid.isExited && ['active', 'ended', 'claimable'].includes(auctionStatus);
                      const canClaim = bid.isExited && auctionStatus === 'claimable' && isGraduated && bid.tokensFilled > 0n;

                      return (
                        <div key={bid.bidId.toString()} className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-white font-medium">Bid #{bid.bidId.toString()}</div>
                              <div className="text-gray-400 text-sm">
                                {formatEther(bid.amount)} ETH @ {formatEther(bid.maxPrice)} max
                              </div>
                              {bid.tokensFilled > 0n && (
                                <div className="text-cyan-400 text-sm mt-1">
                                  {formatEther(bid.tokensFilled)} tokens {bid.isExited ? 'allocated' : 'filled'}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {canExit && (
                                <button
                                  onClick={() => handleExitBid(bid.bidId)}
                                  disabled={isExitPending || isExitConfirming}
                                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-lg text-sm disabled:opacity-50"
                                >
                                  {isExitPending || isExitConfirming ? 'Processing...' : 'Exit'}
                                </button>
                              )}
                              {canClaim && (
                                <button
                                  onClick={() => handleClaimTokens(bid.bidId)}
                                  disabled={isClaimPending || isClaimConfirming}
                                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                                >
                                  {isClaimPending || isClaimConfirming ? 'Claiming...' : 'Claim'}
                                </button>
                              )}
                              {bid.isExited && !canClaim && (
                                <span className="px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg text-sm">
                                  {isGraduated === false ? 'Refunded' : 'Exited'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sale Details */}
            <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Sale Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-700/50">
                  <span className="text-gray-400">Token Address</span>
                  <a
                    href={`https://sepolia.etherscan.io/address/${tokenAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {tokenAddress ? formatAddress(tokenAddress) : '---'}
                  </a>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-700/50">
                  <span className="text-gray-400">Auction Address</span>
                  <a
                    href={`https://sepolia.etherscan.io/address/${auctionAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {formatAddress(auctionAddress)}
                  </a>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-700/50">
                  <span className="text-gray-400">Start Block</span>
                  <span className="text-white">{startBlock?.toString() || '---'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-700/50">
                  <span className="text-gray-400">End Block</span>
                  <span className="text-white">{endBlock?.toString() || '---'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-700/50">
                  <span className="text-gray-400">Claim Block</span>
                  <span className="text-white">{claimBlock?.toString() || '---'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-700/50">
                  <span className="text-gray-400">Current Block</span>
                  <span className="text-white">{currentBlock?.toString() || '---'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Bid Form */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6 sticky top-24">
              <h3 className="text-lg font-semibold text-white mb-4">Place a Bid</h3>

              {!isConnected ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">Connect wallet to participate</p>
                  <ConnectButton />
                </div>
              ) : auctionStatus !== 'active' ? (
                <div className="text-center py-8 text-gray-400">
                  {auctionStatus === 'pending' && 'Sale has not started yet'}
                  {auctionStatus === 'ended' && 'Sale has ended'}
                  {auctionStatus === 'claimable' && 'Sale ended - claim your tokens'}
                  {auctionStatus === 'inactive' && 'Sale is not active'}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Bid Amount (ETH)</label>
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="0.1"
                      step="any"
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-white placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Max Price per Token (ETH)</label>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder={clearingPrice ? formatEther(clearingPrice) : '0.001'}
                      step="any"
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-white placeholder-gray-500"
                    />
                  </div>

                  {bidAmount && maxPrice && (
                    <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700/50">
                      <div className="text-gray-400 text-sm">Estimated tokens</div>
                      <div className="text-2xl font-bold text-white">
                        ~{(parseFloat(bidAmount) / parseFloat(maxPrice)).toLocaleString()} {tokenSymbol || 'tokens'}
                      </div>
                    </div>
                  )}

                  {bidError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                      {bidError.message?.includes('user rejected') ? 'Transaction rejected' : 'Transaction failed'}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitBid}
                    disabled={!bidAmount || !maxPrice || isBidPending || isBidConfirming}
                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold rounded-xl transition-all"
                  >
                    {isBidPending || isBidConfirming ? 'Processing...' : 'Place Bid'}
                  </button>

                  {isBidSuccess && (
                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm text-center">
                      Bid placed successfully!
                    </div>
                  )}
                </div>
              )}

              {/* Info box */}
              <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
                <div className="text-cyan-400 text-sm font-medium mb-2">How it works</div>
                <ul className="text-gray-400 text-xs space-y-1">
                  <li>1. Set your maximum acceptable price</li>
                  <li>2. Everyone pays the same clearing price</li>
                  <li>3. Lower bids are filled first</li>
                  <li>4. Overpayment is refunded</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700/50 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          Powered by Uniswap CCA | Built with CCA Minimal
        </div>
      </footer>
    </div>
  );
}

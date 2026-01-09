import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              CCA Minimal
            </h1>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Uniswap Continuous Clearing Auctions
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Create fair token launches or participate in ongoing auctions
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Create Auction Card */}
          <Link href="/create">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-indigo-500">
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-indigo-600 dark:text-indigo-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Create Auction
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Launch your token with fair price discovery and automatic
                  liquidity bootstrapping
                </p>
              </div>
            </div>
          </Link>

          {/* Participate Card */}
          <Link href="/auctions">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-green-500">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Participate
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Browse active auctions and place bids to acquire tokens at
                  fair prices
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* Info Section */}
        <div className="mt-16 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            How it works
          </h3>
          <div className="space-y-4 text-gray-600 dark:text-gray-300">
            <div className="flex items-start">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-3">
                1.
              </span>
              <p>
                <strong>Create an Auction:</strong> Set your token supply,
                floor price, and duration
              </p>
            </div>
            <div className="flex items-start">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-3">
                2.
              </span>
              <p>
                <strong>Participants Bid:</strong> Users submit bids with their
                desired amount and max price
              </p>
            </div>
            <div className="flex items-start">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-3">
                3.
              </span>
              <p>
                <strong>Price Discovery:</strong> The clearing price is
                continuously calculated based on all active bids
              </p>
            </div>
            <div className="flex items-start">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-3">
                4.
              </span>
              <p>
                <strong>Automatic Liquidity:</strong> When the auction ends, all
                proceeds seed a Uniswap v4 pool at the final price
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

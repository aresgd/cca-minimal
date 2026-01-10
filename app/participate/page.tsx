'use client';

/**
 * This is an alternate auction participation page that uses nextBidId iteration
 * instead of event filtering to fetch user bids. This approach is more reliable
 * when event logs are not available or RPC providers have restrictions.
 */

export { default } from '../auctions/page';

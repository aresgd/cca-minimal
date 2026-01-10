# Debugging Bid Display Issues

## Console Logs to Check

Open the browser console and look for these log messages:

1. `[BidFetch] Found X BidSubmitted events for user ADDRESS`
2. `[BidFetch] Event logs:` - shows the events found
3. `[BidFetch] Bid #X data:` - shows the bid data for each bid
4. `[BidFetch] Successfully loaded X bids`

## Common Issues

### Issue 1: No events found (logs show 0 events)

**Cause**: The wallet address connected doesn't match the address that placed the bid.

**Solution**:
- Check that you're connected with address: `0x35De239f3b2E7D251dD11ee21B06295ab7309b55`
- This is the address that placed bid #0 on the auction

### Issue 2: Events found but bids array is empty

**Cause**: The `bids()` function call is failing or returning invalid data.

**Check**:
- Look for error messages like `[BidFetch] Error reading bid #X:`
- The bid struct might not match the ABI

### Issue 3: totalCleared shows 0

**Cause**: The auction hasn't been checkpointed yet, or no bids have filled.

**Solution**:
- Call `checkpoint()` on the auction contract to update totalCleared
- This happens automatically during bidding, but might need manual call

## Manual Test

Open browser console and run:

```javascript
// Check your connected address
console.log('Connected:', window.ethereum?.selectedAddress);

// Expected bidder address
console.log('Expected:', '0x35De239f3b2E7D251dD11ee21B06295ab7309b55');

// Check if they match (case-insensitive)
console.log('Match:', window.ethereum?.selectedAddress?.toLowerCase() === '0x35De239f3b2E7D251dD11ee21B06295ab7309b55'.toLowerCase());
```

## Next Steps

If console logs show:
- **0 events found**: Wrong wallet connected
- **Events found, error reading bid**: ABI mismatch or contract issue
- **Events found, bids loaded successfully**: UI rendering issue

Check the console logs and report back what you see.

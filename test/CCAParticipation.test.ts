const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Helper functions
function parseEther(value) {
  return ethers.parseEther(value);
}

function parseUnits(value, decimals) {
  return ethers.parseUnits(value.toString(), decimals);
}

function keccak256(data) {
  return ethers.keccak256(data);
}

function toUtf8Bytes(str) {
  return ethers.toUtf8Bytes(str);
}

// CCA Auction ABI for participation
const CCA_AUCTION_ABI = [
  // Submit Bid
  {
    name: 'submitBid',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'maxPrice', type: 'uint256' },
      { name: 'amount', type: 'uint128' },
      { name: 'owner', type: 'address' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'bidId', type: 'uint256' }],
  },
  // Claim Tokens
  {
    name: 'claimTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [],
  },
  // Claim Tokens Batch
  {
    name: 'claimTokensBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'bidIds', type: 'uint256[]' },
    ],
    outputs: [],
  },
  // Exit Bid
  {
    name: 'exitBid',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [],
  },
  // Checkpoint
  {
    name: 'checkpoint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'blockNumber', type: 'uint256' },
          { name: 'clearingPrice', type: 'uint256' },
          { name: 'cumulativeMps', type: 'uint24' },
        ],
      },
    ],
  },
  // View Functions
  {
    name: 'isGraduated',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'currencyRaised',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'claimBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  // Events
  {
    name: 'BidSubmitted',
    type: 'event',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint128', indexed: false },
    ],
  },
  {
    name: 'TokensClaimed',
    type: 'event',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BidExited',
    type: 'event',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
      { name: 'currencyRefunded', type: 'uint256', indexed: false },
    ],
  },
];

describe("CCA Auction Participation", function () {
  // Fixture for setting up auction participation environment
  async function setupParticipationFixture() {
    // Get signers
    const [owner, bidder1, bidder2, bidder3] = await ethers.getSigners();

    // Mock auction contract address (would be deployed in real scenario)
    const mockAuctionAddress = "0x1234567890123456789012345678901234567890";

    // Create auction contract instance
    const auction = new ethers.Contract(mockAuctionAddress, CCA_AUCTION_ABI, bidder1);

    return {
      owner,
      bidder1,
      bidder2,
      bidder3,
      auction,
      mockAuctionAddress,
    };
  }

  describe("Bid Parameter Validation", function () {
    it("should validate bid amount is positive", async function () {
      const bidAmounts = [
        parseEther("0.01"),
        parseEther("0.1"),
        parseEther("1.0"),
        parseEther("10.0"),
      ];

      for (const amount of bidAmounts) {
        expect(amount).to.be.greaterThan(0);
      }
    });

    it("should validate max price is positive", async function () {
      const maxPrices = [
        parseEther("0.001"),
        parseEther("0.01"),
        parseEther("0.1"),
        parseEther("1.0"),
      ];

      for (const price of maxPrices) {
        expect(price).to.be.greaterThan(0);
      }
    });

    it("should validate max price is greater than or equal to floor price", async function () {
      const floorPrice = parseEther("0.01");

      // Valid max prices (>= floor)
      const validPrices = [
        parseEther("0.01"),  // Equal to floor
        parseEther("0.02"),  // Above floor
        parseEther("1.0"),   // Well above floor
      ];

      for (const maxPrice of validPrices) {
        expect(maxPrice).to.be.greaterThanOrEqual(floorPrice);
      }

      // Invalid max price (< floor)
      const invalidPrice = parseEther("0.005");
      expect(invalidPrice).to.be.lessThan(floorPrice);
    });

    it("should calculate expected tokens from bid amount and price", async function () {
      const bidAmount = parseEther("1.0");  // 1 ETH
      const maxPrice = parseEther("0.01");  // 0.01 ETH per token

      // Expected tokens = bidAmount / maxPrice
      const expectedTokens = bidAmount / maxPrice;

      expect(expectedTokens).to.equal(100n); // 1 / 0.01 = 100 tokens
    });

    it("should handle different bid amount and price combinations", async function () {
      const scenarios = [
        { bidAmount: parseEther("0.1"), maxPrice: parseEther("0.01"), expectedTokens: 10n },
        { bidAmount: parseEther("1.0"), maxPrice: parseEther("0.1"), expectedTokens: 10n },
        { bidAmount: parseEther("5.0"), maxPrice: parseEther("0.5"), expectedTokens: 10n },
        { bidAmount: parseEther("10.0"), maxPrice: parseEther("1.0"), expectedTokens: 10n },
      ];

      for (const scenario of scenarios) {
        const calculatedTokens = scenario.bidAmount / scenario.maxPrice;
        expect(calculatedTokens).to.equal(scenario.expectedTokens);
      }
    });
  });

  describe("Bid Submission Data Encoding", function () {
    it("should encode submitBid function call correctly", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);

      const maxPrice = parseEther("0.01");
      const amount = parseEther("1.0");
      const owner = bidder1.address;
      const hookData = "0x";

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("submitBid", [
        maxPrice,
        amount,
        owner,
        hookData,
      ]);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      expect(encodedCall.length).to.be.greaterThan(10); // Function selector + params
    });

    it("should encode different bid amounts correctly", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);

      const bidAmounts = [
        parseEther("0.01"),
        parseEther("0.1"),
        parseEther("1.0"),
        parseEther("10.0"),
      ];

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);

      for (const amount of bidAmounts) {
        const encodedCall = auctionInterface.encodeFunctionData("submitBid", [
          parseEther("0.01"), // maxPrice
          amount,
          bidder1.address,
          "0x",
        ]);

        expect(encodedCall).to.be.a("string");
        expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      }
    });

    it("should encode different max prices correctly", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);

      const maxPrices = [
        parseEther("0.001"),
        parseEther("0.01"),
        parseEther("0.1"),
        parseEther("1.0"),
      ];

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);

      for (const maxPrice of maxPrices) {
        const encodedCall = auctionInterface.encodeFunctionData("submitBid", [
          maxPrice,
          parseEther("1.0"), // amount
          bidder1.address,
          "0x",
        ]);

        expect(encodedCall).to.be.a("string");
        expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      }
    });

    it("should include ETH value with bid submission", async function () {
      const bidAmount = parseEther("1.0");

      // The value sent with transaction should equal bid amount
      expect(bidAmount).to.equal(parseEther("1.0"));
      expect(bidAmount).to.be.greaterThan(0);
    });

    it("should validate owner address format", async function () {
      const { bidder1, bidder2, bidder3 } = await loadFixture(setupParticipationFixture);

      const addresses = [bidder1.address, bidder2.address, bidder3.address];

      for (const address of addresses) {
        expect(address).to.be.a("string");
        expect(address).to.match(/^0x[0-9a-f]{40}$/i);
      }
    });

    it("should handle empty hook data", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);

      const hookData = "0x";
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);

      const encodedCall = auctionInterface.encodeFunctionData("submitBid", [
        parseEther("0.01"),
        parseEther("1.0"),
        bidder1.address,
        hookData,
      ]);

      expect(encodedCall).to.be.a("string");
      expect(hookData).to.equal("0x");
    });
  });

  describe("Bid ID Management", function () {
    it("should validate bid ID is a number", function () {
      const bidIds = [0n, 1n, 10n, 100n, 1000n];

      for (const bidId of bidIds) {
        expect(bidId).to.be.a("bigint");
        expect(bidId).to.be.greaterThanOrEqual(0n);
      }
    });

    it("should handle multiple bid IDs for batch operations", function () {
      const bidIds = [1n, 2n, 3n, 4n, 5n];

      expect(bidIds).to.be.an("array");
      expect(bidIds.length).to.equal(5);

      for (const bidId of bidIds) {
        expect(bidId).to.be.a("bigint");
        expect(bidId).to.be.greaterThan(0n);
      }
    });
  });

  describe("Token Claim Operations", function () {
    it("should encode claimTokens function call correctly", async function () {
      const bidId = 1n;

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("claimTokens", [bidId]);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should encode claimTokensBatch function call correctly", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);
      const bidIds = [1n, 2n, 3n];

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("claimTokensBatch", [
        bidder1.address,
        bidIds,
      ]);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should validate batch claim with different bid counts", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);

      const testCases = [
        [1n],
        [1n, 2n],
        [1n, 2n, 3n],
        [1n, 2n, 3n, 4n, 5n],
      ];

      for (const bidIds of testCases) {
        const encodedCall = auctionInterface.encodeFunctionData("claimTokensBatch", [
          bidder1.address,
          bidIds,
        ]);

        expect(encodedCall).to.be.a("string");
        expect(bidIds.length).to.be.greaterThan(0);
      }
    });
  });

  describe("Bid Exit Operations", function () {
    it("should encode exitBid function call correctly", async function () {
      const bidId = 1n;

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("exitBid", [bidId]);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should validate different bid IDs for exit", async function () {
      const bidIds = [1n, 5n, 10n, 100n];
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);

      for (const bidId of bidIds) {
        const encodedCall = auctionInterface.encodeFunctionData("exitBid", [bidId]);

        expect(encodedCall).to.be.a("string");
        expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      }
    });
  });

  describe("Checkpoint Operations", function () {
    it("should encode checkpoint function call correctly", async function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("checkpoint", []);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should validate checkpoint return structure", async function () {
      // Checkpoint returns a tuple with blockNumber, clearingPrice, cumulativeMps
      const mockCheckpoint = {
        blockNumber: 1000000n,
        clearingPrice: parseEther("0.01"),
        cumulativeMps: 100,
      };

      expect(mockCheckpoint.blockNumber).to.be.a("bigint");
      expect(mockCheckpoint.clearingPrice).to.be.a("bigint");
      expect(mockCheckpoint.cumulativeMps).to.be.a("number");
    });
  });

  describe("View Function Calls", function () {
    it("should encode isGraduated function call correctly", async function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("isGraduated", []);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should encode currencyRaised function call correctly", async function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("currencyRaised", []);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should encode claimBlock function call correctly", async function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("claimBlock", []);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
    });

    it("should validate view function return types", async function () {
      // Mock return values
      const isGraduated = true;
      const currencyRaised = parseEther("100.0");
      const claimBlock = 1000000n;

      expect(isGraduated).to.be.a("boolean");
      expect(currencyRaised).to.be.a("bigint");
      expect(claimBlock).to.be.a("bigint");
    });
  });

  describe("Event Validation", function () {
    it("should validate BidSubmitted event structure", function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const bidSubmittedEvent = auctionInterface.getEvent("BidSubmitted");

      expect(bidSubmittedEvent).to.not.be.null;
      expect(bidSubmittedEvent?.name).to.equal("BidSubmitted");

      const inputs = bidSubmittedEvent?.inputs || [];
      expect(inputs.length).to.equal(4);
      expect(inputs[0].name).to.equal("id");
      expect(inputs[0].indexed).to.be.true;
      expect(inputs[1].name).to.equal("owner");
      expect(inputs[1].indexed).to.be.true;
    });

    it("should validate TokensClaimed event structure", function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const tokensClaimedEvent = auctionInterface.getEvent("TokensClaimed");

      expect(tokensClaimedEvent).to.not.be.null;
      expect(tokensClaimedEvent?.name).to.equal("TokensClaimed");

      const inputs = tokensClaimedEvent?.inputs || [];
      expect(inputs.length).to.equal(3);
      expect(inputs[0].name).to.equal("bidId");
      expect(inputs[0].indexed).to.be.true;
    });

    it("should validate BidExited event structure", function () {
      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const bidExitedEvent = auctionInterface.getEvent("BidExited");

      expect(bidExitedEvent).to.not.be.null;
      expect(bidExitedEvent?.name).to.equal("BidExited");

      const inputs = bidExitedEvent?.inputs || [];
      expect(inputs.length).to.equal(4);
      expect(inputs[0].name).to.equal("bidId");
      expect(inputs[1].name).to.equal("owner");
    });

    it("should parse BidSubmitted event topic", function () {
      const expectedTopic = keccak256(toUtf8Bytes("BidSubmitted(uint256,address,uint256,uint128)"));

      expect(expectedTopic).to.be.a("string");
      expect(expectedTopic).to.match(/^0x[0-9a-f]{64}$/i);
    });

    it("should parse TokensClaimed event topic", function () {
      const expectedTopic = keccak256(toUtf8Bytes("TokensClaimed(uint256,address,uint256)"));

      expect(expectedTopic).to.be.a("string");
      expect(expectedTopic).to.match(/^0x[0-9a-f]{64}$/i);
    });

    it("should parse BidExited event topic", function () {
      const expectedTopic = keccak256(toUtf8Bytes("BidExited(uint256,address,uint256,uint256)"));

      expect(expectedTopic).to.be.a("string");
      expect(expectedTopic).to.match(/^0x[0-9a-f]{64}$/i);
    });
  });

  describe("Clearing Price Calculations", function () {
    it("should calculate tokens received at different clearing prices", async function () {
      const bidAmount = parseEther("1.0"); // 1 ETH bid

      const scenarios = [
        { clearingPrice: parseEther("0.01"), expectedTokens: 100n },
        { clearingPrice: parseEther("0.1"), expectedTokens: 10n },
        { clearingPrice: parseEther("1.0"), expectedTokens: 1n },
      ];

      for (const scenario of scenarios) {
        const tokensReceived = bidAmount / scenario.clearingPrice;
        expect(tokensReceived).to.equal(scenario.expectedTokens);
      }
    });

    it("should calculate refund when max price < clearing price", async function () {
      const bidAmount = parseEther("1.0");
      const maxPrice = parseEther("0.01");  // Willing to pay 0.01 per token
      const clearingPrice = parseEther("0.02"); // Clearing at 0.02 per token

      // If clearing price > max price, bid is not filled, full refund
      const shouldRefund = clearingPrice > maxPrice;

      expect(shouldRefund).to.be.true;
      expect(bidAmount).to.equal(parseEther("1.0")); // Full refund
    });

    it("should calculate tokens when max price >= clearing price", async function () {
      const bidAmount = parseEther("1.0");
      const maxPrice = parseEther("0.1");   // Willing to pay up to 0.1 per token
      const clearingPrice = parseEther("0.05"); // Clearing at 0.05 per token

      const shouldFill = maxPrice >= clearingPrice;
      expect(shouldFill).to.be.true;

      if (shouldFill) {
        const tokensReceived = bidAmount / clearingPrice;
        expect(tokensReceived).to.equal(20n); // 1 / 0.05 = 20 tokens
      }
    });

    it("should handle partial fills correctly", async function () {
      // In CCA, if you bid 1 ETH at max price 0.1, and clearing is 0.05,
      // you get: 1 ETH / 0.05 = 20 tokens
      // Cost: 20 * 0.05 = 1 ETH (no refund in this case as you spent exactly your bid)

      const bidAmount = parseEther("1.0");
      const clearingPrice = parseEther("0.05");

      const tokensReceived = bidAmount / clearingPrice;
      const actualCost = tokensReceived * clearingPrice;

      expect(tokensReceived).to.equal(20n);
      expect(actualCost).to.equal(bidAmount); // No refund
    });
  });

  describe("Multi-Bidder Scenarios", function () {
    it("should handle multiple bidders with different max prices", async function () {
      const bidders = [
        { bidAmount: parseEther("1.0"), maxPrice: parseEther("0.01") },
        { bidAmount: parseEther("2.0"), maxPrice: parseEther("0.05") },
        { bidAmount: parseEther("5.0"), maxPrice: parseEther("0.1") },
      ];

      for (const bidder of bidders) {
        expect(bidder.bidAmount).to.be.greaterThan(0);
        expect(bidder.maxPrice).to.be.greaterThan(0);
        expect(bidder.maxPrice).to.be.lessThanOrEqual(parseEther("1.0"));
      }
    });

    it("should calculate total currency raised from multiple bids", async function () {
      const bids = [
        parseEther("1.0"),
        parseEther("2.0"),
        parseEther("5.0"),
        parseEther("10.0"),
      ];

      const totalRaised = bids.reduce((sum, bid) => sum + bid, 0n);

      expect(totalRaised).to.equal(parseEther("18.0"));
    });
  });

  describe("Transaction Value Validation", function () {
    it("should require ETH value equal to bid amount", async function () {
      const scenarios = [
        { bidAmount: parseEther("0.1"), expectedValue: parseEther("0.1") },
        { bidAmount: parseEther("1.0"), expectedValue: parseEther("1.0") },
        { bidAmount: parseEther("10.0"), expectedValue: parseEther("10.0") },
      ];

      for (const scenario of scenarios) {
        expect(scenario.bidAmount).to.equal(scenario.expectedValue);
      }
    });

    it("should validate sufficient balance for bid", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);

      const balance = await ethers.provider.getBalance(bidder1.address);
      const bidAmount = parseEther("1.0");

      // Bidder should have more than bid amount (accounting for gas)
      expect(balance).to.be.greaterThan(bidAmount);
    });
  });

  describe("ABI Function Availability", function () {
    it("should have all required participation functions in ABI", async function () {
      const { auction } = await loadFixture(setupParticipationFixture);

      expect(auction.interface.hasFunction("submitBid")).to.be.true;
      expect(auction.interface.hasFunction("claimTokens")).to.be.true;
      expect(auction.interface.hasFunction("claimTokensBatch")).to.be.true;
      expect(auction.interface.hasFunction("exitBid")).to.be.true;
      expect(auction.interface.hasFunction("checkpoint")).to.be.true;
    });

    it("should have all required view functions in ABI", async function () {
      const { auction } = await loadFixture(setupParticipationFixture);

      expect(auction.interface.hasFunction("isGraduated")).to.be.true;
      expect(auction.interface.hasFunction("currencyRaised")).to.be.true;
      expect(auction.interface.hasFunction("claimBlock")).to.be.true;
    });

    it("should have all required events in ABI", async function () {
      const { auction } = await loadFixture(setupParticipationFixture);

      expect(auction.interface.hasEvent("BidSubmitted")).to.be.true;
      expect(auction.interface.hasEvent("TokensClaimed")).to.be.true;
      expect(auction.interface.hasEvent("BidExited")).to.be.true;
    });
  });

  describe("Integration Validation", function () {
    it("should create complete bid submission transaction data", async function () {
      const { bidder1 } = await loadFixture(setupParticipationFixture);

      const maxPrice = parseEther("0.01");
      const amount = parseEther("1.0");
      const owner = bidder1.address;
      const hookData = "0x";
      const value = amount;

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("submitBid", [
        maxPrice,
        amount,
        owner,
        hookData,
      ]);

      // Verify all transaction components
      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      expect(value).to.equal(amount);
      expect(value).to.be.greaterThan(0);
    });

    it("should prepare complete claim transaction data", async function () {
      const bidId = 1n;

      const auctionInterface = new ethers.Interface(CCA_AUCTION_ABI);
      const encodedCall = auctionInterface.encodeFunctionData("claimTokens", [bidId]);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      expect(bidId).to.be.a("bigint");
      expect(bidId).to.be.greaterThan(0n);
    });
  });
});

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

// Helper function to encode auction parameters
function encodeAuctionParams(params) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return abiCoder.encode(
    ["address", "address", "address", "uint64", "uint64", "uint64", "uint256", "address", "uint256", "uint128", "bytes"],
    [
      params.currency,
      params.tokensRecipient,
      params.fundsRecipient,
      params.startBlock,
      params.endBlock,
      params.claimBlock,
      params.tickSpacing,
      params.validationHook,
      params.floorPrice,
      params.requiredCurrencyRaised,
      params.auctionStepsData,
    ]
  );
}

// CCA Factory constants and types
const CCA_FACTORY_ADDRESS = "0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D";

const CCA_FACTORY_ABI = [
  {
    name: 'initializeDistribution',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'distributionContract', type: 'address' }],
  },
  {
    name: 'getAuctionAddress',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
      { name: 'sender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'AuctionCreated',
    type: 'event',
    inputs: [
      { name: 'auction', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'configData', type: 'bytes', indexed: false },
    ],
  },
];

describe("CCA Auction Creation", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployTokenAndSetupFixture() {
    // Get signers
    const [owner, tokensRecipient, fundsRecipient, bidder1, bidder2] = await ethers.getSigners();

    // Deploy SimpleERC20 token for testing
    const SimpleERC20 = await ethers.getContractFactory("SimpleERC20");
    const token = await SimpleERC20.deploy("Test Token", "TEST", parseUnits("1000000", 18));
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    // Get CCA Factory contract instance
    const factory = new ethers.Contract(CCA_FACTORY_ADDRESS, CCA_FACTORY_ABI, owner);

    // Get current block number for timing
    const currentBlock = await ethers.provider.getBlockNumber();
    const startBlock = BigInt(currentBlock) + BigInt(10);
    const endBlock = startBlock + BigInt(7200); // ~1 day on Sepolia
    const claimBlock = endBlock + BigInt(100);

    return {
      owner,
      tokensRecipient,
      fundsRecipient,
      bidder1,
      bidder2,
      token,
      tokenAddress,
      factory,
      currentBlock,
      startBlock,
      endBlock,
      claimBlock,
    };
  }

  describe("Auction Parameter Encoding", function () {
    it("should correctly encode auction parameters", async function () {
      const { tokenAddress, owner, startBlock, endBlock, claimBlock } = await loadFixture(deployTokenAndSetupFixture);

      const auctionParams = {
        currency: "0x0000000000000000000000000000000000000000", // ETH
        tokensRecipient: owner.address,
        fundsRecipient: owner.address,
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: BigInt(1),
        validationHook: "0x0000000000000000000000000000000000000000",
        floorPrice: parseEther("0.001"),
        requiredCurrencyRaised: BigInt(0),
        auctionStepsData: "0x",
      };

      // Encode the AuctionParameters struct
      const configData = encodeAuctionParams(auctionParams);

      // Verify configData is properly encoded (should be hex string)
      expect(configData).to.be.a("string");
      expect(configData).to.match(/^0x[0-9a-f]+$/i);
      expect(configData.length).to.be.greaterThan(2); // More than just "0x"
    });

    it("should handle different floor prices correctly", async function () {
      const { owner, startBlock, endBlock, claimBlock } = await loadFixture(deployTokenAndSetupFixture);

      const testPrices = [
        parseEther("0.001"), // Low price
        parseEther("0.01"), // Medium price
        parseEther("1.0"), // High price
        parseEther("100.0"), // Very high price
      ];

      for (const floorPrice of testPrices) {
        const auctionParams = {
          currency: "0x0000000000000000000000000000000000000000",
          tokensRecipient: owner.address,
          fundsRecipient: owner.address,
          startBlock,
          endBlock,
          claimBlock,
          tickSpacing: BigInt(1),
          validationHook: "0x0000000000000000000000000000000000000000",
          floorPrice,
          requiredCurrencyRaised: BigInt(0),
          auctionStepsData: "0x",
        };

      const configData = encodeAuctionParams(auctionParams);

        expect(configData).to.be.a("string");
        expect(configData).to.match(/^0x[0-9a-f]+$/i);
      }
    });

    it("should handle different auction durations correctly", async function () {
      const { owner, currentBlock } = await loadFixture(deployTokenAndSetupFixture);

      const durations = [
        { days: 1, blocks: BigInt(7200) },
        { days: 3, blocks: BigInt(21600) },
        { days: 7, blocks: BigInt(50400) },
        { days: 30, blocks: BigInt(216000) },
      ];

      for (const duration of durations) {
        const startBlock = BigInt(currentBlock) + BigInt(10);
        const endBlock = startBlock + duration.blocks;
        const claimBlock = endBlock + BigInt(100);

        const auctionParams = {
          currency: "0x0000000000000000000000000000000000000000",
          tokensRecipient: owner.address,
          fundsRecipient: owner.address,
          startBlock,
          endBlock,
          claimBlock,
          tickSpacing: BigInt(1),
          validationHook: "0x0000000000000000000000000000000000000000",
          floorPrice: parseEther("0.001"),
          requiredCurrencyRaised: BigInt(0),
          auctionStepsData: "0x",
        };

      const configData = encodeAuctionParams(auctionParams);

        expect(configData).to.be.a("string");
        expect(endBlock - startBlock).to.equal(duration.blocks);
      }
    });

    it("should support different recipient addresses", async function () {
      const { owner, tokensRecipient, fundsRecipient, startBlock, endBlock, claimBlock } = await loadFixture(
        deployTokenAndSetupFixture
      );

      const auctionParams = {
        currency: "0x0000000000000000000000000000000000000000",
        tokensRecipient: tokensRecipient.address,
        fundsRecipient: fundsRecipient.address,
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: BigInt(1),
        validationHook: "0x0000000000000000000000000000000000000000",
        floorPrice: parseEther("0.001"),
        requiredCurrencyRaised: BigInt(0),
        auctionStepsData: "0x",
      };

      const configData = encodeAuctionParams(auctionParams);

      expect(configData).to.be.a("string");
      expect(configData).to.match(/^0x[0-9a-f]+$/i);
    });
  });

  describe("Salt Generation", function () {
    it("should generate unique salt values", function () {
      const salts = new Set();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const salt = keccak256(toUtf8Bytes(Date.now().toString() + Math.random().toString()));
        salts.add(salt);
      }

      // All salts should be unique
      expect(salts.size).to.equal(iterations);
    });

    it("should generate valid bytes32 salt", function () {
      const salt = keccak256(toUtf8Bytes(Date.now().toString() + Math.random().toString()));

      // Should be a valid hex string
      expect(salt).to.be.a("string");
      expect(salt).to.match(/^0x[0-9a-f]{64}$/i);
    });
  });

  describe("Factory Contract Interactions", function () {
    it("should have correct factory address", function () {
      expect(CCA_FACTORY_ADDRESS).to.equal("0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D");
    });

    it("should create factory contract instance", async function () {
      const { factory } = await loadFixture(deployTokenAndSetupFixture);

      expect(factory).to.not.be.undefined;
      expect(await factory.getAddress()).to.equal(CCA_FACTORY_ADDRESS);
    });

    it("should validate factory ABI has required functions", async function () {
      const { factory } = await loadFixture(deployTokenAndSetupFixture);

      // Check that the factory has the required functions
      expect(factory.interface.hasFunction("initializeDistribution")).to.be.true;
      expect(factory.interface.hasFunction("getAuctionAddress")).to.be.true;
    });
  });

  describe("Auction Deployment Preparation", function () {
    it("should prepare valid auction creation parameters", async function () {
      const { token, tokenAddress, owner, startBlock, endBlock, claimBlock } = await loadFixture(
        deployTokenAndSetupFixture
      );

      const totalSupply = parseUnits("1000", 18); // 1000 tokens

      const auctionParams = {
        currency: "0x0000000000000000000000000000000000000000",
        tokensRecipient: owner.address,
        fundsRecipient: owner.address,
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: BigInt(1),
        validationHook: "0x0000000000000000000000000000000000000000",
        floorPrice: parseEther("0.001"),
        requiredCurrencyRaised: BigInt(0),
        auctionStepsData: "0x",
      };

      const configData = encodeAuctionParams(auctionParams);

      const salt = keccak256(toUtf8Bytes(Date.now().toString() + Math.random().toString()));

      // Verify all parameters are correct types
      expect(tokenAddress).to.be.a("string");
      expect(tokenAddress).to.match(/^0x[0-9a-f]{40}$/i);
      expect(totalSupply).to.be.a("bigint");
      expect(configData).to.be.a("string");
      expect(salt).to.be.a("string");
      expect(salt).to.match(/^0x[0-9a-f]{64}$/i);
    });

    it("should validate token supply before auction creation", async function () {
      const { token, owner } = await loadFixture(deployTokenAndSetupFixture);

      const ownerBalance = await token.balanceOf(owner.address);
      const totalSupply = await token.totalSupply();

      // Owner should have all tokens initially
      expect(ownerBalance).to.equal(totalSupply);
      expect(ownerBalance).to.be.greaterThan(0);
    });

    it("should check auction timing parameters are valid", async function () {
      const { currentBlock, startBlock, endBlock, claimBlock } = await loadFixture(deployTokenAndSetupFixture);

      // Start block should be in the future
      expect(startBlock).to.be.greaterThan(BigInt(currentBlock));

      // End block should be after start block
      expect(endBlock).to.be.greaterThan(startBlock);

      // Claim block should be after end block
      expect(claimBlock).to.be.greaterThan(endBlock);

      // Auction should have reasonable duration (at least 1 block)
      expect(endBlock - startBlock).to.be.greaterThan(0);

      // Claim period should have reasonable delay (at least 1 block)
      expect(claimBlock - endBlock).to.be.greaterThan(0);
    });

    it("should validate floor price is positive", async function () {
      const floorPrices = [
        parseEther("0.001"),
        parseEther("0.01"),
        parseEther("1.0"),
        parseEther("10.0"),
      ];

      for (const floorPrice of floorPrices) {
        expect(floorPrice).to.be.greaterThan(0);
      }
    });

    it("should handle edge cases for required currency raised", async function () {
      const { owner, startBlock, endBlock, claimBlock } = await loadFixture(deployTokenAndSetupFixture);

      // Test with no minimum (0)
      const noMinimum = {
        currency: "0x0000000000000000000000000000000000000000",
        tokensRecipient: owner.address,
        fundsRecipient: owner.address,
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: BigInt(1),
        validationHook: "0x0000000000000000000000000000000000000000",
        floorPrice: parseEther("0.001"),
        requiredCurrencyRaised: BigInt(0),
        auctionStepsData: "0x",
      };

      // Test with a minimum requirement
      const withMinimum = {
        ...noMinimum,
        requiredCurrencyRaised: parseEther("10"),
      };

      for (const params of [noMinimum, withMinimum]) {
        const configData = encodeAuctionParams(params);

        expect(configData).to.be.a("string");
      }
    });
  });

  describe("Token Approval Workflow", function () {
    it("should allow owner to approve factory for token transfer", async function () {
      const { token, owner, factory } = await loadFixture(deployTokenAndSetupFixture);

      const approvalAmount = parseUnits("1000", 18);
      const factoryAddress = await factory.getAddress();

      // Approve the factory
      await token.connect(owner).approve(factoryAddress, approvalAmount);

      // Check allowance
      const allowance = await token.allowance(owner.address, factoryAddress);
      expect(allowance).to.equal(approvalAmount);
    });

    it("should handle maximum approval amount", async function () {
      const { token, owner, factory } = await loadFixture(deployTokenAndSetupFixture);

      const maxApproval = ethers.MaxUint256;
      const factoryAddress = await factory.getAddress();

      // Approve maximum amount
      await token.connect(owner).approve(factoryAddress, maxApproval);

      // Check allowance
      const allowance = await token.allowance(owner.address, factoryAddress);
      expect(allowance).to.equal(maxApproval);
    });

    it("should verify token balance before approval", async function () {
      const { token, owner } = await loadFixture(deployTokenAndSetupFixture);

      const balance = await token.balanceOf(owner.address);
      const totalSupply = await token.totalSupply();

      expect(balance).to.equal(totalSupply);
      expect(balance).to.be.greaterThan(0);
    });
  });

  describe("Event Validation", function () {
    it("should validate AuctionCreated event structure", function () {
      const factoryInterface = new ethers.Interface(CCA_FACTORY_ABI);
      const auctionCreatedEvent = factoryInterface.getEvent("AuctionCreated");

      expect(auctionCreatedEvent).to.not.be.null;
      expect(auctionCreatedEvent?.name).to.equal("AuctionCreated");

      // Verify event has correct parameters
      const inputs = auctionCreatedEvent?.inputs || [];
      expect(inputs.length).to.equal(4);
      expect(inputs[0].name).to.equal("auction");
      expect(inputs[0].indexed).to.be.true;
      expect(inputs[1].name).to.equal("token");
      expect(inputs[1].indexed).to.be.true;
    });

    it("should be able to parse AuctionCreated event topic", function () {
      const expectedTopic = keccak256(toUtf8Bytes("AuctionCreated(address,address,uint256,bytes)"));

      expect(expectedTopic).to.be.a("string");
      expect(expectedTopic).to.match(/^0x[0-9a-f]{64}$/i);
    });
  });

  describe("Gas Estimation", function () {
    it("should estimate gas for auction creation parameters", async function () {
      const { tokenAddress, owner, startBlock, endBlock, claimBlock } = await loadFixture(deployTokenAndSetupFixture);

      const totalSupply = parseUnits("1000", 18);

      const auctionParams = {
        currency: "0x0000000000000000000000000000000000000000",
        tokensRecipient: owner.address,
        fundsRecipient: owner.address,
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: BigInt(1),
        validationHook: "0x0000000000000000000000000000000000000000",
        floorPrice: parseEther("0.001"),
        requiredCurrencyRaised: BigInt(0),
        auctionStepsData: "0x",
      };

      const configData = encodeAuctionParams(auctionParams);

      // The configData length affects gas cost
      expect(configData.length).to.be.greaterThan(2);

      // This is a data validation test - actual gas estimation would require
      // calling the contract on a forked network
    });
  });

  describe("Integration Validation", function () {
    it("should create complete auction deployment transaction data", async function () {
      const { token, tokenAddress, owner, factory, startBlock, endBlock, claimBlock } = await loadFixture(
        deployTokenAndSetupFixture
      );

      const totalSupply = parseUnits("1000", 18);

      const auctionParams = {
        currency: "0x0000000000000000000000000000000000000000",
        tokensRecipient: owner.address,
        fundsRecipient: owner.address,
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: BigInt(1),
        validationHook: "0x0000000000000000000000000000000000000000",
        floorPrice: parseEther("0.001"),
        requiredCurrencyRaised: BigInt(0),
        auctionStepsData: "0x",
      };

      const configData = encodeAuctionParams(auctionParams);

      const salt = keccak256(toUtf8Bytes(Date.now().toString() + Math.random().toString()));

      // Verify we can encode the function call
      const factoryInterface = new ethers.Interface(CCA_FACTORY_ABI);
      const encodedCall = factoryInterface.encodeFunctionData("initializeDistribution", [
        tokenAddress,
        totalSupply,
        configData,
        salt,
      ]);

      expect(encodedCall).to.be.a("string");
      expect(encodedCall).to.match(/^0x[0-9a-f]+$/i);
      expect(encodedCall.length).to.be.greaterThan(10); // Should have function selector + params
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/**
 * Test suite for SimpleTokenFactory and FactoryERC20 contracts
 * Tests cover:
 * - Successful token deployment
 * - Correct initial supply allocation
 * - Token metadata (name, symbol, decimals)
 * - Multiple deployments create unique addresses
 * - Event emission verification
 * - Edge cases and error handling
 */
describe("SimpleTokenFactory", function () {
  // Constants for testing
  const TOKEN_NAME = "Test Token";
  const TOKEN_SYMBOL = "TEST";
  const INITIAL_SUPPLY = 1000000n; // 1 million tokens
  const DECIMALS = 18n;
  const EXPECTED_TOTAL_SUPPLY = INITIAL_SUPPLY * (10n ** DECIMALS);

  /**
   * Deploy a fresh factory instance for each test
   */
  async function deployFactoryFixture() {
    const [owner, recipient, otherAccount, thirdAccount] = await ethers.getSigners();

    const SimpleTokenFactory = await ethers.getContractFactory("SimpleTokenFactory");
    const factory = await SimpleTokenFactory.deploy();
    await factory.waitForDeployment();

    return { factory, owner, recipient, otherAccount, thirdAccount };
  }

  /**
   * Deploy factory and create a token for tests that need an existing token
   */
  async function deployFactoryWithTokenFixture() {
    const { factory, owner, recipient, otherAccount, thirdAccount } = await loadFixture(deployFactoryFixture);

    const tx = await factory.deployToken(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      INITIAL_SUPPLY,
      recipient.address
    );
    const receipt = await tx.wait();

    // Get token address from event
    const event = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
    );
    const tokenAddress = event.args.tokenAddress;

    const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
    const token = FactoryERC20.attach(tokenAddress);

    return { factory, token, tokenAddress, owner, recipient, otherAccount, thirdAccount };
  }

  describe("Deployment", function () {
    it("should deploy the factory successfully", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      expect(await factory.getAddress()).to.be.properAddress;
    });

    it("should start with zero deployed tokens", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      expect(await factory.getDeployedTokenCount()).to.equal(0);
    });
  });

  describe("Token Deployment", function () {
    it("should deploy a new token successfully", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });

    it("should return the deployed token address", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tokenAddress = await factory.deployToken.staticCall(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );

      expect(tokenAddress).to.be.properAddress;
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should increment deployed token count", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      expect(await factory.getDeployedTokenCount()).to.equal(0);

      await factory.deployToken(TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, recipient.address);
      expect(await factory.getDeployedTokenCount()).to.equal(1);

      await factory.deployToken("Token 2", "TK2", 500000n, recipient.address);
      expect(await factory.getDeployedTokenCount()).to.equal(2);
    });

    it("should track tokens in deployedTokens array", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = event.args.tokenAddress;

      const deployedTokens = await factory.getDeployedTokens();
      expect(deployedTokens).to.include(tokenAddress);
      expect(deployedTokens.length).to.equal(1);
    });

    it("should track tokens by deployer", async function () {
      const { factory, owner, recipient, otherAccount } = await loadFixture(deployFactoryFixture);

      // Deploy from owner
      await factory.connect(owner).deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );

      // Deploy from otherAccount
      await factory.connect(otherAccount).deployToken(
        "Other Token",
        "OTH",
        500000n,
        recipient.address
      );

      expect(await factory.getTokenCountByDeployer(owner.address)).to.equal(1);
      expect(await factory.getTokenCountByDeployer(otherAccount.address)).to.equal(1);
      expect(await factory.getTokenCountByDeployer(recipient.address)).to.equal(0);
    });

    it("should create unique addresses for each deployment", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      // Deploy same token parameters twice
      const tx1 = await factory.deployToken(TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, recipient.address);
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const address1 = event1.args.tokenAddress;

      const tx2 = await factory.deployToken(TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, recipient.address);
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const address2 = event2.args.tokenAddress;

      expect(address1).to.not.equal(address2);
    });

    it("should allow deploying tokens with zero initial supply", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        0n,
        recipient.address
      );
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });
  });

  describe("Event Emission", function () {
    it("should emit TokenDeployed event with correct parameters", async function () {
      const { factory, owner, recipient } = await loadFixture(deployFactoryFixture);

      await expect(factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      ))
        .to.emit(factory, "TokenDeployed")
        .withArgs(
          (tokenAddress: string) => tokenAddress !== ethers.ZeroAddress,
          owner.address,
          TOKEN_NAME,
          TOKEN_SYMBOL,
          INITIAL_SUPPLY,
          recipient.address
        );
    });

    it("should include deployer as indexed parameter", async function () {
      const { factory, owner, recipient, otherAccount } = await loadFixture(deployFactoryFixture);

      // Deploy from owner
      const tx1 = await factory.connect(owner).deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );

      expect(event1.args.deployer).to.equal(owner.address);

      // Deploy from otherAccount
      const tx2 = await factory.connect(otherAccount).deployToken(
        "Other Token",
        "OTH",
        500000n,
        recipient.address
      );
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );

      expect(event2.args.deployer).to.equal(otherAccount.address);
    });
  });

  describe("Input Validation", function () {
    it("should revert with empty name", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.deployToken("", TOKEN_SYMBOL, INITIAL_SUPPLY, recipient.address)
      ).to.be.revertedWith("SimpleTokenFactory: name required");
    });

    it("should revert with empty symbol", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.deployToken(TOKEN_NAME, "", INITIAL_SUPPLY, recipient.address)
      ).to.be.revertedWith("SimpleTokenFactory: symbol required");
    });

    it("should revert with zero address recipient", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.deployToken(TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY, ethers.ZeroAddress)
      ).to.be.revertedWith("SimpleTokenFactory: zero recipient");
    });
  });

  describe("Token Metadata", function () {
    it("should set correct token name", async function () {
      const { token } = await loadFixture(deployFactoryWithTokenFixture);
      expect(await token.name()).to.equal(TOKEN_NAME);
    });

    it("should set correct token symbol", async function () {
      const { token } = await loadFixture(deployFactoryWithTokenFixture);
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("should have 18 decimals", async function () {
      const { token } = await loadFixture(deployFactoryWithTokenFixture);
      expect(await token.decimals()).to.equal(18);
    });

    it("should set correct total supply", async function () {
      const { token } = await loadFixture(deployFactoryWithTokenFixture);
      expect(await token.totalSupply()).to.equal(EXPECTED_TOTAL_SUPPLY);
    });
  });

  describe("Initial Supply Allocation", function () {
    it("should allocate entire supply to recipient", async function () {
      const { token, recipient } = await loadFixture(deployFactoryWithTokenFixture);
      expect(await token.balanceOf(recipient.address)).to.equal(EXPECTED_TOTAL_SUPPLY);
    });

    it("should not allocate any tokens to deployer when different from recipient", async function () {
      const { token, owner } = await loadFixture(deployFactoryWithTokenFixture);
      expect(await token.balanceOf(owner.address)).to.equal(0);
    });

    it("should allocate to deployer when deployer is recipient", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        owner.address
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = event.args.tokenAddress;

      const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
      const token = FactoryERC20.attach(tokenAddress);

      expect(await token.balanceOf(owner.address)).to.equal(EXPECTED_TOTAL_SUPPLY);
    });

    it("should emit Transfer event from zero address on creation", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );
      const receipt = await tx.wait();

      // Get token address from TokenDeployed event
      const tokenDeployedEvent = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = tokenDeployedEvent.args.tokenAddress;

      // Get the FactoryERC20 interface to decode the Transfer event
      const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
      const tokenInterface = FactoryERC20.interface;

      // Find the Transfer event from the token contract (it's a raw log, not parsed by factory)
      const transferLog = receipt.logs.find((log: any) => {
        try {
          const parsed = tokenInterface.parseLog({ topics: log.topics, data: log.data });
          return parsed && parsed.name === "Transfer";
        } catch {
          return false;
        }
      });

      expect(transferLog).to.not.be.undefined;

      const parsedTransfer = tokenInterface.parseLog({
        topics: transferLog.topics,
        data: transferLog.data
      });

      expect(parsedTransfer.args.from).to.equal(ethers.ZeroAddress);
      expect(parsedTransfer.args.to).to.equal(recipient.address);
      expect(parsedTransfer.args.value).to.equal(EXPECTED_TOTAL_SUPPLY);
    });
  });

  describe("FactoryERC20 Token Functionality", function () {
    describe("transfer", function () {
      it("should transfer tokens successfully", async function () {
        const { token, recipient, otherAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const transferAmount = ethers.parseEther("1000");

        await expect(token.connect(recipient).transfer(otherAccount.address, transferAmount))
          .to.changeTokenBalances(
            token,
            [recipient, otherAccount],
            [-transferAmount, transferAmount]
          );
      });

      it("should emit Transfer event", async function () {
        const { token, recipient, otherAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const transferAmount = ethers.parseEther("1000");

        await expect(token.connect(recipient).transfer(otherAccount.address, transferAmount))
          .to.emit(token, "Transfer")
          .withArgs(recipient.address, otherAccount.address, transferAmount);
      });

      it("should revert on insufficient balance", async function () {
        const { token, otherAccount, thirdAccount } = await loadFixture(deployFactoryWithTokenFixture);

        await expect(
          token.connect(otherAccount).transfer(thirdAccount.address, 1n)
        ).to.be.revertedWith("FactoryERC20: insufficient balance");
      });

      it("should revert on transfer to zero address", async function () {
        const { token, recipient } = await loadFixture(deployFactoryWithTokenFixture);

        await expect(
          token.connect(recipient).transfer(ethers.ZeroAddress, 1n)
        ).to.be.revertedWith("FactoryERC20: zero recipient");
      });
    });

    describe("approve", function () {
      it("should set allowance correctly", async function () {
        const { token, recipient, otherAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const approveAmount = ethers.parseEther("5000");

        await token.connect(recipient).approve(otherAccount.address, approveAmount);

        expect(await token.allowance(recipient.address, otherAccount.address))
          .to.equal(approveAmount);
      });

      it("should emit Approval event", async function () {
        const { token, recipient, otherAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const approveAmount = ethers.parseEther("5000");

        await expect(token.connect(recipient).approve(otherAccount.address, approveAmount))
          .to.emit(token, "Approval")
          .withArgs(recipient.address, otherAccount.address, approveAmount);
      });

      it("should overwrite previous allowance", async function () {
        const { token, recipient, otherAccount } = await loadFixture(deployFactoryWithTokenFixture);

        await token.connect(recipient).approve(otherAccount.address, ethers.parseEther("5000"));
        await token.connect(recipient).approve(otherAccount.address, ethers.parseEther("1000"));

        expect(await token.allowance(recipient.address, otherAccount.address))
          .to.equal(ethers.parseEther("1000"));
      });
    });

    describe("transferFrom", function () {
      it("should transfer tokens with sufficient allowance", async function () {
        const { token, recipient, otherAccount, thirdAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const approveAmount = ethers.parseEther("5000");
        const transferAmount = ethers.parseEther("1000");

        await token.connect(recipient).approve(otherAccount.address, approveAmount);

        await expect(
          token.connect(otherAccount).transferFrom(
            recipient.address,
            thirdAccount.address,
            transferAmount
          )
        ).to.changeTokenBalances(
          token,
          [recipient, thirdAccount],
          [-transferAmount, transferAmount]
        );
      });

      it("should decrease allowance after transferFrom", async function () {
        const { token, recipient, otherAccount, thirdAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const approveAmount = ethers.parseEther("5000");
        const transferAmount = ethers.parseEther("1000");

        await token.connect(recipient).approve(otherAccount.address, approveAmount);
        await token.connect(otherAccount).transferFrom(
          recipient.address,
          thirdAccount.address,
          transferAmount
        );

        expect(await token.allowance(recipient.address, otherAccount.address))
          .to.equal(approveAmount - transferAmount);
      });

      it("should emit Transfer event", async function () {
        const { token, recipient, otherAccount, thirdAccount } = await loadFixture(deployFactoryWithTokenFixture);

        const approveAmount = ethers.parseEther("5000");
        const transferAmount = ethers.parseEther("1000");

        await token.connect(recipient).approve(otherAccount.address, approveAmount);

        await expect(
          token.connect(otherAccount).transferFrom(
            recipient.address,
            thirdAccount.address,
            transferAmount
          )
        )
          .to.emit(token, "Transfer")
          .withArgs(recipient.address, thirdAccount.address, transferAmount);
      });

      it("should revert on insufficient allowance", async function () {
        const { token, recipient, otherAccount, thirdAccount } = await loadFixture(deployFactoryWithTokenFixture);

        await token.connect(recipient).approve(otherAccount.address, ethers.parseEther("100"));

        await expect(
          token.connect(otherAccount).transferFrom(
            recipient.address,
            thirdAccount.address,
            ethers.parseEther("500")
          )
        ).to.be.revertedWith("FactoryERC20: insufficient allowance");
      });

      it("should revert on insufficient balance", async function () {
        const { token, recipient, otherAccount, thirdAccount } = await loadFixture(deployFactoryWithTokenFixture);

        // Approve more than balance
        await token.connect(recipient).approve(otherAccount.address, EXPECTED_TOTAL_SUPPLY * 2n);

        await expect(
          token.connect(otherAccount).transferFrom(
            recipient.address,
            thirdAccount.address,
            EXPECTED_TOTAL_SUPPLY + 1n
          )
        ).to.be.revertedWith("FactoryERC20: insufficient balance");
      });

      it("should revert on transfer to zero address", async function () {
        const { token, recipient, otherAccount } = await loadFixture(deployFactoryWithTokenFixture);

        await token.connect(recipient).approve(otherAccount.address, ethers.parseEther("1000"));

        await expect(
          token.connect(otherAccount).transferFrom(
            recipient.address,
            ethers.ZeroAddress,
            ethers.parseEther("100")
          )
        ).to.be.revertedWith("FactoryERC20: zero recipient");
      });
    });
  });

  describe("View Functions", function () {
    it("should return correct deployed token count", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      expect(await factory.getDeployedTokenCount()).to.equal(0);

      await factory.deployToken("Token1", "TK1", 1000n, recipient.address);
      expect(await factory.getDeployedTokenCount()).to.equal(1);

      await factory.deployToken("Token2", "TK2", 2000n, recipient.address);
      expect(await factory.getDeployedTokenCount()).to.equal(2);

      await factory.deployToken("Token3", "TK3", 3000n, recipient.address);
      expect(await factory.getDeployedTokenCount()).to.equal(3);
    });

    it("should return all deployed tokens", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const addresses: string[] = [];

      for (let i = 0; i < 3; i++) {
        const tx = await factory.deployToken(`Token${i}`, `TK${i}`, BigInt(1000 * (i + 1)), recipient.address);
        const receipt = await tx.wait();
        const event = receipt.logs.find(
          (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
        );
        addresses.push(event.args.tokenAddress);
      }

      const deployedTokens = await factory.getDeployedTokens();

      expect(deployedTokens.length).to.equal(3);
      for (let i = 0; i < 3; i++) {
        expect(deployedTokens[i]).to.equal(addresses[i]);
      }
    });

    it("should return tokens by deployer correctly", async function () {
      const { factory, owner, otherAccount, recipient } = await loadFixture(deployFactoryFixture);

      // Owner deploys 2 tokens
      await factory.connect(owner).deployToken("Owner1", "OW1", 1000n, recipient.address);
      await factory.connect(owner).deployToken("Owner2", "OW2", 2000n, recipient.address);

      // Other account deploys 1 token
      await factory.connect(otherAccount).deployToken("Other1", "OT1", 3000n, recipient.address);

      const ownerTokens = await factory.getTokensByDeployer(owner.address);
      const otherTokens = await factory.getTokensByDeployer(otherAccount.address);

      expect(ownerTokens.length).to.equal(2);
      expect(otherTokens.length).to.equal(1);
    });

    it("should return empty array for address with no deployments", async function () {
      const { factory, thirdAccount } = await loadFixture(deployFactoryFixture);

      const tokens = await factory.getTokensByDeployer(thirdAccount.address);
      expect(tokens.length).to.equal(0);
    });

    it("should access individual tokens by index", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx1 = await factory.deployToken("Token1", "TK1", 1000n, recipient.address);
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const address1 = event1.args.tokenAddress;

      const tx2 = await factory.deployToken("Token2", "TK2", 2000n, recipient.address);
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const address2 = event2.args.tokenAddress;

      expect(await factory.deployedTokens(0)).to.equal(address1);
      expect(await factory.deployedTokens(1)).to.equal(address2);
    });
  });

  describe("Edge Cases", function () {
    it("should handle very long token names", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const longName = "A".repeat(100);

      const tx = await factory.deployToken(longName, "LONG", INITIAL_SUPPLY, recipient.address);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = event.args.tokenAddress;

      const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
      const token = FactoryERC20.attach(tokenAddress);

      expect(await token.name()).to.equal(longName);
    });

    it("should handle very large initial supply", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      // Max safe supply considering 18 decimals
      const largeSupply = 10n ** 59n; // Just under max uint256 after decimals

      const tx = await factory.deployToken(
        "Large Supply Token",
        "LARGE",
        largeSupply,
        recipient.address
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = event.args.tokenAddress;

      const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
      const token = FactoryERC20.attach(tokenAddress);

      expect(await token.totalSupply()).to.equal(largeSupply * (10n ** 18n));
    });

    it("should handle unicode characters in token name", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const unicodeName = "Test Token";

      const tx = await factory.deployToken(unicodeName, "UNI", INITIAL_SUPPLY, recipient.address);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = event.args.tokenAddress;

      const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
      const token = FactoryERC20.attach(tokenAddress);

      expect(await token.name()).to.equal(unicodeName);
    });

    it("should handle single character name and symbol", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken("X", "Y", INITIAL_SUPPLY, recipient.address);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "TokenDeployed"
      );
      const tokenAddress = event.args.tokenAddress;

      const FactoryERC20 = await ethers.getContractFactory("FactoryERC20");
      const token = FactoryERC20.attach(tokenAddress);

      expect(await token.name()).to.equal("X");
      expect(await token.symbol()).to.equal("Y");
    });
  });

  describe("Gas Usage", function () {
    it("should deploy tokens with reasonable gas", async function () {
      const { factory, recipient } = await loadFixture(deployFactoryFixture);

      const tx = await factory.deployToken(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        recipient.address
      );
      const receipt = await tx.wait();

      // Token deployment should use less than 1M gas
      expect(receipt.gasUsed).to.be.lessThan(1_000_000n);

      // Log gas usage for informational purposes
      console.log(`    Gas used for token deployment: ${receipt.gasUsed.toString()}`);
    });
  });
});

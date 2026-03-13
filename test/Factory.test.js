const { expect } = require("chai");
const { ethers } = require("hardhat");

require("@nomicfoundation/hardhat-chai-matchers");

describe("Factory Contract", function () {
  let factory, tokenA, tokenB;
  let owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy factory
    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    // Deploy mock tokens
    const TokenMock = await ethers.getContractFactory("TokenA");
    tokenA = await TokenMock.deploy();
    await tokenA.waitForDeployment();
    tokenB = await TokenMock.deploy();
    await tokenB.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });
  });

  describe("Create Pair", function () {
    it("Should create a new pair", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());

      const pairAddress = await factory.getPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );

      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should emit PairCreated event", async function () {
      const tx = await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment.name === "PairCreated");
      
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(await tokenA.getAddress());
      expect(event.args[1]).to.equal(await tokenB.getAddress());
      expect(event.args[3]).to.equal(1);
    });

    it("Should fail if tokens are identical", async function () {
      await expect(
        factory.createPair(await tokenA.getAddress(), await tokenA.getAddress())
      ).to.be.revertedWith("Identical tokens");
    });

    it("Should fail if token address is zero", async function () {
      await expect(
        factory.createPair(await tokenA.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address");
    });

    it("Should fail if pair already exists", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());

      await expect(
        factory.createPair(await tokenA.getAddress(), await tokenB.getAddress())
      ).to.be.revertedWith("Pair exists");
    });

    it("Should create pair with tokens in any order", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pair1 = await factory.getPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );

      const pair2 = await factory.getPair(
        await tokenB.getAddress(),
        await tokenA.getAddress()
      );

      expect(pair1).to.equal(pair2);
    });
  });

  describe("All Pairs", function () {
    it("Should track all pairs", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());

      const length = await factory.allPairsLength();
      expect(length).to.equal(1);

      const pairAddress = await factory.allPairs(0);
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should track multiple pairs", async function () {
      const TokenC = await ethers.getContractFactory("TokenA");
      const tokenC = await TokenC.deploy();
      await tokenC.waitForDeployment();

      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      await factory.createPair(await tokenA.getAddress(), await tokenC.getAddress());

      const length = await factory.allPairsLength();
      expect(length).to.equal(2);
    });
  });

  describe("Set Router", function () {
    it("Should set router address", async function () {
      const routerAddress = addr1.address;

      await factory.setRouter(routerAddress);

      expect(await factory.router()).to.equal(routerAddress);
    });

    it("Should emit RouterSet event", async function () {
      const routerAddress = addr1.address;

      await expect(factory.setRouter(routerAddress))
        .to.emit(factory, "RouterSet")
        .withArgs(routerAddress);
    });

    it("Should only be callable by owner", async function () {
      const routerAddress = addr1.address;

      await expect(
        factory.connect(addr1).setRouter(routerAddress)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Transfer Ownership", function () {
    it("Should transfer ownership", async function () {
      await factory.transferOwnership(addr1.address);

      expect(await factory.owner()).to.equal(addr1.address);
    });

    it("Should emit OwnerChanged event", async function () {
      await expect(factory.transferOwnership(addr1.address))
        .to.emit(factory, "OwnerChanged")
        .withArgs(addr1.address);
    });

    it("Should only be callable by owner", async function () {
      await expect(
        factory.connect(addr1).transferOwnership(addr1.address)
      ).to.be.revertedWith("Not owner");
    });

    it("Should fail if new owner is zero address", async function () {
      await expect(
        factory.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address");
    });
  });

  describe("Get Pair", function () {
    it("Should return zero address for non-existent pair", async function () {
      const pairAddress = await factory.getPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );

      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return pair address after creation", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());

      const pairAddress = await factory.getPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );

      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });
  });
});

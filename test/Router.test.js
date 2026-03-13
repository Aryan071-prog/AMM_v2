const { expect } = require("chai");
const { ethers } = require("hardhat");

require("@nomicfoundation/hardhat-chai-matchers");

describe("Router Contract", function () {
  let router, factory, tokenA, tokenB, pair;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock tokens
    const TokenMock = await ethers.getContractFactory("TokenA");
    tokenA = await TokenMock.deploy();
    await tokenA.waitForDeployment();
    tokenB = await TokenMock.deploy();
    await tokenB.waitForDeployment();

    // Deploy factory
    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    // Deploy router
    const Router = await ethers.getContractFactory("Router");
    router = await Router.deploy(await factory.getAddress());
    await router.waitForDeployment();

    // Set router in factory
    await factory.setRouter(await router.getAddress());

    // Create pair
    await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pairAddress = await factory.getPair(
      await tokenA.getAddress(),
      await tokenB.getAddress()
    );
    const Pair = await ethers.getContractFactory("Pair");
    pair = Pair.attach(pairAddress);
  });

  describe("Deployment", function () {
    it("Should set correct factory address", async function () {
      expect(await router.factory()).to.equal(await factory.getAddress());
    });

    it("Should set correct owner", async function () {
      expect(await router.owner()).to.equal(owner.address);
    });
  });

  describe("Get Pair", function () {
    it("Should return pair address", async function () {
      const pairAddress = await router.getPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should return zero address for non-existent pair", async function () {
      const TokenC = await ethers.getContractFactory("TokenA");
      const tokenC = await TokenC.deploy();
      await tokenC.waitForDeployment();

      const pairAddress = await router.getPair(
        await tokenA.getAddress(),
        await tokenC.getAddress()
      );
      expect(pairAddress).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Add Liquidity", function () {
    beforeEach(async function () {
      // Approve tokens for router
      await tokenA.approve(await router.getAddress(), ethers.parseEther("10000"));
      await tokenB.approve(await router.getAddress(), ethers.parseEther("10000"));
    });

    it("Should add liquidity and mint LP tokens", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      const tx = await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountA,
        amountB,
        0,
        0,
        addr1.address
      );
      await tx.wait();

      // Check LP token balance
      const lpBalance = await pair.balanceOf(addr1.address);
      expect(lpBalance).to.be.greaterThan(0);
    });

    it("Should emit LiquidityAdded event", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      const tx = await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountA,
        amountB,
        0,
        0,
        addr1.address
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === "LiquidityAdded");

      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(owner.address); // user
      expect(event.args[1]).to.equal(await tokenA.getAddress()); // token0
      expect(event.args[2]).to.equal(await tokenB.getAddress()); // token1
      expect(event.args[3]).to.equal(amountA); // amount0
      expect(event.args[4]).to.equal(amountB); // amount1
    });

    it("Should create pair if it doesn't exist", async function () {
      const TokenC = await ethers.getContractFactory("TokenA");
      const tokenC = await TokenC.deploy();
      await tokenC.waitForDeployment();

      await tokenC.approve(await router.getAddress(), ethers.parseEther("1000"));

      const tx = await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenC.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        0,
        0,
        addr1.address
      );
      await tx.wait();

      const pairAddress = await factory.getPair(
        await tokenA.getAddress(),
        await tokenC.getAddress()
      );
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Remove Liquidity", function () {
    beforeEach(async function () {
      // Transfer tokens to addr1 first
      await tokenA.transfer(addr1.address, ethers.parseEther("10000"));
      await tokenB.transfer(addr1.address, ethers.parseEther("10000"));

      // Add initial liquidity
      await tokenA.connect(addr1).approve(await router.getAddress(), ethers.parseEther("10000"));
      await tokenB.connect(addr1).approve(await router.getAddress(), ethers.parseEther("10000"));

      await router.connect(addr1).addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("1000"),
        0,
        0,
        addr1.address
      );
    });

    it("Should remove liquidity and burn LP tokens", async function () {
      const lpBalance = await pair.balanceOf(addr1.address);

      // Approve LP tokens for router
      await pair.connect(addr1).approve(await router.getAddress(), lpBalance);

      const tx = await router
        .connect(addr1)
        .removeLiquidity(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          lpBalance,
          0,
          0,
          addr1.address
        );
      await tx.wait();

      // Check LP token balance is zero
      expect(await pair.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should return underlying tokens", async function () {
      const lpBalance = await pair.balanceOf(addr1.address);

      await pair.connect(addr1).approve(await router.getAddress(), lpBalance);

      const tokenABalanceBefore = await tokenA.balanceOf(addr1.address);
      const tokenBBalanceBefore = await tokenB.balanceOf(addr1.address);

      await router
        .connect(addr1)
        .removeLiquidity(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          lpBalance,
          0,
          0,
          addr1.address
        );

      const tokenABalanceAfter = await tokenA.balanceOf(addr1.address);
      const tokenBBalanceAfter = await tokenB.balanceOf(addr1.address);

      expect(tokenABalanceAfter).to.be.greaterThan(tokenABalanceBefore);
      expect(tokenBBalanceAfter).to.be.greaterThan(tokenBBalanceBefore);
    });
  });

  describe("Price Calculator Functions", function () {
    beforeEach(async function () {
      // Add liquidity for testing
      await tokenA.approve(await router.getAddress(), ethers.parseEther("10000"));
      await tokenB.approve(await router.getAddress(), ethers.parseEther("10000"));

      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("1000"),
        0,
        0,
        owner.address
      );
    });

    it("Should calculate correct quote", async function () {
      const amountA = ethers.parseEther("10");

      const amountB = await router.quote(
        await pair.getAddress(),
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountA
      );

      expect(amountB).to.equal(ethers.parseEther("10"));
    });

    it("Should fail with zero amount", async function () {
      await expect(
        router.quote(
          await pair.getAddress(),
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          0
        )
      ).to.be.revertedWith("Zero amount");
    });

    it("Should calculate correct getAmountOut", async function () {
      const amountIn = ethers.parseEther("10");
      const reserves = await pair.getReserves();

      const amountOut = await router.getAmountOut(
        await pair.getAddress(),
        amountIn,
        reserves[0],
        reserves[1]
      );

      // With 3% fee
      expect(amountOut).to.be.closeTo(ethers.parseEther("9.606"), ethers.parseEther("0.01"));
    });

    it("Should calculate getAmountOutForPair", async function () {
      const amountIn = ethers.parseEther("10");

      const amountOut = await router.getAmountOutForPair(
        await pair.getAddress(),
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn
      );

      expect(amountOut).to.be.greaterThan(0);
    });
  });

  describe("Swap Functions", function () {
    beforeEach(async function () {
      // Transfer tokens to addr1 first
      await tokenA.transfer(addr1.address, ethers.parseEther("10000"));
      await tokenB.transfer(addr1.address, ethers.parseEther("10000"));

      // Add initial liquidity
      await tokenA.approve(await router.getAddress(), ethers.parseEther("10000"));
      await tokenB.approve(await router.getAddress(), ethers.parseEther("10000"));

      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("1000"),
        0,
        0,
        addr1.address
      );
    });

    it("Should swap exact tokens for tokens", async function () {
      const amountIn = ethers.parseEther("10");
      const amountOutMin = 0;

      await tokenA.connect(addr1).approve(await router.getAddress(), amountIn);

      const tokenBBalanceBefore = await tokenB.balanceOf(addr1.address);

      const tx = await router
        .connect(addr1)
        .swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          addr1.address
        );
      await tx.wait();

      const tokenBBalanceAfter = await tokenB.balanceOf(addr1.address);
      expect(tokenBBalanceAfter).to.be.greaterThan(tokenBBalanceBefore);
    });

    it("Should emit Swap event", async function () {
      const amountIn = ethers.parseEther("10");

      await tokenA.connect(addr1).approve(await router.getAddress(), amountIn);

      const tx = await router
        .connect(addr1)
        .swapExactTokensForTokens(
          amountIn,
          0,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          addr1.address
        );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === "Swap");

      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(addr1.address); // sender
      expect(event.args[1]).to.equal(await tokenA.getAddress()); // tokenIn
      expect(event.args[2]).to.equal(await tokenB.getAddress()); // tokenOut
      expect(event.args[3]).to.equal(amountIn); // amountIn
      expect(event.args[4]).to.be.greaterThan(0); // amountOut
    });

    it("Should swap tokens for exact tokens", async function () {
      const amountOut = ethers.parseEther("10");
      const amountInMax = ethers.parseEther("20");

      await tokenA.connect(addr1).approve(await router.getAddress(), amountInMax);

      const tokenBBalanceBefore = await tokenB.balanceOf(addr1.address);

      const tx = await router
        .connect(addr1)
        .swapTokensForExactTokens(
          amountOut,
          amountInMax,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          addr1.address
        );
      await tx.wait();

      const tokenBBalanceAfter = await tokenB.balanceOf(addr1.address);
      expect(tokenBBalanceAfter - tokenBBalanceBefore).to.be.closeTo(amountOut, ethers.parseEther("0.01"));
    });

    it("Should fail if pair doesn't exist", async function () {
      const TokenC = await ethers.getContractFactory("TokenA");
      const tokenC = await TokenC.deploy();
      await tokenC.waitForDeployment();

      await expect(
        router.swapExactTokensForTokens(
          ethers.parseEther("10"),
          0,
          await tokenA.getAddress(),
          await tokenC.getAddress(),
          addr1.address
        )
      ).to.be.revertedWith("Pair does not exist");
    });

    it("Should fail with slippage exceeded", async function () {
      const amountIn = ethers.parseEther("10");
      const amountOutMin = ethers.parseEther("100"); // Unrealistic expectation

      await tokenA.connect(addr1).approve(await router.getAddress(), amountIn);

      await expect(
        router
          .connect(addr1)
          .swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            addr1.address
          )
      ).to.be.revertedWith("Slippage exceeded");
    });
  });
});

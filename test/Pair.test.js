const { expect } = require("chai");
const { ethers } = require("hardhat");

require("@nomicfoundation/hardhat-chai-matchers");

describe("Pair Contract", function () {
  let tokenA, tokenB, factory, pair, Pair;
  let owner, addr1, addr2;
  let token0, token1;

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

    // Create pair through factory
    await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());

    // Attach to pair
    Pair = await ethers.getContractFactory("Pair");
    pair = Pair.attach(pairAddress);

    // Get sorted tokens
    const tokenAAddress = await tokenA.getAddress();
    const tokenBAddress = await tokenB.getAddress();
    token0 = tokenAAddress < tokenBAddress ? tokenA : tokenB;
    token1 = tokenAAddress < tokenBAddress ? tokenB : tokenA;
  });

  describe("Initialization", function () {
    it("Should have correct token addresses", async function () {
      expect(await pair.token0()).to.equal(await token0.getAddress());
      expect(await pair.token1()).to.equal(await token1.getAddress());
    });

    it("Should have correct name and symbol", async function () {
      expect(await pair.name()).to.equal("AMM V2 LP Token");
      expect(await pair.symbol()).to.equal("AMM-LP");
      expect(await pair.decimals()).to.equal(18);
    });
  });

  describe("Adding Liquidity", function () {
    it("Should mint LP tokens on first deposit", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      // Transfer tokens to pair
      await tokenA.transfer(await pair.getAddress(), amountA);
      await tokenB.transfer(await pair.getAddress(), amountB);

      // Mint liquidity
      await pair.mint(addr1.address);

      const lpBalance = await pair.balanceOf(addr1.address);
      expect(lpBalance).to.be.greaterThan(0);

      // Check reserves
      const reserves = await pair.getReserves();
      expect(reserves[0]).to.equal(amountA);
      expect(reserves[1]).to.equal(amountB);
    });

    it("Should lock minimum liquidity", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      await tokenA.transfer(await pair.getAddress(), amountA);
      await tokenB.transfer(await pair.getAddress(), amountB);

      await pair.mint(addr1.address);

      // Check that minimum liquidity is locked to address(1)
      const lockedLiquidity = await pair.balanceOf("0x0000000000000000000000000000000000000001");
      expect(lockedLiquidity).to.be.greaterThan(0);
    });

    it("Should mint proportional LP tokens on subsequent deposits", async function () {
      // First deposit
      const amountA1 = ethers.parseEther("100");
      const amountB1 = ethers.parseEther("100");

      await tokenA.transfer(await pair.getAddress(), amountA1);
      await tokenB.transfer(await pair.getAddress(), amountB1);
      await pair.mint(addr1.address);

      const lpBalance1 = await pair.balanceOf(addr1.address);

      // Second deposit (same ratio)
      const amountA2 = ethers.parseEther("50");
      const amountB2 = ethers.parseEther("50");

      await tokenA.transfer(await pair.getAddress(), amountA2);
      await tokenB.transfer(await pair.getAddress(), amountB2);
      await pair.mint(addr1.address);

      const lpBalance2 = await pair.balanceOf(addr1.address);
      expect(lpBalance2).to.be.greaterThan(lpBalance1);
    });
  });

  describe("Removing Liquidity", function () {
    beforeEach(async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      await tokenA.transfer(await pair.getAddress(), amountA);
      await tokenB.transfer(await pair.getAddress(), amountB);
      await pair.mint(addr1.address);
    });

    it("Should burn LP tokens and return underlying tokens", async function () {
      const lpBalance = await pair.balanceOf(addr1.address);
      const totalSupply = await pair.totalSupply();

      // Burn liquidity
      await pair.connect(addr1).burn(addr1.address);

      // Check LP token balance is zero
      expect(await pair.balanceOf(addr1.address)).to.equal(0);

      // Check tokens were transferred back
      const tokenABalance = await tokenA.balanceOf(addr1.address);
      const tokenBBalance = await tokenB.balanceOf(addr1.address);

      expect(tokenABalance).to.be.greaterThan(0);
      expect(tokenBBalance).to.be.greaterThan(0);
    });

    it("Should fail if trying to burn more than balance", async function () {
      // Transfer all LP tokens to another address
      const lpBalance = await pair.balanceOf(addr1.address);
      await pair.connect(addr1).transfer(addr2.address, lpBalance);

      // Try to burn with zero balance
      await expect(pair.connect(addr1).burn(addr1.address)).to.be.revertedWith(
        "Zero liquidity"
      );
    });
  });

  describe("Swapping", function () {
    beforeEach(async function () {
      // Add initial liquidity
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("1000");

      await tokenA.transfer(await pair.getAddress(), amountA);
      await tokenB.transfer(await pair.getAddress(), amountB);
      await pair.mint(addr1.address);

      // Transfer tokens to addr1 for swapping
      await tokenA.transfer(addr1.address, ethers.parseEther("100"));
      await tokenB.transfer(addr1.address, ethers.parseEther("100"));
    });

    it("Should swap tokenA for tokenB", async function () {
      const swapAmount = ethers.parseEther("10");
      const token0Address = await pair.token0();
      const token1Address = await pair.token1();

      // Determine which token is which
      const isTokenAToken0 = token0Address === await tokenA.getAddress();

      // inputToken is the token we're swapping FROM (sending to pair)
      // outputToken is the token we're swapping TO (receiving from pair)
      const inputToken = isTokenAToken0 ? tokenA : tokenB;
      const outputToken = isTokenAToken0 ? tokenB : tokenA;

      // Transfer input tokens to pair first
      await inputToken.connect(addr1).transfer(await pair.getAddress(), swapAmount);

      // Calculate expected output
      const reserves = await pair.getReserves();
      const reserveIn = isTokenAToken0 ? reserves[0] : reserves[1];
      const reserveOut = isTokenAToken0 ? reserves[1] : reserves[0];

      const amountOut = await pair.getAmountOut(swapAmount, reserveIn, reserveOut);

      // Execute swap - tokens already in pair, no need for transferFrom
      const amount0Out = isTokenAToken0 ? 0n : amountOut;
      const amount1Out = isTokenAToken0 ? amountOut : 0n;

      await pair.connect(addr1).swap(amount0Out, amount1Out, addr2.address);

      // Check output token was received
      const outputBalance = await outputToken.balanceOf(addr2.address);
      expect(outputBalance).to.be.closeTo(amountOut, ethers.parseEther("0.0001"));
    });

    it("Should fail if k decreases", async function () {
      const swapAmount = ethers.parseEther("10");

      // Try to swap without providing input tokens
      await expect(pair.connect(addr1).swap(swapAmount, 0, addr1.address)).to.be.reverted;
    });

    it("Should fail if swapping to pair address", async function () {
      await expect(pair.connect(addr1).swap(ethers.parseEther("10"), 0, await pair.getAddress())).to.be
        .reverted;
    });
  });

  describe("Get Amount Out", function () {
    it("Should calculate correct output amount", async function () {
      const amountIn = ethers.parseEther("10");
      const reserveIn = ethers.parseEther("1000");
      const reserveOut = ethers.parseEther("1000");

      const amountOut = await pair.getAmountOut(amountIn, reserveIn, reserveOut);

      // With 3% fee: amountInAfterFee = 10 * 0.97 = 9.7
      // amountOut = (1000 * 9.7) / (1000 + 9.7) = 9700 / 1009.7 ≈ 9.606
      expect(amountOut).to.be.closeTo(ethers.parseEther("9.606"), ethers.parseEther("0.01"));
    });

    it("Should fail with zero amount", async function () {
      await expect(
        pair.getAmountOut(0, ethers.parseEther("1000"), ethers.parseEther("1000"))
      ).to.be.revertedWith("Zero amount");
    });
  });

  describe("LP Token Transfers", function () {
    beforeEach(async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("100");

      await tokenA.transfer(await pair.getAddress(), amountA);
      await tokenB.transfer(await pair.getAddress(), amountB);
      await pair.mint(addr1.address);
    });

    it("Should transfer LP tokens", async function () {
      const lpBalance = await pair.balanceOf(addr1.address);
      const transferAmount = ethers.parseEther("10");

      await pair.connect(addr1).transfer(addr2.address, transferAmount);

      expect(await pair.balanceOf(addr1.address)).to.equal(lpBalance - transferAmount);
      expect(await pair.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should approve and transferFrom LP tokens", async function () {
      const transferAmount = ethers.parseEther("10");

      await pair.connect(addr1).approve(addr2.address, transferAmount);
      await pair
        .connect(addr2)
        .transferFrom(addr1.address, addr2.address, transferAmount);

      expect(await pair.balanceOf(addr2.address)).to.equal(transferAmount);
    });
  });
});

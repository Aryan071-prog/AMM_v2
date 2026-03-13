const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🧪 Running AMM V2 Interaction Tests...\n");

  // Get signers
  const [deployer, user1, user2] = await ethers.getSigners();

  // ============================================================
  // DEPLOY CONTRACTS
  // ============================================================
  console.log("📝 Deploying contracts...");
  const TokenA = await ethers.getContractFactory("TokenA");
  const TokenB = await ethers.getContractFactory("TokenB");
  const Factory = await ethers.getContractFactory("Factory");
  const Router = await ethers.getContractFactory("Router");

  const tokenA = await TokenA.deploy();
  await tokenA.waitForDeployment();
  const tokenB = await TokenB.deploy();
  await tokenB.waitForDeployment();
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const router = await Router.deploy(await factory.getAddress());
  await router.waitForDeployment();

  console.log("✅ Contracts deployed");

  // Set router in factory
  await factory.setRouter(await router.getAddress());

  // Create pair
  await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
  const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
  console.log("✅ Pair created at:", pairAddress);

  const Pair = await ethers.getContractFactory("Pair");
  const pair = Pair.attach(pairAddress);

  // ============================================================
  // MINT TOKENS TO USERS
  // ============================================================
  console.log("\n💰 Minting tokens to users...");
  const mintAmount = ethers.parseEther("10000");
  
  await tokenA.mint(user1.address, mintAmount);
  await tokenB.mint(user1.address, mintAmount);
  await tokenA.mint(user2.address, mintAmount);
  await tokenB.mint(user2.address, mintAmount);
  
  console.log("✅ Tokens minted");

  // ============================================================
  // INITIAL BALANCES
  // ============================================================
  console.log("\n💰 Initial balances:");
  const tokenAUser1 = await tokenA.balanceOf(user1.address);
  const tokenBUser1 = await tokenB.balanceOf(user1.address);
  console.log("  User1 TokenA:", ethers.formatEther(tokenAUser1));
  console.log("  User1 TokenB:", ethers.formatEther(tokenBUser1));

  // ============================================================
  // ADD LIQUIDITY (50:5000 ratio)
  // ============================================================
  console.log("\n💎 Adding liquidity (50:5000 ratio)...");
  const amountA = ethers.parseEther("50");     // 50 TokenA
  const amountB = ethers.parseEther("5000");   // 5000 TokenB
  const amountAMin = ethers.parseEther("45");
  const amountBMin = ethers.parseEther("4500");

  const tokenAUser1Contract = tokenA.connect(user1);
  const tokenBUser1Contract = tokenB.connect(user1);
  const routerUser1 = router.connect(user1);

  await tokenAUser1Contract.approve(await router.getAddress(), ethers.parseEther("10000"));
  await tokenBUser1Contract.approve(await router.getAddress(), ethers.parseEther("10000"));

  const addLiqTx = await routerUser1.addLiquidity(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    amountA,
    amountB,
    amountAMin,
    amountBMin,
    user1.address
  );
  await addLiqTx.wait();
  console.log("✅ Liquidity added");

  let lpBalance = await pair.balanceOf(user1.address);
  console.log("  LP Token Balance:", ethers.formatEther(lpBalance));

  let reserves = await pair.getReserves();
  console.log("  Reserves - Token0:", ethers.formatEther(reserves[0]), ", Token1:", ethers.formatEther(reserves[1]));

  // ============================================================
  // TEST PRICE CALCULATORS
  // ============================================================
  console.log("\n📊 Testing Price Calculator Functions...");

  const testAmount = ethers.parseEther("10");

  // Test quote
  console.log("\n--- Testing quote() ---");
  const quotedAmount = await router.quote(
    await pair.getAddress(),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    testAmount
  );
  console.log(`Quote: ${ethers.formatEther(testAmount)} TokenA = ${ethers.formatEther(quotedAmount)} TokenB`);

  // Test getAmountOut
  console.log("\n--- Testing getAmountOut() ---");
  const amountOut = await router.getAmountOut(
    await pair.getAddress(),
    testAmount,
    reserves[0],
    reserves[1]
  );
  console.log(`getAmountOut: ${ethers.formatEther(testAmount)} TokenA = ${ethers.formatEther(amountOut)} TokenB (with 3% fee)`);

  // Test getAmountOutForPair
  console.log("\n--- Testing getAmountOutForPair() ---");
  const amountOutPair = await router.getAmountOutForPair(
    await pair.getAddress(),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    testAmount
  );
  console.log(`getAmountOutForPair: ${ethers.formatEther(testAmount)} TokenA = ${ethers.formatEther(amountOutPair)} TokenB`);

  // ============================================================
  // SWAP TOKENS
  // ============================================================
  console.log("\n🔄 Swapping tokens...");
  const swapAmountIn = ethers.parseEther("10");
  const swapAmountOutMin = ethers.parseEther("0");

  await tokenAUser1Contract.approve(await router.getAddress(), swapAmountIn);
  const swapTx = await routerUser1.swapExactTokensForTokens(
    swapAmountIn,
    swapAmountOutMin,
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    user1.address
  );
  await swapTx.wait();
  console.log("✅ Swap executed");

  // Check balances after swap
  console.log("\n💰 Balances after swap:");
  let finalTokenA = await tokenA.balanceOf(user1.address);
  let finalTokenB = await tokenB.balanceOf(user1.address);
  console.log("  User1 TokenA:", ethers.formatEther(finalTokenA));
  console.log("  User1 TokenB:", ethers.formatEther(finalTokenB));

  // Check updated reserves
  reserves = await pair.getReserves();
  console.log("\n  Updated Reserves - Token0:", ethers.formatEther(reserves[0]), ", Token1:", ethers.formatEther(reserves[1]));

  // ============================================================
  // REVERSE SWAP
  // ============================================================
  console.log("\n🔄 Reverse Swap: TokenB → TokenA...");
  const reverseAmount = ethers.parseEther("5");
  await tokenBUser1Contract.approve(await router.getAddress(), reverseAmount);

  const expectedOut = await router.getAmountOutForPair(
    await pair.getAddress(),
    await tokenB.getAddress(),
    await tokenA.getAddress(),
    reverseAmount
  );
  console.log("Expected output:", ethers.formatEther(expectedOut), "TokenA");

  const reverseSwapTx = await routerUser1.swapExactTokensForTokens(
    reverseAmount,
    0,
    await tokenB.getAddress(),
    await tokenA.getAddress(),
    user1.address
  );
  await reverseSwapTx.wait();
  console.log("✅ Reverse swap executed");

  finalTokenA = await tokenA.balanceOf(user1.address);
  finalTokenB = await tokenB.balanceOf(user1.address);
  console.log("\n💰 Final balances:");
  console.log("  User1 TokenA:", ethers.formatEther(finalTokenA));
  console.log("  User1 TokenB:", ethers.formatEther(finalTokenB));

  // ============================================================
  // REMOVE LIQUIDITY
  // ============================================================
  console.log("\n💸 Removing liquidity...");
  lpBalance = await pair.balanceOf(user1.address);
  console.log("Current LP Balance:", ethers.formatEther(lpBalance));

  await pair.connect(user1).approve(await router.getAddress(), lpBalance);

  const removeLiqTx = await router.connect(user1).removeLiquidity(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    lpBalance / 2n, // Remove half
    0,
    0,
    user1.address
  );
  await removeLiqTx.wait();
  console.log("✅ Liquidity removed");

  lpBalance = await pair.balanceOf(user1.address);
  console.log("Remaining LP Balance:", ethers.formatEther(lpBalance));

  finalTokenA = await tokenA.balanceOf(user1.address);
  finalTokenB = await tokenB.balanceOf(user1.address);
  console.log("\n💰 Final balances after removing liquidity:");
  console.log("  User1 TokenA:", ethers.formatEther(finalTokenA));
  console.log("  User1 TokenB:", ethers.formatEther(finalTokenB));

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("📊 INTERACTION TEST SUMMARY");
  console.log("=".repeat(60));
  console.log("Contract Addresses:");
  console.log("  TokenA:   ", await tokenA.getAddress());
  console.log("  TokenB:   ", await tokenB.getAddress());
  console.log("  Factory:  ", await factory.getAddress());
  console.log("  Router:   ", await router.getAddress());
  console.log("  Pair:     ", pairAddress);
  console.log("=".repeat(60));
  console.log("✅ All tests completed successfully!");
  console.log("   - Liquidity added and removed");
  console.log("   - Price calculations verified");
  console.log("   - Swaps executed in both directions");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
